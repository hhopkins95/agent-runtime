import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import type { Context, Next } from "hono";
import { EventBus } from "../../core/event-bus";
import { SessionManager } from "../../core/session-manager";
import { createSessionRoutes } from "./routes/sessions";
import { createMessageRoutes } from "./routes/messages";

/**
 * Error response helper
 */
export function errorResponse(message: string, code?: string, details?: unknown) {
  return {
    error: message,
    ...(code && { code }),
  };
}

/**
 * API Key authentication middleware
 */
function apiKeyAuth(apiKey: string) {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader) {
      throw new HTTPException(401, {
        message: JSON.stringify(errorResponse("Missing Authorization header", "AUTH_REQUIRED"))
      });
    }

    // Support "Bearer <token>" or just "<token>"
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    if (token !== apiKey) {
      throw new HTTPException(401, {
        message: JSON.stringify(errorResponse("Invalid API key", "INVALID_API_KEY"))
      });
    }

    await next();
  };
}

export const createRestServer = ({
  sessionManager,
  eventBus,
  config,
}: {
  sessionManager: SessionManager;
  eventBus: EventBus;
  config: {
    apiKey: string;
  };
}): Hono => {
  const app = new Hono()

  // Middleware
  .use("*", cors())
  .use("*", logger())

  // Global error handler
  .onError((err, c) => {
    if (err instanceof HTTPException) {
      const status = err.status;
      let response;

      try {
        // Try to parse the message as JSON (from our errorResponse helper)
        response = JSON.parse(err.message);
      } catch {
        // Fallback to plain message
        response = errorResponse(err.message);
      }

      return c.json(response, status);
    }

    // Unexpected errors
    console.error("Unexpected error:", err);
    return c.json(errorResponse("Internal server error", "INTERNAL_ERROR"), 500);
  })

  // Health check (no auth required)
  .get("/health", (c) => c.json({ status: "ok" }))

  // API routes (auth required)
  .use("/api/*", apiKeyAuth(config.apiKey))

  // TODO: Session routes will go here (File 6)
  .route("/api/sessions", createSessionRoutes(sessionManager, eventBus))

  // TODO: Message routes will go here (File 7)
  .route("/api/sessions/:id/messages", createMessageRoutes(sessionManager, eventBus));

  return app;
};
