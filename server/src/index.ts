import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.ts";
import { createApp } from "./app.ts";
import { createLogger } from "./logger.ts";

const config = loadConfig();
const logger = createLogger(config.logLevel, {
  version: config.version,
  gitSha: config.gitSha,
});

/**
 * Crash on unknowns: an uncaught exception means state we no longer
 * understand. Log the stack, flush, exit non-zero, and let the supervisor
 * (Docker / Render) start a clean process. Never swallow it.
 */
function crash(kind: string, error: unknown): void {
  logger.fatal({ event: "process.crash", kind, err: error });
  logger.flush();
  process.exit(1);
}
process.on("uncaughtException", (error) => crash("uncaughtException", error));
process.on("unhandledRejection", (reason) =>
  crash("unhandledRejection", reason),
);

const rootDir = fileURLToPath(new URL("../../", import.meta.url));
const app = await createApp(config, { logger, rootDir });
await app.listen();

let exiting = false;
async function onSignal(signal: NodeJS.Signals): Promise<void> {
  if (exiting) return;
  exiting = true;
  // Safety net: the platform sends SIGKILL after its grace period (10 s for
  // `docker stop`); make sure we are gone before that, with a log line.
  const force = setTimeout(() => {
    logger.error({ event: "server.shutdown_timeout", signal });
    logger.flush();
    process.exit(1);
  }, config.shutdownGraceMs);
  force.unref();
  await app.shutdown(signal);
  logger.flush();
  process.exit(0);
}
process.on("SIGTERM", (signal) => void onSignal(signal));
process.on("SIGINT", (signal) => void onSignal(signal));
