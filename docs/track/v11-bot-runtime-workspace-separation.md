# myz-bot workspace 可见性收敛、HOME runtime 与记忆模型重构

## Vision
- 让 `myz-bot` 的 agent 只感知当前协作 workspace，而所有运行态状态统一下沉到当前用户 `HOME` 下的 `~/.myz-bot`，从根上切断工具对 runtime 的直接访问。

## Background / Motivation
- 当前 `bot.yml`、`SOUL.md`、`AGENTS.md`、`BOOTSTRAP.md`、`memory/`、`conversations/` 全部混在同一根目录，运行态数据与长期协作文档没有边界。
- 当前 `conversations/<id>/workspace/` 把工作区按会话隔离，导致工具语义、路径心智与 prompt 注入长期不稳定；同一个 bot 的身份文档与长期记忆也被会话目录结构牵制。
- 当前 `memory/` 依赖 `index.json`、`notes/`、`conversation-summaries/`，结构复杂，维护命令和上下文恢复都必须理解额外索引层。
- 当前 `/bot` 虚拟目录把 runtime 直接暴露给 agent，权限边界不清晰，attachment 与真正的运行态文件也混在同一可达平面里。
- 当前 `bot.yml.workspaceRoot` 与 `serve -c` 让配置根、执行目录、工作区三套概念并存，增加了路径推导与部署复杂度。
- 当前默认工作区没有严格的 `.gitignore` 白名单，运行噪音与临时文件容易污染用户想提交的工作区。

## Scope
- 保留 `workspace` 作为 bot 唯一可见的协作目录，默认等于当前执行目录。
- 把 runtime 统一收敛到当前用户 `HOME` 下的 `~/.myz-bot`。
- 在 `~/.myz-bot` 内按 `workspaceId` 维护每个 workspace 的隔离运行态数据。
- runtime 保存 `bot.yml`、`conversations/`、`permissions/`、`relationships/`、`soul/` 与运行控制目录。
- workspace 保存协作与身份文档：`AGENTS.md`、`BOOTSTRAP.md`、`SOUL.md`、`IDENTITY.md`、`USER.md`、`memory/`。
- 重写 `init` 为引导式初始化：先采集 bot 与 LLM 基础配置，再写入 runtime `bot.yml`，同时生成 workspace 文档。
- 移除“按 conversation 隔离 workspace”的设计，`/workspace` 始终指向共享 workspace。
- 将 memory 重构为“长期记忆 + 按日期日记”的 Markdown 结构。
- 为 workspace 生成严格白名单式 `.gitignore`。
- 取消虚拟 `/bot` 目录；agent 不再通过工具读取 runtime。
- 为 attachment 设计独立的只读暴露面，不把 attachment 与 runtime 其他内容混在一起。
- 删除 `bot.yml.workspaceRoot` 配置。
- 废弃 `serve -c`，新增 `serve -w <path>` 以显式切换 workspace。
- 提供从旧布局迁移到新布局的显式迁移流程与回退点。

## Non-Goals
- 不在本次规划中改写 Telegram 历史、LLM 历史、任务调度或关系反思的业务语义。
- 不在本次规划中改变 `conversations/<id>/` 下的附件、日志、上下文压缩格式。
- 不在本次规划中保留 `conversations/<id>/workspace/` 的兼容写入；迁移完成后该目录必须废弃。
- 不在本次规划中把 workspace 变成任意文件仓库；默认可提交内容只允许规定的 Markdown 文档。
- 不在本次规划中向 agent 暴露任何 runtime 目录浏览能力。
- 不在本次规划中允许 agent 通过命令、读写工具或虚拟路径绕过 `/workspace` 边界。

## Data Model (schema-first)

### 1. 目录模型
- workspace 默认目录必须为当前执行目录，除非用户通过 `-w` 显式指定。
- runtime root 必须固定为 `~/.myz-bot`。
- runtime 内必须存在全局配置与按 workspace 分区的运行态目录：

```text
<workspace>/
  .gitignore
  AGENTS.md
  BOOTSTRAP.md
  SOUL.md
  IDENTITY.md
  USER.md
  memory/
    MEMORY.md
    YYYY-MM-DD.md

~/.myz-bot/
  bot.yml
  workspaces/
    <workspaceId>/
      conversations/
      permissions/
      relationships/
      soul/
      system/
```

- `workspaceId` 必须由 workspace 的真实绝对路径稳定推导，例如 `sha256(realpath(workspace)).slice(0, 16)`。
- runtime 中所有会话、权限、关系、soul 审计与运行控制文件都必须位于对应的 `workspaces/<workspaceId>/` 下。
- `bot.yml` 是 runtime 全局配置文件，不再与 workspace 同目录。
- `SOUL.md` 的“可见人格文档”在 workspace；runtime 的 `soul/` 只保存草稿、审计、growth 与 archive 等运行态文件。

### 2. 配置模型
- `bot.yml` 必须固定解析自 `~/.myz-bot/bot.yml`。
- `bot.yml` 首次创建时必须由 `init` 通过引导式问题生成，不再只落静态模板。
- `BotRuntimeConfig` 必须新增派生字段：
  - `runtimeRoot`
  - `workspaceRoot`
  - `workspaceId`
  - `workspaceRuntimeRoot`
  - `conversationsDir`
  - `permissionsDir`
  - `relationshipsDir`
  - `soulRuntimeDir`
  - `systemDir`
  - `memoryDir`
- `bot.yml.workspaceRoot` 必须删除；若历史配置中仍出现该字段，加载器必须忽略并给出一次性迁移警告。
- `loadConfig()` 不允许再接收 `configPath`；它必须只从固定 runtime 配置路径读取配置。
- `serve`、`check`、`init`、`launch` 必须支持 `-w, --workspace <path>`，其默认值必须为 `process.cwd()`。
- 所有命令在解析 `-w` 后，必须先将 workspace 规范化为绝对真实路径，再计算 `workspaceId`。

### 3. `init` 引导模型
- `init` 首次运行时必须交互式询问并写入以下最小配置：
  - Telegram bot `username`
  - Telegram bot `token`
  - LLM `provider`
  - LLM `baseUrl`
  - LLM `accessToken`
  - LLM `model`
- `init` 必须允许用户直接回车接受合理默认值，但不允许跳过 `username`、`token`、`provider`、`model` 这四项必填配置。
- `init` 在发现 `~/.myz-bot/bot.yml` 已存在时，必须进入“复用或更新”流程，而不是无提示覆盖。
- `init` 在写入 runtime 配置后，必须继续生成当前 workspace 的：
  - `AGENTS.md`
  - `BOOTSTRAP.md`
  - `SOUL.md`
  - `IDENTITY.md`
  - `USER.md`
  - `memory/MEMORY.md`
  - 默认 `.gitignore`
- `init` 必须默认不覆盖用户已存在的 workspace 文档；若需要重写，必须要求显式确认。
- `init` 必须输出最终使用的 `workspaceRoot` 与 runtime 路径，避免用户不知道配置写到了哪里。

### 4. 工具与虚拟路径模型
- agent 通过文件工具可见的根目录必须只有 `/workspace`。
- 虚拟 `/bot` 目录必须删除。
- attachment 必须通过独立只读暴露面提供，推荐新增虚拟目录 `/attachments`，其内容仅映射当前 conversation 已保存的附件文件。
- `/attachments` 不允许列出 runtime 中与当前 conversation 无关的任何文件。
- 除 `/workspace` 与 `/attachments` 外，文件工具不允许解析其他虚拟根。
- 命令执行类工具的默认工作目录必须是 `workspaceRoot`。
- 命令执行类工具不允许把 runtime 路径作为默认参数、默认 cwd 或隐式补全结果返回给 agent。
- 若 agent 显式尝试读取 runtime 绝对路径、`~/.myz-bot`、或通过路径穿越访问 runtime，工具必须拒绝。

### 5. Memory 模型
- `workspace/memory/MEMORY.md` 是长期记忆唯一权威文件。
- `workspace/memory/YYYY-MM-DD.md` 是每日记忆日志文件；文件名必须使用本地日期，格式必须为 `YYYY-MM-DD.md`。
- `Remember`、自动记忆、会话总结都必须先追加到当天文件，而不是写 `index.json` 或离散 note 文件。
- 长期稳定偏好、身份、长期任务约定必须被整理进 `MEMORY.md`；日记文件只保存时间序列事实与短期上下文。
- `memory/index.json`、`memory/notes/`、`memory/conversation-summaries/` 必须在迁移后停用。

### 6. Workspace `.gitignore` 模型
- workspace 根目录必须生成如下白名单式 `.gitignore`：

```gitignore
*
!.gitignore
!AGENTS.md
!BOOTSTRAP.md
!SOUL.md
!IDENTITY.md
!USER.md
!memory/
memory/*
!memory/*.md
```

- 默认规则下，只有上述 Markdown 文档与 `.gitignore` 自身可被 Git 跟踪。
- 任何其他文件类型、目录、缓存、技能目录都必须默认被忽略。
- 如果用户需要追踪额外文件，必须显式修改该 `.gitignore`；初始化流程不提供隐式例外。

### 7. 技能与模板
- 项目级技能目录不再默认创建在 workspace 中。
- 内置技能仍按仓库或安装包内路径加载。
- 如果后续恢复 project skill authoring，必须单独设计新的可追踪目录策略，不允许在本次需求里临时绕开 `.gitignore` 白名单。

### 8. 迁移清单
- runtime `workspaces/<workspaceId>/system/` 下必须记录一次性迁移清单，例如 `layout-migration.json`。
- 迁移清单至少包含：
  - `sourceLayoutVersion`
  - `targetLayoutVersion`
  - `workspaceId`
  - `startedAt`
  - `completedAt`
  - `movedPaths`
  - `copiedPaths`
  - `rollbackHints`

### 9. 旧布局兼容
- 旧布局中的以下文件必须迁移到 workspace：
  - `AGENTS.md`
  - `BOOTSTRAP.md`
  - `SOUL.md`
  - `IDENTITY.md`（若存在）
  - `USER.md`（若存在）
  - `memory/`
- 旧布局中的以下文件必须迁移到 runtime namespace：
  - `bot.yml`
  - `conversations/`
  - `permissions/`
  - `relationships/`
  - `soul/`

## UX / Flow

### 初始化
1. 用户执行 `myz-bot init`。
2. CLI 必须交互式询问 Telegram 用户名、token，以及 LLM provider、baseUrl、accessToken、model。
3. CLI 必须将结果写入 `~/.myz-bot/bot.yml`；若配置已存在，必须先提示复用或更新。
4. CLI 必须在目标 workspace 中生成身份文档、memory 目录与白名单 `.gitignore`。
5. CLI 必须输出 runtime 路径与 workspace 路径。
6. CLI 不允许在 workspace 内创建 runtime 目录。

### 启动
1. 用户执行 `myz-bot serve` 或 `myz-bot serve -w /abs/path/to/workspace`。
2. 运行时固定从 `~/.myz-bot/bot.yml` 读取配置。
3. 运行时将 `-w` 或 `process.cwd()` 解析为 `workspaceRoot`，并据此计算 `workspaceId`。
4. 运行时在 `~/.myz-bot/workspaces/<workspaceId>/` 下装载该 workspace 的 conversations、permissions、relationships、soul 与 system 状态。
5. Assistant prompt 从 `workspace/AGENTS.md`、`workspace/SOUL.md`、`workspace/IDENTITY.md`、`workspace/USER.md` 装载长期上下文。
6. 工具中的文件访问只允许 `/workspace`，attachment 只允许 `/attachments` 只读访问。

### 记忆写入
1. 记忆产生时，先追加到当天 `workspace/memory/YYYY-MM-DD.md`。
2. 当记忆被判定为长期有效时，再由专门流程写入 `workspace/memory/MEMORY.md`。
3. `/ops reset-memory` 必须允许按“仅清空日记”与“清空长期记忆”两个层级工作，不允许再依赖 conversation-summary 文件。

### 迁移
1. 用户执行显式迁移命令。
2. 迁移器扫描旧布局根目录。
3. 迁移器将协作文档整理到目标 workspace。
4. 迁移器将运行态目录迁移到 `~/.myz-bot/workspaces/<workspaceId>/`。
5. 迁移器重写 `memory/` 为新的 Markdown 结构。
6. 迁移完成后写入 runtime namespace 的 `system/layout-migration.json`。
7. 迁移失败时保留原目录不覆盖，回滚依赖迁移清单逆操作。

## Dependencies / Constraints
- 依赖 `myz-bot/src/config.ts` 对 `workspaceRoot` 的现有解析逻辑；该模块必须删除 `workspaceRoot` 配置并改成“固定 runtime + CLI workspace 参数”模式。
- 依赖 `myz-bot/src/cli.ts` 的 `serve --config` 与 `check --config` 逻辑；这些命令必须改成 `-w, --workspace`。
- 依赖 `myz-bot/src/init.ts` 的初始化模板逻辑；该模块必须只写 workspace 模板，并确保 runtime 全局配置存在。
- 依赖 `myz-bot/src/conversations.ts`、`src/tools.ts`、`src/index.ts`、`src/scheduler.ts` 的路径语义；这些模块必须同步移除会话级 workspace 假设。
- 依赖 `myz-bot/src/memory.ts`、`src/context.ts`、`src/contextRecovery.ts`、`src/maintenance.ts` 的 memory 读写逻辑；这些模块必须重写为 Markdown-first。
- 依赖工具访问控制；工具层必须新增“禁止 runtime 访问”的硬性校验。
- 依赖现有测试中对 `memory/index.json`、`conversation-summaries/`、`conversations/<id>/workspace/` 的断言；测试必须同步迁移。
- 迁移必须幂等；同一目录重复执行迁移时，不允许重复搬运或覆写已经迁移成功的文件。

## Acceptance Criteria
- Given 用户在空目录执行 `myz-bot init`, When 初始化完成, Then CLI 必须先询问 Telegram 用户名、token 以及 LLM 基础配置，再生成当前目录下的 workspace 文档与 `.gitignore`，并写入 `~/.myz-bot/bot.yml`。
- Given 用户在 `init` 交互中直接回车接受默认值, When 字段属于可默认项, Then CLI 必须写入默认值；When 字段属于必填项, Then CLI 必须继续追问直到拿到有效值。
- Given `~/.myz-bot/bot.yml` 已存在, When 用户再次执行 `init`, Then CLI 必须提示“复用现有配置”或“更新配置”，而不是直接覆盖。
- Given 用户执行 `myz-bot serve`, When 配置加载完成, Then `workspaceRoot` 必须等于当前执行目录的真实绝对路径，`runtimeRoot` 必须等于当前用户 `HOME` 下的 `~/.myz-bot`。
- Given 用户执行 `myz-bot serve -w /abs/path/to/workspace`, When 配置加载完成, Then `workspaceRoot` 必须等于 `/abs/path/to/workspace` 的真实绝对路径，且不允许再读取 `bot.yml.workspaceRoot`。
- Given 历史 `bot.yml` 仍包含 `workspaceRoot`, When 新版本加载配置, Then 该字段必须被忽略且记录迁移提示。
- Given 任意 conversation 已存在, When bot 调用工具访问 `/workspace`, Then 访问目标必须是共享 workspace，而不是 `conversations/<id>/workspace`。
- Given agent 调用文件工具访问 `/bot`、`~/.myz-bot` 或 runtime 绝对路径, When 工具解析目标, Then 请求必须被拒绝。
- Given 当前 conversation 存在附件, When agent 访问 `/attachments`, Then 只允许读取当前 conversation 的附件文件，且不允许列出 runtime 其他目录。
- Given bot 生成一条新记忆, When 写盘完成, Then `workspace/memory/YYYY-MM-DD.md` 必须新增 Markdown 记录，且不允许创建 `memory/index.json`。
- Given 用户查看长期记忆, When 读取 `workspace/memory/MEMORY.md`, Then 文件必须存在并作为长期记忆唯一权威来源。
- Given workspace 使用默认 `.gitignore`, When 在 workspace 根目录创建 `tmp.json`, Then 该文件必须被 Git 忽略；When 创建 `memory/2026-03-26.md`, Then 该文件必须可被 Git 跟踪。
- Given 旧布局目录包含 `bot.yml`、`SOUL.md`、`AGENTS.md`、`BOOTSTRAP.md`、`memory/`、`conversations/`, When 迁移成功, Then 运行态文件必须位于 `~/.myz-bot/workspaces/<workspaceId>/`，协作文档必须位于目标 workspace，且 runtime namespace 中生成 `system/layout-migration.json`。
- Given 迁移已执行过一次, When 再次执行同一迁移命令, Then 命令必须报告“已迁移”或执行空操作，不允许重复创建会话 workspace 或旧 memory 索引。

## Verification Plan
- 单元测试：
  - `node --import tsx --test tests/init.test.ts`
  - `node --import tsx --test tests/memory.test.ts tests/context.test.ts tests/contextRecovery.test.ts`
  - `node --import tsx --test tests/tools.test.ts tests/maintenance.test.ts`
- 集成验证：
  - 使用旧布局 fixture 执行迁移命令，断言 `~/.myz-bot/workspaces/<workspaceId>/`、迁移清单与 memory 文件内容。
  - 启动 bot 后通过同一 conversation 连续访问 `/workspace` 与 `/attachments`，断言 agent 看不到 runtime。
- 手动验证：
  - 初始化一个新 bot，确认 CLI 先收集 Telegram / LLM 配置，再生成 workspace 文档，且 runtime 写到 `~/.myz-bot`。
  - 在一天内多次触发记忆写入，确认只追加同一天的 Markdown 文件。
  - 执行 `/ops reset-memory`，确认“日记”与“长期记忆”能被分别处理。

## Risks / Rollback
- 风险：历史代码广泛假设 `workspaceRoot` 同时也是 runtime root，重构时容易漏改权限、关系、soul 路径。
- 风险：runtime 改到 `~/.myz-bot` 后，多 workspace 共享同一 HOME，若 `workspaceId` 设计不稳定会导致数据串线。
- 风险：memory 从索引文件切换到 Markdown 后，去重、摘要、维护命令的实现会全部受到影响。
- 风险：移除 `/bot` 可见性后，若 attachment 暴露面设计不完整，现有依赖 runtime 读取附件的流程会失效。
- 回退策略：
  - 迁移必须先复制协作文档、后迁移 runtime namespace，原始目录在 `completedAt` 写入前不删除。
  - `serve` 在一个发布周期内必须支持读取旧布局并给出迁移提示，作为临时回退窗口。
  - 若新布局启动失败，用户必须可以继续用旧版本在原 workspace 根目录启动。

## Use Cases / Scenarios
- 主路径：
  - 用户在仓库根目录启动 bot，agent 只看到 `/workspace` 与 `/attachments`，而所有运行态数据写入 `~/.myz-bot/workspaces/<workspaceId>/`。
- 边界路径 1：
  - 用户通过 `-w` 指向另一个仓库；系统必须切换到新的 `workspaceId`，且不复用旧 workspace 的 conversations 与 permissions。
- 边界路径 2：
  - 同一天内连续触发 20 次记忆写入；系统必须只追加同一个 `YYYY-MM-DD.md` 文件，不允许散落成多个 note 文件。
- 失败路径：
  - 迁移过程中目标目录已存在冲突文件；迁移器必须停止并输出冲突清单，不允许静默覆盖。

## Boundary Conditions
- `workspaceRoot` 指向不存在目录
- workspace 已存在用户自定义 `.gitignore`
- `init` 运行在无 TTY 环境
- 旧 memory 中存在空标题、重复内容、损坏索引
- `~/.myz-bot` 已存在旧版全局数据
- conversation 目录数量很大时的迁移性能
- 本地日期跨天时的 daily memory 文件切换

## Open Questions
- `/ops reset-memory` 是否需要拆成 `reset-memory daily` 与 `reset-memory all` 两层命令，还是继续沿用 `current|all` 语义后重解释范围。
- `IDENTITY.md` 与 `USER.md` 的初始化模板内容是否沿用 `BOOTSTRAP.md` 风格，还是需要单独的最小模板。
- 无 TTY 的 `init` 是否需要额外提供 `--from-env` 或 `--yes` 模式，供 CI / 自动化脚本使用。

## Change Log
- 2026-03-26
  - 新增 runtime / workspace 拆分规划。
  - 明确 memory 改为 `MEMORY.md` + `YYYY-MM-DD.md`。
  - 明确 workspace 默认采用严格白名单 `.gitignore`。
  - 改为 `workspace=当前目录或 -w 指定目录`，`runtime=~/.myz-bot`。
  - 删除 `/bot` 虚拟目录，收敛为 `/workspace` 与只读 `/attachments`。
  - 删除 `bot.yml.workspaceRoot` 与 `serve -c` 语义。
