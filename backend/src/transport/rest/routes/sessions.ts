import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { SessionManager } from "../../../core/session-manager";
import type { EventBus } from "../../../core/event-bus";
import { errorResponse } from "../server";

export function createSessionRoutes(
  sessionManager: SessionManager,
  eventBus: EventBus
): Hono {
  const app = new Hono()

  /**
   * POST /api/sessions
   * Create a new session
   */
  .post(
    "/",
    zValidator(
      "json",
      z.object({
        agentProfileRef: z.string(),
        architecture: z.enum(["claude-agent-sdk", "gemini-cli"]),
      })
    ),
    async (c) => {
      const { agentProfileRef, architecture } = c.req.valid("json");

      try {
        const session = await sessionManager.createSession({ agentProfileRef, architecture });
        const sessionData = session.getState();

        return c.json(
          {
            sessionId: sessionData.sessionId,
            runtime: sessionData.runtime,
            createdAt: sessionData.createdAt,
          },
          201
        );
      } catch (error) {
        throw new HTTPException(500, {
          message: JSON.stringify(
            errorResponse(
              "Failed to create session",
              "SESSION_CREATE_FAILED",
              error instanceof Error ? error.message : String(error)
            )
          ),
        });
      }
    }
  )

  /**
   * GET /api/sessions
   * List all sessions
   */
  .get("/", async (c) => {
    try {
      const sessions = await sessionManager.getAllSessions();

      // Sessions are already in SessionListData format
      return c.json({ sessions });
    } catch (error) {
      throw new HTTPException(500, {
        message: JSON.stringify(
          errorResponse(
            "Failed to list sessions",
            "SESSION_LIST_FAILED",
            error instanceof Error ? error.message : String(error)
          )
        ),
      });
    }
  })
  /**
   * GET /api/sessions/:id
   * Get full session data
   */
  .get("/:id", async (c) => {
    const sessionId = c.req.param("id");

    try {
      // First check if session is already active
      let session = sessionManager.getSession(sessionId);

      // If not active, try to load from persistence
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

      // Get full session data including transcript, files, subagents
      const sessionData = session.getState();

      return c.json(sessionData);
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, {
        message: JSON.stringify(
          errorResponse(
            "Failed to get session data",
            "SESSION_GET_FAILED",
            error instanceof Error ? error.message : String(error)
          )
        ),
      });
    }
  })

  /**
   * DELETE /api/sessions/:id
   * Destroy session
   */
  .delete("/:id", async (c) => {
    const sessionId = c.req.param("id");

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new HTTPException(404, {
        message: JSON.stringify(
          errorResponse("Session not found", "SESSION_NOT_FOUND")
        ),
      });
    }

    try {
      await sessionManager.unloadSession(sessionId);

      return c.json({ success: true, sessionId });
    } catch (error) {
      throw new HTTPException(500, {
        message: JSON.stringify(
          errorResponse(
            "Failed to destroy session",
            "SESSION_DESTROY_FAILED",
            error instanceof Error ? error.message : String(error)
          )
        ),
      });
    }
  })

  /**
   * POST /api/sessions/:id/sync
   * Manually trigger session sync to persistence
   */
  .post("/:id/sync", async (c) => {
    const sessionId = c.req.param("id");

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new HTTPException(404, {
        message: JSON.stringify(
          errorResponse("Session not found", "SESSION_NOT_FOUND")
        ),
      });
    }

    try {
      await session.syncSessionStateToStorage();

      return c.json({ success: true, sessionId });
    } catch (error) {
      throw new HTTPException(500, {
        message: JSON.stringify(
          errorResponse(
            "Failed to sync session",
            "SESSION_SYNC_FAILED",
            error instanceof Error ? error.message : String(error)
          )
        ),
      });
    }
  })

  return app;
}
