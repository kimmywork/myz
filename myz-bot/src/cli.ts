import { Command } from "commander"
import { serveBot } from "./index"
import { initWorkspace } from "./init"
import { checkConfig } from "./check"
import { launchBot } from "./launch"
import {
  applyUpgrade,
  checkForUpgrade,
  formatUpgradeStatus,
  syncUpgradeState,
} from "./upgrade"
import { loadConfig } from "./config"

const program = new Command()

program
  .name("myz-bot")
  .description("MyZ Bot CLI")

program
  .command("serve", { isDefault: true })
  .description("Start telegram bot")
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
  .command("init")
  .description("Initialize runtime bot.yml and workspace docs")
  .option("-w, --workspace <path>", "Workspace path")
  .action(async (options: { workspace?: string }) => {
    await initWorkspace({
      workspaceRoot: options.workspace,
    })
  })

program
  .command("check")
  .description("Check Telegram + LLM connectivity")
  .option("-w, --workspace <path>", "Workspace path")
  .action(async (options: { workspace?: string }) => {
    await checkConfig({
      workspaceRoot: options.workspace,
    })
  })

program
  .command("launch")
  .description("Run the built-in launcher supervisor")
  .option("-w, --workspace <path>", "Workspace path")
  .option("--handoff <token>", "Internal handoff token")
  .option("--tui", "Force-enable terminal dashboard in worker")
  .option("--no-tui", "Disable terminal dashboard in worker")
  .action(async (options: { workspace?: string; handoff?: string; tui?: boolean }) => {
    await launchBot({
      workspaceRoot: options.workspace,
      handoffToken: options.handoff,
      enableTui: options.tui,
    })
  })

program
  .command("upgrade")
  .description("Check or apply bot upgrades")
  .argument("[action]", "status | check | apply", "status")
  .option("-w, --workspace <path>", "Workspace path")
  .action(async (action: string, options: { workspace?: string }) => {
    const config = loadConfig({
      workspaceRoot: options.workspace,
    })

    if (action === "status") {
      const state = syncUpgradeState(config)
      console.log(formatUpgradeStatus(state))
      return
    }

    if (action === "check") {
      try {
        const result = await checkForUpgrade({ config })
        console.log(formatUpgradeStatus(result.state))
      } catch (error) {
        const state = syncUpgradeState(config)
        console.log(formatUpgradeStatus(state))
        console.error(`Upgrade check failed: ${(error as Error).message}`)
        process.exitCode = 1
      }
      return
    }

    if (action === "apply") {
      try {
        const result = await applyUpgrade({
          config,
          requestedBy: "cli",
          scheduleExit: false,
        })
        console.log(result.message)
        console.log("")
        console.log(formatUpgradeStatus(result.state))
        if (!result.ok) {
          process.exitCode = 1
        }
      } catch (error) {
        const state = syncUpgradeState(config)
        console.log(formatUpgradeStatus(state))
        console.error(`Upgrade apply failed: ${(error as Error).message}`)
        process.exitCode = 1
      }
      return
    }

    throw new Error(`unknown upgrade action: ${action}`)
  })

program.parseAsync(process.argv).catch((error) => {
  console.error("Command failed:", error)
  process.exit(1)
})
