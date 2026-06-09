import { Command } from "commander"
import { serveBot } from "./index"
import { checkConfig } from "./check"

const program = new Command()

program
  .name("myz-bot")
  .description("MyZ Bot CLI")

program
  .command("serve", { isDefault: true })
  .description("Start bot")
  .option("-w, --workspace <path>", "Workspace path")
  .option("--tui", "Force-enable terminal dashboard")
  .option("--no-tui", "Disable terminal dashboard")
  .action(async (options: { workspace?: string; tui?: boolean }) => {
    await serveBot({
      workspaceRoot: options.workspace,
      enableTui: options.tui,
    })
  })

program
  .command("check")
  .description("Check LLM connectivity")
  .option("-w, --workspace <path>", "Workspace path")
  .action(async (options: { workspace?: string }) => {
    await checkConfig({
      workspaceRoot: options.workspace,
    })
  })

program.parseAsync(process.argv).catch((error) => {
  console.error("Command failed:", error)
  process.exit(1)
})
