import winston from "winston";
import { Writable } from "node:stream";
import { env, isProduction } from "../config/env";

export type LogEntry = {
  id: number;
  timestamp: string;
  level: string;
  message: string;
  meta?: Record<string, unknown>;
};

const memoryLogs: LogEntry[] = [];
let nextLogId = 1;

const memoryStream = new Writable({
  write(chunk, _encoding, callback) {
    const message = chunk.toString();
      try {
        const parsed = JSON.parse(message) as Omit<LogEntry, "id">;
        memoryLogs.push({ id: nextLogId++, ...parsed });
        if (memoryLogs.length > env.LOG_BUFFER_SIZE) {
          memoryLogs.splice(0, memoryLogs.length - env.LOG_BUFFER_SIZE);
        }
      } catch {
        memoryLogs.push({
          id: nextLogId++,
          timestamp: new Date().toISOString(),
          level: "info",
          message: message.trim()
        });
      }

    callback();
  }
});

const memoryTransport = new winston.transports.Stream({ stream: memoryStream });

const cloudRunFormat = winston.format.printf((info) => {
  const { level, message, timestamp, ...meta } = info;
  return JSON.stringify({
    severity: String(level).toUpperCase(),
    timestamp,
    message,
    ...meta
  });
});

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: isProduction
        ? winston.format.combine(winston.format.timestamp(), cloudRunFormat)
        : winston.format.combine(winston.format.colorize(), winston.format.simple())
    }),
    memoryTransport
  ]
});

export function getBufferedLogs(options: {
  level?: string;
  q?: string;
  sort?: "asc" | "desc";
  limit?: number;
}) {
  const normalizedQuery = options.q?.trim().toLowerCase();
  const limit = Math.min(Math.max(options.limit ?? 200, 1), env.LOG_BUFFER_SIZE);
  const sort = options.sort ?? "desc";

  let logs = [...memoryLogs];
  if (options.level) {
    logs = logs.filter((entry) => entry.level === options.level);
  }

  if (normalizedQuery) {
    logs = logs.filter((entry) => {
      const haystack = `${entry.message} ${JSON.stringify(entry.meta ?? {})}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }

  logs.sort((a, b) => sort === "asc" ? a.id - b.id : b.id - a.id);
  return logs.slice(0, limit);
}
