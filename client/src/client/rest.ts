/**
 * REST API Client for Agent Service
 *
 * Handles all HTTP communication with the agent-service REST API.
 * Provides type-safe methods for session and message operations.
 */

import type {
  SessionListItem,
  RuntimeSessionData,
  CreateSessionRequest,
  CreateSessionResponse,
  SendMessageRequest,
  SendMessageResponse,
  ApiError,
  AGENT_ARCHITECTURE_TYPE,
} from '../types';

export class RestClient {
  private baseUrl: string;
  private apiKey: string;
  private debug: boolean;

  constructor(baseUrl: string, apiKey: string, debug = false) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
    this.debug = debug;
  }

  /**
   * Make an authenticated HTTP request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    if (this.debug) {
      console.log('[RestClient]', options.method || 'GET', url);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle non-200 responses
      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({
          error: response.statusText,
          code: `HTTP_${response.status}`,
        }));

        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (this.debug) {
        console.error('[RestClient] Request failed:', error);
      }
      throw error;
    }
  }

  // ==========================================================================
  // Session Operations
  // ==========================================================================

  /**
   * Create a new agent session
   */
  async createSession(
    agentProfileRef: string,
    architecture: AGENT_ARCHITECTURE_TYPE
  ): Promise<CreateSessionResponse> {
    const body: CreateSessionRequest = {
      agentProfileRef,
      architecture,
    };

    return this.request<CreateSessionResponse>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * List all sessions with their runtime state
   */
  async listSessions(): Promise<SessionListItem[]> {
    const response = await this.request<{ sessions: SessionListItem[] }>(
      '/api/sessions'
    );
    return response.sessions;
  }

  /**
   * Get full session data including transcript and files
   */
  async getSession(sessionId: string): Promise<RuntimeSessionData> {
    return this.request<RuntimeSessionData>(`/api/sessions/${sessionId}`);
  }

  /**
   * Destroy a session and cleanup resources
   */
  async destroySession(sessionId: string): Promise<void> {
    await this.request<{ success: boolean; sessionId: string }>(
      `/api/sessions/${sessionId}`,
      {
        method: 'DELETE',
      }
    );
  }

  /**
   * Manually trigger session state sync to persistence
   */
  async syncSession(sessionId: string): Promise<void> {
    await this.request<{ success: boolean; sessionId: string }>(
      `/api/sessions/${sessionId}/sync`,
      {
        method: 'POST',
      }
    );
  }

  // ==========================================================================
  // Message Operations
  // ==========================================================================

  /**
   * Send a message to the agent
   * Note: Response comes via WebSocket, not HTTP response
   */
  async sendMessage(
    sessionId: string,
    content: string
  ): Promise<SendMessageResponse> {
    const body: SendMessageRequest = { content };

    return this.request<SendMessageResponse>(
      `/api/sessions/${sessionId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  }

  // ==========================================================================
  // Health Check
  // ==========================================================================

  /**
   * Check if the API server is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request<{ status: string }>('/health');
      return response.status === 'ok';
    } catch {
      return false;
    }
  }
}
