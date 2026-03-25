# myz-bot 角色成长与反馈强化

## Vision
- 让 bot 的人设成长不再只是偶发的 SOUL 草案波动，而是可积累、可约束、可解释的长期反馈强化过程。
- 用户的鼓励、认可、纠偏和明确偏好，应该逐步影响 bot 的气质、动机与行为倾向。

## Scope
- `soul.autoDraft` 默认开启。
- 新增独立的角色成长状态层，记录用户反馈对角色行为维度的渐进影响。
- 将成长状态注入 bot 的系统提示，使 bot 知晓自己的长期变化。
- 将成长状态注入 SOUL auto-draft 生成链路，使草案能吸收长期反馈而不是只看最近几句。
- 新增关系/印象状态层，记录 bot 对不同对象的长期关系判断、印象摘要与主动联系边界。
- 支持在已有关系与已知私聊会话基础上，代为向其他对象转告消息，但必须显式标注为 bot 转告。

## Non-Goals
- 不实现完全自由的人格重写。
- 不允许单轮对话直接改写核心身份、关系与世界观。
- 不引入复杂的奖励模型训练或在线学习。

## Data Model
- `bot.yml`
  - `soul.autoDraft: true` 默认开启
- `soul/growth.json`
  - 结构化成长状态，保存各维度偏移与近期事件
- `soul/growth-events.jsonl`
  - 反馈事件流水
- `relationships/index.json`
  - 每个对象的关系状态、印象摘要、昵称别名与主动联系边界

## Growth Model
- 基础人设仍以 `SOUL.md` 为准。
- 成长层记录在若干维度上的“相对偏移”：
  - 温柔度
  - 锋芒
  - 俏皮度
  - 主动性
  - 情感外露
  - 自信度
- 边界策略：
  - 变化以基础 SOUL 为中心，越偏离基础，增量越慢。
  - 允许长期累积把角色往另一端调教过去，但不允许瞬间跳变。

## UX / Flow
- 用户说“点赞”“谢谢”“辛苦了”等正向反馈时，bot 会强化最近表现出来的若干气质。
- 用户说“温柔一点”“别那么凶”“别太主动”等显式偏好时，bot 会直接调整对应维度。
- 当用户下一次和 bot 交流时，bot 会通过角色成长上下文感知到这些变化。
- 当 auto-draft 触发时，SOUL 草案会把成长状态一并考虑进去，但保持身份连续性。
- bot 会在批量反思时更新自己与对象的关系/印象记录，而不是只靠即时词表匹配。
- 当用户明确要求 bot 通知另一个已知联系人时，bot 可以通过既有私聊会话转告，但不会冒充用户本人。

## Acceptance Criteria
- 正向或负向反馈会写入 `soul/growth-events.jsonl`。
- `growth.json` 中的各维度会随反馈稳定增减，并受边界策略限制。
- bot 的系统 prompt 会包含角色成长摘要。
- `soul.autoDraft` 默认开启，且草案提示会包含成长状态与边界要求。
- `relationships/index.json` 会保存对象关系、印象与联系边界。
- bot 的系统 prompt 会注入当前对象的关系/印象上下文。
- 已压缩的对话摘要不再保留工具响应和工具审计内容。
- bot 可以向已有私聊对象发送转告消息，但消息文本必须显示其来源是 bot 转告。

## Verification
- `npm test`
- `npx tsc --noEmit`
- `npm run build`

## Status
- Done (2026-03-12)

## Next Immediate Task
- 主题：恢复层命中策略与候选裁剪优化
- 优先级：Immediate
- 背景：
  - 当前已经有 LLM 主导的跨层恢复：当运行时历史过薄时，系统会把 chronicle、summary、growth、relationship、memory、archive 作为候选交给模型压成 `recovered-context`。
  - 但恢复触发目前仍主要依赖“运行时历史偏薄”的代码阈值，候选材料裁剪也还比较粗。
  - 如果继续扩大长期状态层，恢复候选过多会带来额外延迟和无关噪音。
- 下一步目标：
  - 让恢复触发策略更多参考 LLM 判断，而不是主要依赖固定 history 阈值。
  - 为跨层恢复增加更细的候选裁剪与优先级整理，降低无关材料进入恢复 prompt 的概率。
  - 评估是否把恢复结果按意图类别缓存，而不是只按当前输入哈希缓存。
- 验收标准：
  - 恢复层不会因候选过多而显著拖慢普通对话。
  - 恢复触发和恢复缓存命中有更稳定、可解释的策略。
  - 候选材料进入恢复 prompt 的优先级边界在实现和文档中保持一致。

## Remaining Work (2026-03-17)
- 恢复层的触发仍以代码阈值为主，尚未升级成更明显的 LLM 主导策略；这一点仍是角色成长层的首要未完成项。
- 真实运行时的 SOUL / growth / relationship 维护仍缺少运维型清理命令；当前更多依赖自动归档与人工裁剪。
- 虽然 reflection 已按会话串行，避免了重复草案，但跨会话共享长期状态的治理仍主要依赖单文件收敛与顺序写入，尚未形成更细粒度的合并策略。

## Change Log
- 2026-03-12
  - Bot: `soul.autoDraft` 默认改为开启。
  - Bot: 新增 `growth.json` / `growth-events.jsonl` 作为角色成长状态层。
  - Bot: 新增基于用户鼓励、纠偏和明确偏好的反馈强化逻辑。
  - Bot: 系统 prompt 与 SOUL auto-draft 生成链路现在都会注入角色成长上下文。
  - Bot: 成长反馈改为批量 LLM 反思，不再阻塞每条消息的即时响应。
  - Bot: 新增 `relationships/index.json` 存储 bot 对不同对象的关系、印象、昵称与主动联系边界。
  - Bot: 系统 prompt 现在会注入当前对象的关系/印象上下文。
  - Bot: 对话压缩摘要不再保留工具响应或工具审计内容。
  - Bot: 新增已知联系人列举与跨会话转告消息能力，且消息会明确标记为 bot 转告。
  - Bot: 新增按时间周期触发的 growth / relationship / SOUL auto-draft 补偿分析；即使消息数未达阈值，只要对应批次沉淀到设定时间，也会做一次反思并推进会话级处理水位，避免后续重复处理或突兀跳变。
  - Plan: 将“多会话反思隔离与全局状态冲突治理”标记为下一步立即处理任务，重点处理全局 SOUL 覆盖与多会话成长混合边界。
- 2026-03-13
  - Bot: growth / relationship / SOUL auto-draft 反思统一改为读取 `telegram-history.jsonl`，并以 Telegram message id 水位去重，替代会话内可见消息 offset。
  - Bot: SOUL 草案创建与应用现在通过进程级队列串行执行，并把创建/应用记录写入 `soul/audit.jsonl`，降低多会话并发覆盖风险。
  - Bot: 新增 `context/chat-chronicle.md` 作为基于 Telegram 增量记录滚动更新的长期聊天编年摘要，并在系统 prompt 中注入。
  - Bot: prompt-visible `SOUL.md` 和自动草案链路现在会做结构化收敛，避免角色设定无限增长。
  - Bot: `soul/growth-events.jsonl` 与 `relationships/reflections.jsonl` 现在作为近期原始反思流水保留，超阈值的旧记录会自动归档到各自的 `archive/` 目录。
  - Bot: `growth.json` 与 `relationships/index.json` 继续承担当前稳定状态层；关系摘要字段在写入时会自动收敛，避免单字段无限增长。
  - Bot: 新增 LLM 主导的跨层恢复层；当运行时历史偏薄时，系统会从 chronicle / summary / growth / relationships / memory / archive 中挑选相关候选并压缩为 `context/recovered-context.json` 注入提示词。
  - Plan: 下一步立即任务切换为“恢复层命中策略与候选裁剪优化”，继续减少恢复延迟和无关噪音。
 - 2026-03-17
  - Bot: reflection pass 现在按会话串行执行，避免消息处理与 scheduler 并发分析同一批 Telegram 记录，减少重复 growth / relationship / auto-draft。
  - Bot: growth / relationship / auto-draft 默认阈值上调并拉开，降低 `soul/audit.jsonl` 与原始反思流水的过密增长。
  - Bot: auto-draft 不再把“角色成长状态”与“最近反馈摘要”这类波动段直接沉回基础 `SOUL.md`，基础 SOUL 只吸收更稳定的长期结论。
