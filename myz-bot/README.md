# myz-bot

`myz-bot` 是一个通过 Telegram 与用户交互的命令行 bot。

## Usage

```bash
# 初始化当前工作区
npx myz-bot -- init

# 初始化指定工作区
npx myz-bot -- init -w /abs/path/to/workspace

# 启动
npx myz-bot -- serve -w /abs/path/to/workspace

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

# 迁移旧布局
npx myz-bot -- migrate-layout -w /abs/path/to/workspace

# 运行测试
npm test
```
