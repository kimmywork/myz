/**
 * Tiny scoped logger shared by the extension, content scripts and readers.
 *
 * It keeps every message prefixed with `[myz:<scope>]`, supports a runtime
 * level floor (debug → error), and guards `console` so importing it in a
 * non-browser host never throws. New code should use `createLogger(scope)`
 * instead of bare `console.*` so a future build can quiet debug output.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let minimumLevel: LogLevel = "debug";

/** Sets the minimum level emitted by loggers created afterwards. */
export function setLogLevel(level: LogLevel): void {
  minimumLevel = level;
}

/** Returns the current minimum log level. */
export function getLogLevel(): LogLevel {
  return minimumLevel;
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** Creates a logger that prefixes every message with `[myz:<scope>]`. */
export function createLogger(scope: string): Logger {
  const write = (level: LogLevel, args: unknown[]): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minimumLevel]) {
      return;
    }
    const consoleRef = globalThis.console;
    if (!consoleRef) {
      return;
    }
    const method = consoleRef[level] ?? consoleRef.log;
    method.call(consoleRef, `[myz:${scope}]`, ...args);
  };

  return {
    debug: (...args) => write("debug", args),
    info: (...args) => write("info", args),
    warn: (...args) => write("warn", args),
    error: (...args) => write("error", args),
  };
}
