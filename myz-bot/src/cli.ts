import { Command } from "commander"
import { serveBot } from "./index"
import { initWorkspace } from "./init"
import { checkConfig } from "./check"
import { applyProxyFromEnv } from "./proxy"

const program = new Command()

program
  .name("myz-bot")
  .description("MyZ Bot CLI")

program
  .command("serve", { isDefault: true })
  .description("Start telegram bot")
  .action(async () => {
    applyProxyFromEnv()
    await serveBot()
  })

program
  .command("init")
  .description("Generate bot.yml/SOUL.md and working directories")
  .action(async () => {
    await initWorkspace()
  })

program
  .command("check")
  .description("Check Telegram + LLM connectivity")
  .action(async () => {
    applyProxyFromEnv()
    await checkConfig()
  })

program.parseAsync(process.argv).catch((error) => {
  console.error("Command failed:", error)
  process.exit(1)
})
