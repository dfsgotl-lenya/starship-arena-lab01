import { pino } from "pino";
import type { Logger } from "pino";

export type { Logger };

/**
 * Structured JSON logs to stdout (Twelve-Factor XI): the platform collects
 * stdout; we never format text or write log files on the hot path.
 * Events are named (`room.created`, `ws.rejected`), carry `roomId`/`playerId`,
 * and never contain message bodies, tokens or secrets.
 */
export function createLogger(
  level: string,
  base: Record<string, unknown> = {},
): Logger {
  return pino({
    level,
    base: { service: "starship-arena", ...base },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "headers.authorization",
        "headers.cookie",
        "*.password",
        "*.token",
        "*.secret",
        "text",
      ],
      censor: "[redacted]",
    },
  });
}

/** Silent logger for unit tests. */
export const silentLogger: Logger = pino({ level: "silent" });
