# MyZ Suite 质量改进计划

# Context

对 MyZ 单仓库（monorepo）进行了全面审计，该仓库是一个包含 7 个 `npm` 工作空间、3 个内部包、2 个 Chrome 扩展、1 个 Telegram 机器人、1 个 Tauri
桌面应用及若干文档网站的项目。审计发现多个影响安全性、完整性及工程一致性的问题。本计划按严重性和依赖关系对修复工作进行了优先级排序。

---
## 第一波：安全与单仓库完整性（关键）

### 1.1 — 从 git 中移除 `.env`，轮换密钥

问题：`.env` 文件包含真实的 Telegram 机器人凭证（`TELEGRAM_BOT_TOKEN`），已被提交至 git，且在历史记录中公开可见。

操作：
- 执行 `git rm --cached .env` 将其从索引中移除
- 将 `.env` 添加到 `.gitignore`
- 向用户发出 Telegram 机器人令牌轮换提醒（通过 `@BotFather`）
- 为用于本地开发的 `.env.example` 模板创建占位值
- 检查是否有任何其他敏感文件被跟踪（密钥文件、证书）

### 1.2 — 合并 `package-lock.json` 文件

问题：7 个工作空间中有 5 个（`annotator`、`danmaku`、`suite-tool`、`vectoria`、`website`）拥有各自的 `package-lock.json`，这破坏了 `npm` 工作空间的提升和确定性安装特性。

操作：
- 删除各模块的 `package-lock.json` 文件，仅保留根目录下的文件
- 从根目录运行 `npm install` 重新生成单一的锁文件
- 更新 CI（`extension-ci.yml`），改为从根目录进行 `npm ci`，而非在模块目录内

---
## 第二波：测试覆盖率与 CI（高）

### 2.1 — 修复/移除无效的 `service-ci.yml`

问题：`.github/workflows/service-ci.yml` 监控的是不存在的 `service/` 目录。该工作流永远不会触发，属于无效代码。

操作：
- 删除 `.github/workflows/service-ci.yml`
- 或者，若 `service/` 计划在未来存在，则将其重命名并标记为 `workflow_dispatch`（手动触发）

### 2.2 — 为关键模块新增 CI

问题：以下模块完全没有 CI 流程：`myz-bot`、`myz-danmaku`、`myz-suite-tool`、`vectoria`、`packages/*`。

操作（按优先级排序）：
1. `myz-bot` CI（`bot-ci.yml`）：按 Node 内置测试运行器执行 npm test，执行 npm run build 验证打包输出
2. `packages` CI（`packages-ci.yml`）：对所有包执行 npm test —— 如果存在测试的话（目前仅有 `ai-core` 含 3 个测试文件）—— 并确保 TypeScript 编译通过
3. `myz-suite-tool` CI：将测试添加推迟至 2.3，但可以先添加类型检查 + 构建验证步骤
4. `myz-danmaku` CI：同上 —— 先加类型检查，测试稍后补充
5. `vectoria` CI：同上

### 2.3 — 补充缺失的测试

问题：
- `myz-suite-tool`：零测试
- `myz-danmaku`：一个临时脚本，无测试运行器
- `vectoria`：测试基础设施已配置，但 `tests/vectoria.test.ts` 文件不存在

操作（按优先级排序，一次一个模块）：
1. `vectoria`：创建缺失的 `tests/vectoria.test.ts` —— 该库是最独立的，具有清晰的向量搜索、HNSW 索引及 IndexedDB 存储 API，非常适合编写测试
2. `myz-danmaku`：至少为核心逻辑（弹幕解析、渲染）添加基础的 Vitest 单元测试
3. `myz-suite-tool`：为核心设置/配置逻辑添加测试

---
## 第三波：依赖与配置统一（高）

### 3.1 — 统一 TypeScript 版本

问题：TypeScript 版本不一致 —— 5.4（`vectoria`）、5.6（`suite-tool`）、5.9（其余模块）。

操作：
- 将所有模块更新为 `typescript:` `^5.9.3`
- 将 `myz-suite-tool` 中的 `~5.6.2`（补丁锁定）切换为 `^5.9.3`
- 统一后重新构建所有模块，捕获类型错误

### 3.2 — 统一 `tsconfig` 严格性设置

问题：各模块的 TypeScript 严格性标志存在差异。`myz-bot` 仅设置了 `strict: true`；其他模块额外启用了 noUnusedLocals。

推荐基线（所有模块）：
```json
{
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true
}
```

操作：
- 创建一个共享的基础 `tsconfig.base.json` 于根目录，各模块进行继承
- 逐模块更新 `tsconfig` 文件以继承该基础配置
- 修复因启用 noUnusedParameters 而产生的任何新错误

### 3.3 — 升级 `myz-suite-tool` 依赖

问题：`myz-suite-tool` 在多个关键依赖上落后：Vite 6（vs 7）、`vue-tsc` 2（vs 3）、Vue 3.5.13（vs 3.5.22）。

操作：
- 将 `myz-suite-tool` 升级为 `vite`: ^7.x、`vue-tsc`: ^3.x、`vue`: ^3.5.22
- 验证 Tauri 构建在升级后仍可正常工作
- 若有必要，更新所有 Vite/Vue 相关的破坏性变更

---
## 第四波：工程基础设施（中）

### 4.1 — 新增根级单仓库脚本

问题：根 `package.json` 中没有脚本，无法执行全仓库范围的操作（如 `npm run build --workspaces`、`npm test --workspaces`）。

操作：
- 添加根级脚本：`build:all`、`test:all`、`lint:all`、`typecheck:all`
- 为无测试的模块添加空操作脚本（例如 `"test": "echo no tests yet"`），避免 `--workspaces` 执行失败
- 添加 .nvmrc（含 24）并在 `package.json` 中设置 `"engines": { "node": ">=24" }`

### 4.2 — 补充缺失的 `AGENTS.md` 文件

问题：7 个模块中有 6 个缺少 `AGENTS.md`，但技能规范要求目录职责发生变化时必须更新 `AGENTS.md`。

操作：
- 为以下模块创建最小化的 `AGENTS.md`：`myz-suite-tool`、`myz-danmaku`、`vectoria`、`website`、`packages/ai-core`、`packages/shared`
- 每个文件应描述模块的用途、关键边界、依赖关系及工程约定

### 4.3 — 新增根 `README.md`

问题：根目录没有 `README.md`。`AGENTS.md` 承担了部分角色，但对于偶然访客来说不够通俗。

操作：
- 创建 `README.md`，包含：项目简介、模块概览表格、快速入门说明、文档网站链接

### 4.4 — 修复 3 个 FIXME 标记

问题：`myz-annotator/src/content/highlight-state.ts` 中有 3 个 `FIXME` 标记（`modal`、`inspector` 模式）。

操作：
- 调查每个 `FIXME` —— 是否为缺失功能，还是仅需清理
- 若功能仍需要：创建对应的 v13 跟踪条目
- 若已过时：移除标记

### 4.5 — 清理 as any 及 @ts-ignore

问题：源代码中有 5 处 as any 转换（4 处在 `myz-danmaku`，1 处在 `vectoria`），以及 1 处 `@ts-ignore`（`vectoria`）。

操作：
- `myz-danmaku`：用 `error instanceof Error ? error.message : String(error)` 替换 `(error as any).message`，避免类型转换
- `vectoria` `migration.ts`：为 HNSW 索引定义适当的接口，替代 `as any`
- `vectoria` `transformers-embedder.ts`：解决 `@ts-ignore` 问题，可通过声明补充或升级 `@huggingface/transformers` 类型实现

---
## 第五波：文档与流程（低）

### 5.1 — 为跟踪文档添加状态元数据

问题：13 个跟踪文档均缺少状态（规划中 / 进行中 / 已完成）。这使得无法清楚了解每个 vN 的完成情况。

操作：
- 为每个 `docs/track/vN-*.md` 文件在标题下添加状态行，例如 `> Status: Complete (2026-03-30)`
- 根据 git 日志和代码现状确认 v1-v12 的状态

### 5.2 — 移除旧的 Jest 配置

问题：`myz-annotator/jest.config.mjs` 与 Vitest 配置并存。仓库已全面采用 Vitest。

操作：
- 确认无脚本引用 Jest 配置
- 若确实未使用，则删除 `jest.config.mjs`

### 5.3 — 添加 `.nvmrc` / `engines` 字段

与 4.1 合并执行。

---
## 依赖关系与执行顺序

```
第一波（安全）
  ├─ 1.1 移除 .env / 轮换密钥 [独立]
  └─ 1.2 合并 lock 文件 [独立]
       │
第二波（CI / 测试）
  ├─ 2.1 移除无效 CI [独立]
  ├─ 2.2 新增 CI [依赖 1.2 —— CI 需要正确的单仓库安装]
  └─ 2.3 补充测试 [独立]
       │
第三波（统一）
  ├─ 3.1 统一 TS [依赖 2.2 的 CI 作为安全网]
  ├─ 3.2 统一 tsconfig [依赖 3.1]
  └─ 3.3 升级 suite-tool deps [依赖 3.1]
       │
第四波（基础设施）
  ├─ 4.1 根脚本 [依赖 3.1, 3.2]
  ├─ 4.2 AGENTS.md 文件 [独立]
  ├─ 4.3 README.md [独立]
  ├─ 4.4 修复 FIXME [独立]
  └─ 4.5 清理 as any [独立]
       │
第五波（文档）
  ├─ 5.1 跟踪状态 [独立]
  └─ 5.2 移除 Jest 旧配置 [独立]
```

## 验证

每波结束后：
- 第一波：`git status` 不显示 `.env`；仅存在单一的 `package-lock.json`；`npm install` 在所有工作空间构建通过
- 第二波：GitHub Actions 为新增工作流显示绿色通过状态；`npm test` 在每个模块内执行并通过
- 第三波：所有模块在统一配置下通过 `npx tsc --noEmit` 且无错误；全仓库类型检查通过
- 第四波：`npm run build:all`、`npm run test:all`、`npm run lint:all` 成功运行；README 和 `AGENTS.md` 文件存在
- 第五波：所有跟踪文档带有状态线；旧 Jest 配置已移除且构建不受影响

非目标

- 不涉及功能开发或行为变更（纯质量改进）
- 不更改任何面向用户的功能或 UI
- 不进行跨模块重构（需要单独的需求文档）
- 不在当前未使用的模块中添加测试基础设施（仅在已有框架的模块中添加）