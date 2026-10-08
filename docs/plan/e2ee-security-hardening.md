# E2EE 安全加固与设备绑定计划

> 状态：**已审核通过并实施**（第二轮 review 修复见 §10）。完成情况见文末「实施状态」。
>
> 配套文档：`docs/plan/e2ee-sync-evolution.md`（流化/可扩展/性能与协议演进）。本计划负责**安全模型**：设备绑定、密钥派生强化、抗回滚、轮换完整性、本地密钥与凭证保护、消息授权、锁正确性、完整性校验。
>
> **关键顺序约束**：设备绑定会改变数据加密根（由 A 派生改为随机数据密钥 D + 设备公钥包裹）与 manifest 签名主体，因此**必须在冻结子流 v1 的密钥/协议格式之前定案**；否则子流格式会再改一次。

## 1. 目的与范围

- 把“已证实缺陷与风险”（T1–T14）逐条复核后，可修的全部纳入。
- 引入设备绑定：A 只用于账号寻址与注册认证，不再直接解密；数据密钥 D 只被已授权设备公钥包裹。
- 明确哪些是 break change，哪些是可独立先发布的 quick win。

## 2. 逐条复核（先确认事实与价值）

| # | 原判断 | 结论 | 修正与价值 |
| --- | --- | --- | --- |
| T1 | 固定盐 PBKDF2 10 万次 + 公开 keyId = 离线口令校验 oracle | **确认（可消除）** | 采纳反驳：`accountId` 改为**随机生成、由配对传递**，A 不再派生账号地址，oracle 消失；A 仅用于注册请求认证。KDF 强化仍用于本地解锁与请求认证 |
| T2 | 无抗回滚，旧签名 manifest 可重放 | **确认** | `syncEngine.buildSyncPlan` 不校验 `state.lastManifestVersion` 下界；新客户端可强制，旧端只能尽力。价值高 |
| T3 | 轮换只写 notice，不重加密/清理 | **部分确认** | 本地记录会在下次同步**自动重传到新 keyId**（`collectLocalRecords` 与 key 无关），所以不是“数据滞留”；真正缺陷是**旧 keyId 密文从不清理**、无迁移/清理步骤。价值中高 |
| T4 | S3 凭证明文存 `chrome.storage.local` | **确认** | 无加密/AAD（settings schema v1、`background/storage.ts`）。价值中；与 E2EE 姿态不一致 |
| T5 | 特权消息无 sender 校验 | **确认，且升级** | `background.ts:143` 统一分发、sync 处理器忽略 sender。影响不止 DoS：`myz:syncSetKey` 接受任意 `secret`（`messages/sync.ts:104-124`），被攻破的 content script 可把账号**重新密钥到攻击者已知的密钥**，攻击者可推导新密钥并解密后续上传 → 机密性提升。价值高 |
| T6 | 锁不续租 + 无条件释放 | **确认** | `lock.ts:15,58-63`、`syncEngine.ts:144-149` 无续租、无 owner 校验。价值中 |
| T7 | manifest 的 chunk hash/size/nonce 与链头存而不验 | **确认（防御纵深）** | AEAD+签名已保机密/完整；价值在于检测分叉/篡改与支撑回滚防护。价值中 |
| T8 | 记录密钥在 (id,updatedAt,prevHash) 复用时复用 | **部分（低）** | 触发条件苛刻；作为硬化项。价值低 |
| T9 | AES-GCM 非 key-committing | **确认（理论）** | 记录密钥由签名的 manifest/chunkId 绑定，实际可利用性低。价值低 |
| T10 | 不强制 HTTPS | **确认** | `s3Client.ts:32,51-54` 原样使用 endpoint。价值中（廉价） |
| T11 | 本地 keyset 无 AAD 绑定 keyId/epoch | **确认（低）** | `keyring.ts:70-77` keyId 在 AEAD 之外。价值低 |
| T12 | 元数据泄露（keyId 可识别账号、updatedAt 暴露活动） | **确认（低）** | 部分缓解或记录为接受。价值低 |
| T13 | 无前向保密；密钥不 zeroize | **确认** | 设备绑定后“A 即全解”不成立，主要风险下降；zeroize 价值低 |
| T14 | 协议无法演进、新类型被旧端删除 | **确认** | 由 `e2ee-sync-evolution.md` 覆盖 |
| — | 设备绑定（注册 A 派生的数据密钥到设备） | **设计可行** | 见 §4；与 T2/T5 强相关 |

## 3. 目标安全模型

```text
A（高熵） ──Argon2id──> accountKey ──> accountId（S3 根，用于寻址）
                                          │
设备 Di：Ed25519(sign) + X25519(agree)，私钥用本地 DK 包裹
                                          │
数据密钥 D（每个 epoch 随机 32B） ── 被各设备 agree 公钥 ECIES 包裹，存于 roster
                                          │
内容/manifest/chunk 密钥 = HKDF(D, …)（替换现有 HKDF(C, …)）
manifest 由发布设备的 Ed25519 签名；接收方用 roster 中已授权设备公钥验签
```

- A 不再解密；只用于账号寻址与注册请求认证。
- **已定（无 A-only 恢复）**：D 只被设备公钥包裹，不存 A 包裹的托管副本；所有设备丢失即数据不可恢复。
- **已定（非严格前向保密）**：不引入 MLS/ratchet；目标仅为“A 单独不能直接得到 D”，设备绑定即可满足。
- 撤销设备：生成 D'（epoch+1），只包裹给剩余设备 → 被移除设备读不到未来（读侧 PCS）。
- 写权限撤销的可行性判定见 §5.10（纯 S3 不可行，需服务端或每设备凭证）。

## 4. 设备注册协议（只用 S3，异步）

控制面（极小，不依赖内容同步）：

```text
<accountId>/devices/
  index.bin                 # 【必须签名】单调指针：rosterVersion + 最新 requestId
  roster.bin                # { rosterVersion, epoch, devices[{deviceId, signPub, agreePub, addedAt, addedBy, revokedAt?}],
                            #   wrappedD[{deviceId, ephPub, nonce, cipher}] } + 已授权设备签名
  requests/<requestId>.bin  # { accountId, signPub, agreePub, deviceId, name, createdAt, expiresAt } + 请求签名
  acks/<deviceId>.bin       # 可选投递确认
```

**安全锚**：`index.bin` 与请求对象都必须签名，且 anti-rollback 只依赖**已签名 roster 的单调 `rosterVersion`**（客户端 high-water），不得让未签名对象承载发现或防回滚语义；发现请求时同时校验请求签名与对象内 `accountId`。

**路径 1（同机，默认）**：二维码必须包含 **`accountId` + D1 的 `signPub` 指纹**；D2 生成密钥对 → D1 出二维码（临时 X25519 公钥 + nonce）→ 双方 ECDH+HKDF 得一次性 KEK → 交换公钥并显示短校验码（SAS）人工比对防中间人 → D1 用 KEK 加密 D 并加入 roster。D2 以二维码中的 `accountId` 寻址、以 `signPub` 指纹为信任锚。

**路径 2（异地，S3 邮箱）**：D2 用 `HKDF(A,"device-request")` 加密请求、IK2 签名，写 `requests/`；D1 下次同步读 `index.bin` 发现请求，用户比对短码后批准，**在同步锁内**用 ECIES 包裹 D 给 IK2、签名更新 roster；D2 轮询取回。

要点：请求必须由 IK2 签名且两端显示同一短码（防换钥）；审批必须由已授权设备发起（A 不自动批准）；registry 更新在锁内用 `If-Match` 做 CAS；rosterVersion 单调并纳入抗回滚。

## 5. 具体修复方案

### 5.1 账号标识与密钥派生（T1）
- **`accountId` 随机生成**（不由 A 派生），通过配对/QR 传给新设备；口令 oracle 随之消失，A 不再能定位账号或验证猜测。
- A 仅用于**注册请求认证**（可选进一步弱化）；本地解锁用独立口令 + Argon2id（或 PBKDF2 ≥600k）。
- 记录“A 不承担寻址与解密”的角色边界，避免回退到 A 派生标识。
- 若确实需要用户可输入、可寻址的标识，则必须接受 oracle，用高熵 + 重 KDF 压低爆破收益；本计划默认不采用。

### 5.2 manifest 签名改为按设备（设备绑定的一部分）
- 发布设备用自己的 Ed25519 签 manifest；接收方用 roster 验签；genesis 自签，后续条目由已授权设备签。
- 替换现有 `sealPublicKey/verifySealedPublicKey` 的单 B1 模型（roster 取代 keyseal）。

### 5.3 抗回滚（T2）
- roster 与每个流 manifest 带单调计数器；客户端保存 high-water mark，拒绝低于它的版本。
- 主流程旧客户端无法强制，但新客户端对主流也做“拒绝更低 version”的尽力校验。

### 5.4 轮换完整性（T3）
- 轮换流程显式：生成 D' → 重包裹给当前设备 → 更新 roster → **删除/归档旧 keyId 与旧 epoch 密文**；记录清理完成状态。
- 明确旧数据是否重加密（可选，成本高）与保留窗口。

### 5.5 本地密钥与凭证保护（T4、T11）
- S3 `secretAccessKey/sessionToken` 用设备密钥加密后存 `chrome.storage.local`（或存 IndexedDB 并由 DK 包裹）；导出/备份排除凭证。
- 本地 keyset 增加 AAD，绑定 `keyId`/`epoch`。
- 建议最小 IAM：仅允许目标前缀的读写。

### 5.6 消息授权（T5，高优先）
- **校验不能只看 `sender.id`**：content script 的 `sender.id` 恒等于扩展 id，无效。必须判定 `sender.tab === undefined` 且 `sender.url` 为 `chrome-extension://<id>/...`，才视为扩展自身页面；content script（`sender.tab` 存在）一律拒绝特权操作。
- 特权集必须完整包含 `syncSetKey`/`syncClearKey`/`syncUpdateSettings`/`syncNow`（遗漏 `syncUpdateSettings` 可被改 S3 配置）。
- 密钥变更额外要求来自受信 UI 的用户手势，并二次确认。

### 5.7 锁正确性（T6）
- 长同步期间续租；释放时校验 owner（clientId/nonce 或 `If-Match`），不再无条件删除。
- 子流使用独立锁路径。

### 5.8 完整性校验（T7）
- 拉取时比对 manifest 的 `chunk hash/size`，并在存在 `chainHeads` 时校验 `prevHash` 连续性；校验失败即拒绝该 manifest（与抗回滚配合）。

### 5.9 传输与细节（T8/T9/T10/T12/T13）
- 强制 HTTPS（或显式警告并默认拒绝 http）。
- 加密用唯一 nonce/key 派生（把内容哈希或随机盐纳入记录密钥 info）；如需要，选用 key-committing 模式。
- 记录 keyId 可识别性、updatedAt 元数据为已接受风险并写入隐私说明。
- 尽量 `fill(0)` 敏感 `Uint8Array`（masterKey/privateKey 在会话内使用后）。

### 5.10 写权限撤销：可行性判定（回应“能做到就做”）

- **纯 S3 + 单一共享静态凭证：做不到。** S3 按凭证/前缀授权，不认识应用层 roster；只要被移除设备仍持有共享凭证，它就能写/回滚账号共享前缀。
- 能做到的前提只有两种：
  1. **服务端身份层（若愿意加一个最小后端）**：运行极小的令牌服务，签发**每设备、短时、限定账号前缀**的凭证（STS 思路），由服务端校验 roster；撤销 = 停止续签（可选删除该设备写入区）。代价：打破“纯 BYO S3 / 无后端”。
  2. **每设备独立凭证 + 每设备独立写入区**：每设备单独凭证与自有前缀，读者合并所有设备日志；撤销 = 删除该设备凭证及其前缀。这是纯 S3 唯一能真正撤销写的形态，但需把同步改为“按设备追加日志 + 合并”，改动大，且共享结构（roster/manifest）仍需处理。
- 结论：**当前架构（扩展 + BYO S3 + 单一静态凭证）下做不到**。若接受引入最小身份/中继服务，则能做到并把 roster 校验放服务端；在此之前，写侧只提供抗回滚缓解 + 读侧 PCS。**这一条是待决项（§9），不要为实现它阻塞 KM1–KM4。**

## 6. 实施增量（Quick wins 与密钥模型重构分开）

**Quick wins（可先发布、不改协议格式）**

**QW1｜消息授权（T5）**：特权操作仅限扩展页面（`sender.tab === undefined` 且 `sender.url` 为 `chrome-extension://…`）+ 用户手势；覆盖 `syncUpdateSettings`。
- 验证：单测模拟 content script sender（带 `sender.tab`）被拒；受信扩展页面通过。

**QW2｜锁续租 + owner 释放（T6）**：同步中定时续租；释放带 owner/etag 校验。
- 验证：并发单测（A 过期、B 获取、A 释放不应删 B）。

**QW3｜本地凭证加密 + keyset AAD（T4、T11）**：凭证加密落盘；keyset 绑定 keyId/epoch。
- 验证：读取旧格式时迁移；导入/导出不带凭证。

**QW4｜强制 HTTPS（T10）**：非 https endpoint 拒绝或显式二次确认。
- 验证：http 用例被拒。

**QW5｜完整性校验（T7）**：校验 chunk hash/size 与链头。
- 验证：篡改 chunk 被拒。

**密钥模型重构（break change，需在子流 v1 冻结前定案）**

**KM1｜目标模型（无旧格式兼容）**：随机 D、设备密钥、roster、按设备签名；明确不读取/不兼容旧格式。
- 依赖：无（设计）。
- 验证：威胁模型与 break-change 影响面评审通过。

**KM2｜设备密钥与本地包裹**：Ed25519+X25519 生成；私钥由 DK 包裹存储。
- 验证：重启后可加载；无法导出。

**KM3｜roster + 设备注册（同机 QR / 异地邮箱）**：§4 协议。
- 依赖：KM2。
- 验证：双端配对、短码校验、换钥攻击被拒、审批在锁内串行。

**KM4｜数据密钥 D 与按设备签名**：内容/manifest/chunk 改用 D 派生的密钥；manifest 按设备签名并由 roster 验签。
- 依赖：KM1、KM3。
- 验证：新设备配对后能解密；未授权设备不能；移除设备读不到新 epoch。

**KM5｜干净切换（break，无迁移）**：新模型使用新的账号/格式版本，旧客户端无法触碰；首个设备以本地数据建立新账号并上传；随后清理旧根与旧 epoch。
- 依赖：KM4。
- 验证：新账号可读；旧根被清理；记录“仅存在于远端、且本地没有的数据会丢失”为已接受风险。

**KM6｜KDF 强化（T1）**：Argon2id/≥600k + 高熵密钥策略。
- 验证：基准与暴力成本评估；弱口令被判拒。

**KM7｜抗回滚（T2）+ 轮换完整性（T3）**：单调 high-water；轮换清理旧 keyId/旧 epoch。
- 验证：回滚被拒；轮换后旧密文不可再用且被清理。

**KM8｜设备撤销（读侧 PCS）**：移除设备 → D' 重包裹剩余设备 → 旧包裹失效；写侧撤销按 §5.10 的判定处理。
- 验证：被移除设备读不到新数据。

## 7. 迁移与 break change

- **不做向前兼容**：新模型使用新的账号/格式版本，旧客户端枚举不到、也不会污染新数据；旧根数据直接清理。
- 唯一的数据安全前提：**本地记录会被重新上传**（`collectLocalRecords` 与密钥无关），因此只要记录在本机存在，就能在新账号中重建。
- **已接受风险**：仅存在于远端、任何本地都没有副本的记录会在清理后丢失。若不可接受，可在切换前做一次性“拉取旧远端→导入本地→重上传”的挽救步骤（不视为兼容层）。
- 发布说明需明确最低版本；旧客户端在清理后视为弃用。
- A-only 恢复与否、以及写撤销形态（§5.10）决定 D 的生成/包裹，**必须在 KM4 前定案**。

## 8. 验收标准

- 未授权设备无法解密；移除设备无法解密新 epoch（读侧 PCS）。
- A 泄露且无设备私钥时，仅凭 A 无法解密（无 A-only 恢复）。
- 回滚到旧 manifest/roster 被拒绝。
- 轮换后被轮换的旧密文被清理，且新 keyId 可读。
- content script 无法调用特权同步消息；`syncSetKey` 只能来自受信页面且需用户手势。
- 锁释放不会删除他人锁；长同步不被抢锁。
- S3 凭证不以明文落盘。
- 篡改的 chunk/manifest 被拒绝。

## 9. 决策记录与待决

**已定（2026-09-28）**
1. 恢复：**无 A-only 恢复**；D 只包裹给设备，所有设备丢失即不可恢复。
2. 前向保密：**不要求严格 FS**；目标仅为 A 单独不能直接得到 D，设备绑定满足。
3. 迁移：**不做向前兼容**，直接清理旧路径与旧 epoch（见 §7；仅存在于远端的数据丢失为已接受风险）。
4. 写权限撤销：见 §5.10，纯 S3 不可行。

**已由 §11 给出推荐（按此执行，除非另行推翻）**
- 写权限撤销形态：暂不引入后端，维持纯 S3 + 抗回滚 + 读侧 PCS（记为已接受限制）。
- 旧远端挽救：执行一次性 best-effort 挽救（§7）。
- 单设备损坏：提供离线加密导出/导入（§11.3）。

## 10. 第二轮 review 修复决议（2026-09-28）

- **0.1 顺序**：与 evolution 统一：QW 安全 → KM 密钥模型 → evolution 子流 → inbox UI；总顺序见 `docs/plan/inbox-flow.md` 顶部。clean break 已消除“旧端并存”验收。
- **0.2 术语**：S3 根统一为 `accountId`；`keyId` 仅用于 chunk envelope/chainHeads 等密码学字段。
- **3.1 QR**：§4 已要求二维码含 `accountId` + D1 `signPub` 指纹，作为 D2 的寻址与信任锚。
- **3.2/3.3 index/锚**：§4 已要求 `index.bin` 与请求对象签名，anti-rollback 只依赖签名 roster 的单调版本，未签名对象不再承载安全语义。
- **3.5 T1**：接受反驳，`accountId` 随机生成消除口令 oracle（§2 T1、§5.1 已改）。
- **3.6/3.7 T5**：§5.6 与 QW1 已改为按 `sender.tab`/`sender.url` 判定，并纳入 `syncUpdateSettings`。
- **1.1 锁**：与 evolution I1 对齐（续租 + 所有权），QW2 从“唯一修复”降为与 I1 合并。
- 其余 T7/T8/T9/T11/T12 按 §6/§5.9 执行，无争议。

## 11. 待决项解决方案（2026-09-28 推荐）

1. **写权限撤销：推荐暂不引入后端。**
   - 方案：维持纯 S3 + 抗回滚（T2）+ 读侧 PCS；把“无法撤销被移除设备的写权限”写入安全/隐私说明作为**已接受限制**。
   - 理由：保留 local-first / BYO S3 / 无后端的定位，避免运维与信任面；残余风险（被移除设备恶意写/回滚）由抗回滚与轮换 D 限制。
   - 将来若因其他需求已有后端，再启用 §5.10 的最小身份层（每设备短时凭证 + 服务端 roster 校验）。

2. **旧远端数据挽救：推荐执行一次性 best-effort 挽救。**
   - 方案：首个升级设备用旧密钥拉取旧远端记录 → 合并本地 → 以新格式重上传 → 清理旧根（不是兼容层，只跑一次）。
   - 理由：成本低、复用现有解密路径，避免“仅存在于远端”的记录静默丢失。

3. **无 A-only 恢复下的单设备损坏：推荐提供离线导出/导入。**
   - 方案：允许用户导出**离线加密备份**（D 用用户选择的口令通过 Argon2id 派生密钥包裹），在新设备导入后加入 roster；不引入 A 托管。
   - 理由：在不违背“A 单独不解密”的前提下，给单设备用户一条恢复路径；是否启用由用户显式选择并知悉风险。

4. **KDF 与高熵：** 本地解锁口令用 Argon2id；`accountId` 随机（§5.1）。

## 12. 实施状态（2026-10-08）

- **阶段 A（QW1–QW5）完成**（`c7e717a`）：消息授权（含 `syncUpdateSettings` 与密钥变更用户手势）、锁续租+所有权释放、本地凭证加密+keyset AAD 迁移、强制 HTTPS、chunk/record/chain 完整性校验。
- **阶段 B（KM1–KM7）完成**：v2 协议（`SYNC_PROTOCOL_VERSION_V2 = "2.0.0"`）；设备密钥与本地 DK 包裹；roster（签名 genesis / 加入 / 撤销+轮换 / 验签 / 单调推进）；`deviceEnrollment`（S3 设备邮箱 crypto）与 `pairing`（同机 ECDH + SAS）；`account` 账户模型与按设备签名；PBKDF2 ≥600k；`highWater` 抗回滚；**KM5** clean-break 引导与一次性旧远端挽救（`v2/bootstrap.ts`）。
  - **未接 UI**：异地 S3 设备邮箱（crypto 已实现并单测；当前同机配对可用，手动转串）。
  - **KM7 轮换清理**：由「新 epoch 重加密覆盖同路径 + 按流 GC」实现，无独立旧 epoch 目录需清理。
- **阶段 C/D 完成**：见 `e2ee-sync-evolution.md §10`、`inbox-flow.md §11`；端到端见双 profile mock S3 e2e（`tests/extension/sync-mock-s3.spec.ts`）。
- 现网状态与已知限制见 `docs/reviews/UX-ASSESSMENT-2026-09-29.md §5`。

### 12.1 实施修正（有证据，不改变决策意图）

- **QW1 sender 判定**：§5.6/§10 要求 `sender.tab === undefined`。e2e 证据（双 profile mock S3，见 `myz-annotator/tests/extension/sync-mock-s3.spec.ts`）表明：在**标签页中打开的扩展页面**（options/dashboard）同样带有 `sender.tab`，按 `tab === undefined` 会误拒受信页面，导致 `syncSetKey/accountBootstrap` 等正常操作失败。实现改为按 `sender.url` 以 `chrome-extension://<id>/` 开头判定（content script 的 `sender.url` 为宿主页 URL，仍被拒），并加回归测试；QW1 的验收（content script 被拒、扩展页面通过）据此满足。
- **QW4 endpoint**：允许 loopback（`localhost`/`127.0.0.1`/`[::1]`）HTTP 以便本地 mock/开发；其余仍强制 HTTPS。
