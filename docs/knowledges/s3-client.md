# S3 传输层：为什么自己写、怎么验证

本文记录 E2EE 同步的 S3 传输层（`packages/sync-core/src/s3Client.ts`）的取舍与验证方式，
以及 2026-11-06 用真实 S3 行为服务端做协议一致性验证后修掉的三个缺陷。

## 结论先讲

- **运行时继续用自己写的最小客户端**（5 个操作：GET / PUT / HEAD / DELETE / ListObjectsV2），
  不引入 `@aws-sdk/client-s3`。
- **验证端交给真实 S3 语义**：`fakes3`（`fakes3-sdk`，Node 进程内、`auth: true` 校验 SigV4）
  当被测服务端，`@aws-sdk/client-s3` 当独立的第二客户端做交叉读写。两者都只作为 devDependency。
- 这两个依赖**不进扩展产物**：`npm run build` 后 `dist/assets/background.js-*.js` 仍是
  114 kB / gzip 40 kB，与改造前一致。

## 为什么不把运行时换成 AWS SDK

用 esbuild 实测（2026-11-06，`--bundle --minify --platform=browser`，只引用
`PutObjectCommand` / `GetObjectCommand` / `ListObjectsV2Command`）：

| 方案 | minified | gzip |
|---|---|---|
| `@aws-sdk/client-s3`（3 个 command） | 261.1 kB | 84.0 kB |
| 自己写的 `s3Client.ts`（全量打包） | 5.6 kB | 2.5 kB |
| 整个 background service worker（现状） | 114.5 kB | 39.8 kB |

再加环境与契约上的原因：

- **MV3 service worker 体积=冷启动成本**：SDK 单独就超过整个 SW 的 2 倍，且 SW 会被频繁
  唤醒/重启。同步是后台常驻路径，不是按需加载的页面。
- **`@myz/sync-core` 要保持环境无关**：只依赖 WebCrypto + `fetch`，桌面/Node 宿主可以直接
  复用；AWS SDK 会把它绑到 Node/browser 的运行时探测与 SMITHY 中间件栈上。
- **端点策略是我们自己的安全边界**：`isAllowedEndpoint` 只允许 HTTPS（回环地址的 HTTP 例外），
  SDK 默认不提供等价约束，需要额外中间件才能保证。
- **需要的能力只有 5 个 REST 动作**，其中 3 个（条件写、条件删、列表分页）已经由契约测试
  逐条盯住；引入 SDK 换来的是用不到的 multipart/流式/重试/凭证链。

代价是我们自己承担 SigV4 与 XML 解析的正确性——这是下一节要解决的问题。

## 验证方式

### 1. 传输契约测试（Playwright，CI 会跑）

`myz-annotator/tests/transport/s3-client.spec.ts` 直接用 `@myz/sync-core/s3Client` 打
`fakes3`，覆盖：

- SigV4 真被校验（错误 secret → 403）；
- 普通/含空格、`+`、`&`、非 ASCII 的 key 往返，ETag 与 AWS SDK 读回一致；
- 配置的 `prefix` 同时作用于写路径与列表；
- `If-None-Match: *` / `If-Match` 的 412 语义、条件删除、幂等删除；
- 列表分页（>1000 keys 全部取回）；
- 缺失 bucket / 缺失 key 的降级（`[]` / `null`）。

### 2. 端到端（Playwright，CI 会跑）

`myz-annotator/tests/extension/sync-s3-transport.spec.ts` 原来跑在自己写的 mock S3 上
（那个 mock 只按我们的假设实现，且忽略签名）。现在跑在 `fakes3` + `auth: true` 上：

- 双 profile 配对、同步、删除 tombstone 传播；
- 首次运行向导三条分支（新建 / 授权 / 加入）；
- 「上传的是密文」这条断言改由 AWS SDK 读取对象字节验证——明文不得出现在任何对象里。

服务端 fixture 在 `myz-annotator/tests/helpers/fake-s3.ts`：启动 fakes3、建 bucket、
提供 AWS SDK 侧的 `listKeys` / `readObject` / `seedObject`。AWS SDK 在这里是**独立的第二
实现**，不用我们的客户端自证。

> fakes3 是测试期依赖（MIT，按平台预编译原生二进制，Node ≥18）。它只监听 127.0.0.1，
> 不要暴露到不受信任的网络，也不要用它存真实数据。

### 3. 单元测试（`packages/sync-core`）

`tests/s3Client.test.ts` 用 stub 的 `fetch` 盯解析器：`<Contents>` 字段顺序无关、XML 实体
解码、`IsTruncated` + `NextContinuationToken` 翻页、404 → `[]`。

## 这轮验证抓到的三个真缺陷

1. **列表解析假定字段顺序**：旧的正则要求
   `Key → LastModified → ETag → Size` 连续出现。fakes3（基于 s3s）按字母序输出
   `ETag → Key → LastModified → Size → StorageClass`，于是**任何对象都解析不出来**，
   列表静默返回 `[]`。已改为逐字段匹配 + 实体解码。
2. **路径被二次百分号编码**：`canonicalizePath` 对已经是 percent-encoded 的
   `url.pathname` 再 `encodeURIComponent` 一次（`%20` → `%2520`），签名与实际请求不一致，
   key 里一旦有空格/非 ASCII 就是 403。已改为「先解码再按 SigV4 规则编码」，并让建 URL 与
   签名共用同一个编码器。
3. **列表不分页**：超过 1000 个 key 时只拿到第一页，`findLatestManifest` 可能读到旧的
   manifest、GC 可能漏删。已按 `IsTruncated` / `NextContinuationToken` 翻页。

前两条正是「自己写 mock 自己测」测不出来的：旧 mock 的 XML 顺序、ETag 形状都是照着我们的
解析器写的，签名也被忽略。

## 复跑

```bash
# 传输契约 + 同步 e2e（Playwright；需要先 npm run build）
cd myz-annotator
npx playwright test tests/transport tests/extension/sync-s3-transport.spec.ts \
  --config=tests/playwright.config.ts --reporter=list

# 解析器单测
cd packages/sync-core && npm test
```

## 相关

- `packages/sync-core/src/s3Client.ts` — 传输实现
- `packages/sync-core/src/adapters.ts` — `SyncObjectStore` 端口（换宿主只需实现它）
- `myz-annotator/tests/helpers/fake-s3.ts` — fakes3 + AWS SDK fixture
