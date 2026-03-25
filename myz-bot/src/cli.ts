import { Command } from "commander"
import { serveBot } from "./index"
import { initWorkspace } from "./init"
import { checkConfig } from "./check"

const program = new Command()

program
  .name("myz-bot")
  .description("MyZ Bot CLI")

program
  .command("serve", { isDefault: true })
  .description("Start telegram bot")
  .option("-c, --config <path>", "Path to bot.yml")
  .action(async (options: { config?: string }) => {
    await serveBot({
      configPath: options.config,
    })
  })

program
  .command("init")
  .description("Generate bot.yml/SOUL.md/AGENTS.md/BOOTSTRAP.md and working directories")
  .action(async () => {
    await initWorkspace()
  })

program
  .command("check")
  .description("Check Telegram + LLM connectivity")
  .option("-c, --config <path>", "Path to bot.yml")
  .action(async (options: { config?: string }) => {
    await checkConfig({
      configPath: options.config,
    })
  })

program.parseAsync(process.argv).catch((error) => {
  console.error("Command failed:", error)
  process.exit(1)
})
