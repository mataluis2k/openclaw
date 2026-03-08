/**
 * Protocol type definitions for the OpenClaw ↔ voiceNode WebSocket bridge.
 *
 * Every message is JSON with a `type` discriminator, `id` (UUID), and `timestamp` (ISO 8601).
 */

// ── Authentication ──────────────────────────────────────────────────

export interface AuthMessage {
  type: "auth";
  id: string;
  timestamp: string;
  token: string;
  client: string;
  version: string;
  capabilities: string[];
}

export interface AuthResult {
  type: "auth_result";
  id: string;
  timestamp: string;
  success: boolean;
  sessionId?: string;
  error?: string;
}

// ── Chat (voiceNode → OpenClaw agent) ───────────────────────────────

export interface ChatRequest {
  type: "chat.request";
  id: string;
  timestamp: string;
  content: string;
  context: {
    tenantId: string;
    userId: string;
    personaId?: string;
    sessionId?: string;
  };
}

export interface ChatResponseDelta {
  type: "chat.response.delta";
  id: string;
  timestamp: string;
  requestId: string;
  delta: string;
  index: number;
  done: boolean;
  metadata?: Record<string, unknown>;
}

export interface ChatResponse {
  type: "chat.response";
  id: string;
  timestamp: string;
  requestId: string;
  content: string;
  done: true;
  metadata?: Record<string, unknown>;
}

// ── Tool Calls (OpenClaw agent → voiceNode) ─────────────────────────

export interface ToolCall {
  type: "tool.call";
  id: string;
  timestamp: string;
  toolName: string;
  arguments: Record<string, unknown>;
  context: {
    tenantId: string;
    userId: string;
    requestId: string;
  };
}

export interface ToolResult {
  type: "tool.result";
  id: string;
  timestamp: string;
  callId: string;
  result: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

// ── Tool Discovery ──────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  category?: string;
  parameters?: Record<string, unknown>;
}

export interface ToolsListRequest {
  type: "tools.list";
  id: string;
  timestamp: string;
  context?: {
    tenantId?: string;
    userId?: string;
  };
}

export interface ToolsListResponse {
  type: "tools.list.response";
  id: string;
  timestamp: string;
  requestId: string;
  tools: ToolDefinition[];
  categories?: string[];
}

// ── Keepalive ───────────────────────────────────────────────────────

export interface Ping {
  type: "ping";
  id: string;
  timestamp: string;
}

export interface Pong {
  type: "pong";
  id: string;
  timestamp: string;
}

// ── Tenant Notifications (OpenClaw → voiceNode) ─────────────────────

export interface TenantNotification {
  type: "tenant.notification";
  id: string;
  timestamp: string;
  context: {
    tenantId: string;
    userId?: string;
  };
  body: string;
  title?: string;
  messageType?: "notification" | "chat" | "alert" | "task_result";
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface TenantNotificationAck {
  type: "tenant.notification.ack";
  id: string;
  timestamp: string;
  notificationId: string;
  queued: boolean;
  delivered: boolean;
  messageId: string;
}

// ── Error ───────────────────────────────────────────────────────────

export type ErrorCode =
  | "AUTH_FAILED"
  | "AUTH_REQUIRED"
  | "TOOL_NOT_FOUND"
  | "TOOL_EXECUTION_ERROR"
  | "AGENT_ERROR"
  | "TIMEOUT"
  | "INVALID_MESSAGE"
  | "NOTIFICATION_FAILED";

export interface ErrorMessage {
  type: "error";
  id: string;
  timestamp: string;
  requestId?: string;
  code: ErrorCode;
  message: string;
}

// ── Union Type ──────────────────────────────────────────────────────

export type BridgeMessage =
  | AuthMessage
  | AuthResult
  | ChatRequest
  | ChatResponseDelta
  | ChatResponse
  | ToolCall
  | ToolResult
  | ToolsListRequest
  | ToolsListResponse
  | TenantNotification
  | TenantNotificationAck
  | Ping
  | Pong
  | ErrorMessage;
