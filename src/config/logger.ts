type LogLevel = "info" | "warn" | "error" | "debug";

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const metaWithErrors = meta ? Object.fromEntries(
    Object.entries(meta).map(([key, value]) => {
      if (value instanceof Error) {
        // Concise error formatting
        const errorObj: any = {
          errorMessage: value.message.length > 500 ? value.message.substring(0, 500) + "... [TRUNCATED]" : value.message,
          name: value.name,
        };
        
        // For Prisma errors, the first few lines of the message usually contain the actual error
        // the rest is just schema/code blocks we want to hide in logs.
        if (value.name.includes("Prisma")) {
          const lines = value.message.split("\n");
          errorObj.errorMessage = lines[0] + (lines[1] ? "\n" + lines[1] : "");
        }

        if (value.stack) {
          // Keep only first 5 lines of stack trace for conciseness
          errorObj.stack = value.stack.split("\n").slice(0, 5).join("\n");
        }
        
        return [key, errorObj];
      }
      return [key, value];
    })
  ) : {};

  const payload = {
    level,
    logMessage: message.length > 500 ? message.substring(0, 500) + "... [TRUNCATED]" : message,
    ...metaWithErrors,
    timestamp: new Date().toISOString(),
  };
  const out = level === "error" ? process.stderr : process.stdout;
  out.write(JSON.stringify(payload) + "\n");
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => log("debug", message, meta),
};
