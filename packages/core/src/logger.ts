/**
 * Structured Logger — consistent logging across all Wai services.
 *
 * Every significant action is logged with context.
 * Sentry integration for error tracking.
 *
 * Log levels: debug, info, warn, error
 * All logs include: timestamp, service, action, context
 */

interface LogContext {
  service?: string;
  userId?: string;
  action?: string;
  intent?: string;
  model?: string;
  tokens?: number;
  duration?: number;
  error?: string;
  [key: string]: unknown;
}

type LogLevel = "debug" | "info" | "warn" | "error";

let sentryModule: typeof import("@sentry/node") | null = null;
let sentryInitialized = false;

/**
 * Initialize Sentry error tracking.
 * Call once at app startup.
 */
export async function initSentry(dsn: string, opts?: {
  environment?: string;
  release?: string;
  service?: string;
}) {
  if (!dsn || sentryInitialized) return;

  try {
    sentryModule = await import("@sentry/node");
    sentryModule.init({
      dsn,
      environment: opts?.environment ?? "development",
      release: opts?.release ?? "wai@0.1.0",
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      initialScope: {
        tags: { service: opts?.service ?? "wai" },
      },
    });
    sentryInitialized = true;
    log.info({ service: "sentry", action: "initialized" });
  } catch (e) {
    console.warn("Sentry init failed:", e);
  }
}

/**
 * Capture exception in Sentry with context.
 */
export function captureError(error: Error | unknown, context?: LogContext) {
  if (!sentryModule || !sentryInitialized) return;

  sentryModule.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      if (context.userId) scope.setUser({ id: context.userId });
      if (context.service) scope.setTag("service", context.service);
      if (context.action) scope.setTag("action", context.action);
    }
    sentryModule!.captureException(error);
  });
}

function formatLog(level: LogLevel, context: LogContext, message?: string): string {
  const ts = new Date().toISOString();
  const parts: string[] = [`[${ts}]`, `[${level.toUpperCase()}]`];

  if (context.service) parts.push(`[${context.service}]`);
  if (context.action) parts.push(context.action);
  if (message) parts.push(message);

  // Add extra context as key=value
  const extras = Object.entries(context)
    .filter(([k]) => !["service", "action"].includes(k))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");

  if (extras) parts.push(extras);

  return parts.join(" ");
}

/**
 * Structured logger instance.
 */
export const log = {
  debug(ctx: LogContext, msg?: string) {
    if (process.env.NODE_ENV !== "production" || process.env.DEBUG) {
      console.debug(formatLog("debug", ctx, msg));
    }
  },

  info(ctx: LogContext, msg?: string) {
    console.info(formatLog("info", ctx, msg));
  },

  warn(ctx: LogContext, msg?: string) {
    console.warn(formatLog("warn", ctx, msg));
  },

  error(ctx: LogContext, msg?: string) {
    console.error(formatLog("error", ctx, msg));

    // Auto-capture errors in Sentry
    if (ctx.error) {
      captureError(new Error(typeof ctx.error === "string" ? ctx.error : JSON.stringify(ctx.error)), ctx);
    }
  },
};
