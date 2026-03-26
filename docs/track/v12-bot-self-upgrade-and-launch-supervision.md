# myz-bot 自升级、版本检测与启动托管

## Vision
- 让 `myz-bot` 在单文件 `cjs` 发布形态下仍能具备内置启动托管与可控升级能力，同时把“worker 执行”与“launcher 监督”封装进同一个入口文件。

## Background / Motivation
- 当前 `/ops restart` 只会触发进程以固定退出码退出；若外部没有 supervisor，进程不会自行拉起。
- 当前 CLI 只有 `serve`、`init`、`check`，没有启动托管层，也没有记录当前 bot 是如何被启动的。
- `npx myz-bot@latest serve` 属于一次性解析包并直接运行的模式；bot 进程本身并不持有可靠的“原始启动命令控制权”。
- 当前 `myz-bot` 发布产物是单个 `myz-bot.cjs`，若要引入 supervisor，不能再假设存在第二个独立守护进程二进制。
- 若不先定义启动模式，自升级会退化成不可靠的“自杀后希望外部帮忙拉起”，这不是可交付方案。

## Scope
- 定义版本检测、升级策略、启动模式与重启职责边界。
- 新增受支持的启动模式分类：`launcher`、`direct-ephemeral`、`direct-pinned`。
- 新增内置启动托管命令，负责拉起 `serve` 子进程并处理重启请求。
- 新增升级状态文件与启动元数据文件。
- 新增 `/ops upgrade` 与 CLI `upgrade` 能力，用于检查、排队、应用或拒绝升级。
- 明确 `npx myz-bot@latest serve` 的能力边界与不支持项。
- 明确单文件发布下 launcher/supervisor 的打包、递归拉起与代际切换方式。

## Non-Goals
- 不在本次规划中支持“进程内部热替换代码而不重启”。
- 不在本次规划中实现跨机器滚动升级。
- 不在本次规划中支持任意包管理器的全部私有特性；首版只覆盖 npm 语义。
- 不在本次规划中兼容、生成、安装或接管任何外部 supervisor（systemd、pm2、docker、launchd 等）。
- 不在本次规划中允许 direct 模式静默派生脱离父进程的孤儿进程。

## Data Model (schema-first)

### 1. 启动模式
- 启动模式必须定义为枚举：
  - `launcher`: 由 `myz-bot launch` 拉起 `serve` 子进程并负责重启；launcher 与 worker 都来自同一个 `myz-bot.cjs` 入口。
  - `direct-ephemeral`: 直接执行 `npx myz-bot@latest serve` 或等价的一次性远程包命令。
  - `direct-pinned`: 直接执行本地安装或固定版本命令，例如 `node dist/myz-bot.cjs serve` 或 `npx myz-bot@0.1.3 serve`。

### 2. 配置模型
- `bot.yml` 必须新增 `upgrade` 配置块：

```yaml
upgrade:
  enabled: true
  packageName: "myz-bot"
  channel: "latest"
  checkIntervalMs: 21600000
  strategy: "notify"
  applyMode: "manual"
  allowPrerelease: false
```

- 字段约束必须为：
  - `enabled`: 是否启用版本检测。
  - `packageName`: 默认 `myz-bot`。
  - `channel`: 首版只允许 `latest` 或显式 semver 版本字符串。
  - `checkIntervalMs`: 版本检测周期，必须大于 0。
  - `strategy`: `notify` 或 `prepare-and-restart`。
  - `applyMode`: `manual`、`launcher-only`。
  - `allowPrerelease`: 默认为 `false`。
- `bot.yml` 不允许再声明 `workspaceRoot`；workspace 只能由 CLI `-w` 决定。

### 3. Runtime 状态文件
- runtime namespace `~/.myz-bot/workspaces/<workspaceId>/system/` 下必须新增：
  - `system/launch.json`
  - `system/upgrade-state.json`
  - `system/restart-request.json`

- `system/launch.json` 至少包含：
  - `mode`
  - `configPath`
  - `workspaceRoot`
  - `workspaceId`
  - `cwd`
  - `command`
  - `args`
  - `envAllowlist`
  - `createdAt`
  - `updatedAt`

- `system/upgrade-state.json` 至少包含：
  - `currentVersion`
  - `lastCheckedAt`
  - `lastKnownVersion`
  - `pendingVersion`
  - `status`
  - `lastError`

- `system/restart-request.json` 至少包含：
  - `reason`
  - `requestedAt`
  - `targetVersion`
  - `requestedBy`

### 4. CLI 模型
- CLI 必须新增：
  - `myz-bot launch [-w <path>]`
  - `myz-bot upgrade check [-w <path>]`
  - `myz-bot upgrade apply [-w <path>]`
- `serve` 必须保留，但语义改为“worker 进程入口”，而不是推荐的生产启动命令。
- `serve -c` 与 `check -c` 必须删除。
- 所有命令的 workspace 默认值必须是 `process.cwd()`。

### 5. 单文件 bundle 与 launcher 结构
- `myz-bot` 必须继续只发布一个 `myz-bot.cjs` 文件。
- `launch` 与 `serve` 必须是同一个入口文件中的两个命令分支，不允许要求第二个 npm 包或第二个独立二进制。
- `launch` 模式下，父进程必须通过再次执行同一个入口文件来拉起 worker：
  - 本地安装 / 固定版本场景：`process.execPath <entryFile> serve ...`
  - `npx @latest` 场景：`npx -y myz-bot@latest serve ...`
- 当需要升级 launcher 自身时，旧 launcher 必须拉起“新一代 launcher”而不是只拉起新 worker。
- 代际切换必须采用 handoff 协议：新 launcher 启动成功并接管 runtime 锁后，旧 launcher 才允许退出。

### 6. 退出码与重启协议
- `serve` 需要重启时，必须写入 `system/restart-request.json` 后再退出。
- `launcher` 读取退出码与 `restart-request.json` 共同决定是否拉起新 worker。
- 仅靠退出码不足以表达升级意图；退出码只表示“需要被托管层处理”。
- 非 `launcher` 模式下，bot 不保证自动拉起；`direct-*` 模式只允许通知，不允许宣称支持无人值守升级。

## UX / Flow

### 推荐模式 A: launcher
1. 用户执行 `npx myz-bot@latest launch` 或 `npx myz-bot@latest launch -w /abs/path/to/workspace`。
2. `launch` 记录 `system/launch.json`，然后拉起 `serve` 子进程。
3. 子进程正常运行 bot。
4. 当 `/ops upgrade apply` 或自动策略触发升级时，worker 写入 `restart-request.json` 并退出。
5. `launch` 检查目标版本与 channel。
6. 若 channel 是 `latest`，旧 launcher 必须先执行 `npx -y myz-bot@latest launch -w ... --handoff <token>` 拉起新一代 launcher。
7. 新 launcher 成功接管后，再由它拉起最新版本 worker。
8. 新 worker 启动成功后更新 `upgrade-state.json` 与 `launch.json`。

### 受限模式 B: direct-ephemeral
1. 用户直接执行 `npx myz-bot@latest serve` 或 `npx myz-bot@latest serve -w ...`。
2. bot 可以检查版本并提示有新版本。
3. bot 不允许自动 `apply` 升级，因为当前进程没有可靠的托管父进程。
4. `/ops upgrade apply` 必须直接拒绝，并明确提示改用 `launch`。

### 受限模式 C: direct-pinned
1. 用户直接执行固定版本命令。
2. bot 可以检查可用新版本。
3. 若 `applyMode` 不是 `manual`，系统仍必须拒绝自动升级，因为固定版本命令重启后不会变成新版本。

## Dependencies / Constraints
- 依赖 `myz-bot/src/cli.ts` 增加新的命令层。
- 依赖 `myz-bot/src/maintenance.ts` 现有 `requestProcessRestart()`；该能力必须升级为“写重启请求 + 退出”的协议。
- 依赖 `myz-bot/src/index.ts` 的 `/ops` 命令分发；需要新增 `/ops upgrade status|check|apply`。
- 依赖 `myz-bot` 当前单文件打包方式；launcher 逻辑必须与 worker 一起打进同一个 `myz-bot.cjs`。
- 依赖 workspace 解析逻辑；launcher 与 worker 必须共享 `-w` 解析与 `workspaceId` 计算规则。
- 依赖运行环境能调用 `npx`；若 `launcher` 模式下系统不存在 `npx`，则必须启动失败并给出明确错误。
- 版本检测首版必须使用 npm registry 查询；网络不可用时只能保留最近一次状态，不允许伪造“已升级”。
- 升级流程必须串行；同一时刻只允许一个 pending upgrade。
- 外部 supervisor 相关模板、安装流程与兼容测试全部不进入本期实现。

## Acceptance Criteria
- Given 用户执行 `myz-bot launch` 或 `myz-bot launch -w /abs/path/to/workspace`, When launcher 成功启动, Then runtime 必须生成 `system/launch.json`，且 worker 由 launcher 子进程拉起。
- Given `myz-bot` 发布产物是单个 `myz-bot.cjs`, When 用户执行 `launch`, Then launcher 与 worker 必须都来自同一个入口文件，不允许依赖第二个独立 supervisor 二进制。
- Given bot 运行在 `launcher` 模式且 channel 为 `latest`, When `/ops upgrade apply` 触发, Then worker 必须写入 `system/restart-request.json` 并退出，旧 launcher 必须拉起新的 `npx -y myz-bot@latest launch -w ...` 代际进程。
- Given 新一代 launcher 尚未完成 handoff, When 旧 launcher 处理升级, Then 旧 launcher 不允许提前退出。
- Given bot 运行在 `direct-ephemeral` 模式，When 用户执行 `/ops upgrade apply`, Then 命令必须失败并返回“该模式不支持无人值守升级”的明确提示。
- Given bot 运行在 `direct-pinned` 模式，When 检测到更高版本, Then `/ops upgrade check` 必须报告新版本，但 `/ops upgrade apply` 必须拒绝自动执行。
- Given npm registry 不可达, When 执行升级检查, Then `upgrade-state.json` 必须记录失败信息，当前 worker 必须继续运行。
- Given 已存在 `pendingVersion`, When 再次发起升级申请, Then 系统必须拒绝第二次申请并返回当前 pending 状态。

## Verification Plan
- 单元测试：
  - `node --import tsx --test tests/maintenance.test.ts tests/cli.test.ts`
  - 新增 `tests/upgrade.test.ts` 覆盖模式判定、状态文件写入、apply 拒绝逻辑。
- 集成测试：
  - 用假 `npx` 可执行文件模拟 `launcher` 模式，验证 restart request -> child relaunch 流程。
- 手动验证：
  - 以 `npx myz-bot@latest launch -w ...` 启动，执行 `/ops upgrade check` 与 `/ops upgrade apply`。
  - 以 `npx myz-bot@latest serve -w ...` 启动，确认 `/ops upgrade apply` 被拒绝且提示切换模式。
  - 以固定版本命令启动，确认 upgrade check 能报告新版本但不会自动升级。

## Risks / Rollback
- 风险：如果 launcher 对环境变量、cwd、configPath 记录不完整，重启后的 worker 行为会漂移。
- 风险：如果升级检查与自动重启耦合过紧，网络抖动可能引发无意义重启。
- 风险：`npx` 在不同平台上的缓存路径与交互行为有差异，首版必须严格限制命令模板。
- 风险：单文件 launcher 进行代际切换时，如果 handoff 协议不完整，可能出现双 launcher 并存或无人托管窗口。
- 回退策略：
  - `serve` 保持可直接运行，任何 launcher 问题都不阻断手工启动。
  - `upgrade.enabled=false` 时必须完全关闭版本检测与自动申请。
  - 若 launcher 连续重启失败超过阈值，必须停止拉起并保留最后错误，避免无限重启环。

## Use Cases / Scenarios
- 主路径：
  - 用户以 `launch` 模式运行 bot，bot 检测到 npm 上有新版本，管理员执行 `/ops upgrade apply` 后 bot 自动重启到新版本。
- 边界路径 1：
  - 用户直接以 `npx myz-bot@latest serve -w ...` 裸跑，bot 只能提示升级，不能自动 apply。
- 边界路径 2：
  - 用户处于 `direct-pinned` 模式，bot 可以告知最新版本，但必须拒绝自动 apply。
- 失败路径：
  - launcher 重启时 `npx` 不可用；launcher 必须停止并记录失败，不允许反复空转重试。

## Boundary Conditions
- npm registry 超时或返回非 semver 结果
- `launch.json` 被手动篡改或缺字段
- 同时收到 `/ops restart` 与 `/ops upgrade apply`
- worker 尚未退出时再次收到升级请求
- 连续重启失败的退避与熔断阈值

## Open Questions
- 是否需要支持私有 npm registry 或镜像源；若需要，应通过 `bot.yml.upgrade.registryUrl` 单独配置。

## Recommendation
- 生产推荐模式只有一个：`myz-bot launch -w ...`
- `npx myz-bot@latest serve` 单独裸跑只适合开发、试用和短时会话，不允许宣称支持自动升级。
- 单文件发布不需要额外 supervisor 包；`launch` 就是同一 `myz-bot.cjs` 内置的 supervisor 分支。

## Change Log
- 2026-03-26
  - 新增自升级与启动托管规划。
  - 明确 `direct-ephemeral` 不支持无人值守自动升级。
  - 收敛为只支持内置 `launch`，暂不兼容任何外部 supervisor。
  - 改为 `-w` 选择 workspace，删除 `-c` / `workspaceRoot` 语义。
  - 明确 supervisor 以同一个单文件 `myz-bot.cjs` 的 `launch` 子命令形态交付。
  - 为 `npx @latest launch` 设计 launcher 代际 handoff，而不是额外 bundle 第二个守护进程。
  - 落地首版实现：新增 `upgrade` 配置块、`upgrade-state.json`、CLI `upgrade`、`/ops upgrade`，以及 launcher 的 file-based handoff。
