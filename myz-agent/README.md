# myz-bot

`myz-bot` 是一个可通过 Telegram 或本地 TUI 与用户交互的命令行 bot。

支持的 LLM provider 仅保留：
- `openai_compatible`
- `openai_responses`
- `gemini`
- `anthropic`
- `mistral`

`myz-bot` 通过 `@myz/ai-core` 复用统一的 provider session，因此会继承各官方 SDK 客户端的 streaming、tool calling、reasoning 归一化和 provider-specific 请求整形。

`openai_compatible` 需要通过 `compatProfile` 区分供应商能力：
- Tier 1：`deepseek` / `moonshot` / `glm`
- Tier 2：`qwen` / `minimax` / `longcat` / `mimo` / `custom`

`mistral` 走官方 `@mistralai/mistralai` SDK 路线，不通过 `openai_compatible` 兼容层。

## Usage

```bash
# 初始化当前工作区
npx myz-bot -- init

# 初始化指定工作区
npx myz-bot -- init -w /abs/path/to/workspace

# 启动
npx myz-bot -- serve -w /abs/path/to/workspace

# 强制开启 curses-style TUI dashboard
npx myz-bot -- serve --tui -w /abs/path/to/workspace

# 用内置 launcher 启动
npx myz-bot -- launch -w /abs/path/to/workspace

# 检查 Telegram / LLM 配置
npx myz-bot -- check -w /abs/path/to/workspace

# 查看升级状态
npx myz-bot -- upgrade status -w /abs/path/to/workspace

# 检查新版本
npx myz-bot -- upgrade check -w /abs/path/to/workspace

# 申请升级
npx myz-bot -- upgrade apply -w /abs/path/to/workspace

# 运行测试
npm test
```
