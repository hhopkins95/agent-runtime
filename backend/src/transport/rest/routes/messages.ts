import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { SessionManager } from "../../../core/session-manager";
import type { EventBus } from "../../../core/event-bus";
import { errorResponse } from "../server";

export function createMessageRoutes(
  sessionManager: SessionManager,
  eventBus: EventBus
) {
  const app = new Hono()

  /**
   * POST /api/sessions/:id/messages
   * Send a message to the agent (returns immediately, response via WebSocket)
   */
  .post(
    "/",
    zValidator(
      "json",
      z.object({
        content: z.string(),
      })
    ),
    async (c) => {
      const sessionId = c.req.param("id");
      if (!sessionId) {
        throw new HTTPException(400, {
          message: JSON.stringify(
            errorResponse("Session ID is required", "INVALID_REQUEST")
          ),
        });
      }

      const { content } = c.req.valid("json");

      // First check if session is already loaded in memory
      let session = sessionManager.getSession(sessionId);

      // If not loaded, try to load from persistence
      if (!session) {
        try {
          session = await sessionManager.loadSession(sessionId);
        } catch {
          // Session doesn't exist in persistence either
          throw new HTTPException(404, {
            message: JSON.stringify(
              errorResponse("Session not found", "SESSION_NOT_FOUND")
            ),
          });
        }
      }

      try {
        // Send message asynchronously (don't await response)
        session.sendMessage(content).catch((error) => {
          console.error(`Error sending message to session ${sessionId}:`, error);
          // Error will be emitted via WebSocket error event
        });

        // Return immediately
        return c.json({
          success: true,
          sessionId,
        });
      } catch (error) {
        throw new HTTPException(500, {
          message: JSON.stringify(
            errorResponse(
              "Failed to send message",
              "MESSAGE_SEND_FAILED",
              error instanceof Error ? error.message : String(error)
            )
          ),
        });
      }
    }
  );

  return app;
}
