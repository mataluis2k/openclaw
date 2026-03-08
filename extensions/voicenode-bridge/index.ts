/**
 * OpenClaw extension entry point for the voiceNode bridge.
 *
 * Registers:
 * - A service that starts/stops the WebSocket bridge server
 * - A gateway method "voicenode.status" for health checks
 * - An HTTP route /voicenode/status for REST access
 * - A gateway dispatcher so chat.request messages reach the OpenClaw agent
 * - A voicenode_tool proxy so the agent can invoke voiceNode's tools
 */

import crypto from "node:crypto";
import { Type } from "@sinclair/typebox";

import type { OpenClawPluginApi, OpenClawPluginToolContext } from "../../src/plugins/types.js";
import type { OpenClawConfig } from "../../src/config/config.js";
import type { MsgContext } from "../../src/auto-reply/templating.js";
import { dispatchInboundMessageWithDispatcher } from "../../src/auto-reply/dispatch.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../../src/utils/message-channel.js";

import { extractTenantId, parseTenantSessionKey } from "../../src/routing/session-key.js";
import { BridgeServer } from "./src/bridge-server.js";
import { loadConfig } from "./src/config.js";

let bridge: BridgeServer | null = null;
let registered = false;

/**
 * Build a GatewayDispatcher that routes chat messages into OpenClaw's
 * agent pipeline via dispatchInboundMessageWithDispatcher.
 */
function createGatewayDispatcher(
  cfg: OpenClawConfig,
  logger: { info: Function; warn: Function; error: Function },
) {
  return {
    sendChat: async (
      sessionKey: string,
      message: string,
    ): Promise<{ content: string; metadata?: Record<string, unknown> }> => {
      const runId = crypto.randomUUID();

      // Extract tenant ID from session key for multi-tenant data isolation
      const tenantId = extractTenantId(sessionKey);

      const ctx: MsgContext = {
        Body: message,
        BodyForAgent: message,
        BodyForCommands: message,
        RawBody: message,
        CommandBody: message,
        SessionKey: sessionKey,
        TenantId: tenantId,
        Provider: INTERNAL_MESSAGE_CHANNEL,
        Surface: INTERNAL_MESSAGE_CHANNEL,
        OriginatingChannel: INTERNAL_MESSAGE_CHANNEL,
        ChatType: "direct",
        CommandAuthorized: true,
        MessageSid: runId,
      };

      const finalParts: string[] = [];

      await dispatchInboundMessageWithDispatcher({
        ctx,
        cfg,
        dispatcherOptions: {
          deliver: async (payload, info) => {
            if (info.kind !== "final") return;
            const text = payload.text?.trim() ?? "";
            if (text) finalParts.push(text);
          },
          onError: (err) => {
            logger.error(`[voicenode-bridge] dispatch error: ${err}`);
          },
        },
      });

      return { content: finalParts.join("\n\n").trim() };
    },
  };
}

const voicenodePlugin = {
  id: "voicenode-bridge",
  name: "voiceNode Bridge",
  description:
    "Bilateral WebSocket bridge for voiceNode tool execution and chat",

  register(api: OpenClawPluginApi) {
    // Guard against re-registration (can happen during hot reload)
    if (registered) {
      api.logger.info("[voicenode-bridge] already registered, skipping re-registration");
      // return;
    }

    const config = loadConfig(api.pluginConfig ?? {});

    // Initialize the bridge server lazily — only when enabled + token set.
    // Tool/service/route registration is always done so the tool shows up
    // in listings regardless of runtime config.
    const ensureBridge = (): BridgeServer | null => {
      if (bridge) return bridge;
      if (!config.enabled || !config.token) return null;
      const gateway = createGatewayDispatcher(
        api.config as OpenClawConfig,
        api.logger,
      );
      bridge = new BridgeServer({ config, logger: api.logger, gateway });
      return bridge;
    };

    // Register as a lifecycle service (started/stopped with the gateway)
    api.registerService({
      id: "voicenode-bridge",
      start: async () => {
        const srv = ensureBridge();
        if (srv) {
          await srv.start();
        } else {
          api.logger.info(
            "[voicenode-bridge] service start skipped (disabled or no token)",
          );
        }
      },
      stop: async () => {
        if (bridge) {
          await bridge.stop();
        }
      },
    });

    // Register a gateway RPC method for status checks
    api.registerGatewayMethod(
      "voicenode.status",
      async ({ respond }) => {
        respond(true, {
          connected: bridge?.isClientConnected() ?? false,
          port: config.port,
          enabled: config.enabled,
        });
      },
    );

    // Register an HTTP route for REST status checks
    api.registerHttpRoute({
      path: "/voicenode/status",
      handler: async (_req, res) => {
        res.json({
          connected: bridge?.isClientConnected() ?? false,
          port: config.port,
          enabled: config.enabled,
        });
      },
    });

    // ── Register voicenode_tool proxy ────────────────────────────────
    // Allows the OpenClaw agent to invoke any of voiceNode's 700+ tools.
    // Uses a factory function to receive session context for proper tenant/user routing.
    api.registerTool((toolCtx: OpenClawPluginToolContext) => {
      // Extract tenant/user from session key if available
      // Session key formats:
      //   New: "tenant:{tenantId}:agent:{agentId}:bridge:{userId}"
      //   Legacy: "bridge:{tenantId}:{userId}"
      let sessionTenantId = "default";
      let sessionUserId = "system";

      if (toolCtx.sessionKey) {
        sessionTenantId = extractTenantId(toolCtx.sessionKey);
        const parsed = parseTenantSessionKey(toolCtx.sessionKey);
        if (parsed) {
          // New format: extract userId from rest (bridge:{userId})
          const restParts = parsed.rest.split(":");
          if (restParts[0] === "bridge" && restParts.length >= 2) {
            sessionUserId = restParts[1] || "system";
          }
        } else {
          const parts = toolCtx.sessionKey.split(":");
          if (parts.length >= 3 && parts[0] === "bridge") {
            sessionUserId = parts[2] || "system";
          } else if (toolCtx.agentAccountId) {
            sessionUserId = toolCtx.agentAccountId;
          }
        }
      }

      api.logger.info(
        `[voicenode-bridge] Tool context: sessionKey=${toolCtx.sessionKey}, tenantId=${sessionTenantId}, userId=${sessionUserId}`,
      );

      return {
        name: "voicenode_tool",
        label: "voiceNode Tool Proxy",
        description: `Execute tools on the connected voiceNode platform.

**IMPORTANT FOR DASHBOARD/WIDGET QUERIES:**
When user asks about their to-do lists, widgets, dashboards, or workspace data:
1. FIRST call: tool_name="dashboard_get_workspace_context" (no arguments needed)
   This returns all the user's widgets with human-friendly names like "Dinesh", "MyList", etc.
2. THEN call: tool_name="dashboard_get_widget_data" with widget_name="<name from step 1>"

Example: User says "show my Dinesh list"
1. Call dashboard_get_workspace_context to find available widgets
2. Call dashboard_get_widget_data with widget_name="Dinesh"

**OTHER TOOLS:**
- Trading: alpaca_get_account, alpaca_get_positions, alpaca_place_order
- CRM: hubspot_*, salesforce_*, apollo_*
- E-commerce: shopify_*, amazon_*, stripe_*
- Communication: sms_send, whatsapp_send, email_send, slack_send_message
- Documents: copywriter_*, document_generate_pdf

Use list_tools=true to see all 700+ available tools.`,
        parameters: Type.Object({
          tool_name: Type.Optional(
            Type.String({
              description:
                "The voiceNode tool name (e.g. hubspot_create_contact, sms_send, alpaca_get_account). Required unless list_tools=true.",
            }),
          ),
          arguments: Type.Optional(
            Type.String({
              description:
                'Tool arguments as a JSON-encoded object, e.g. {"to":"+1555…","body":"Hello"}. Required unless list_tools=true.',
            }),
          ),
          list_tools: Type.Optional(
            Type.Boolean({
              description:
                "Set to true to list all available tools from voiceNode instead of executing a tool.",
            }),
          ),
          category_filter: Type.Optional(
            Type.String({
              description:
                "When list_tools=true, filter tools by category prefix (e.g. 'alpaca', 'hubspot', 'stripe').",
            }),
          ),
          tenant_id: Type.Optional(
            Type.String({ description: "Tenant ID (overrides session tenant)" }),
          ),
          user_id: Type.Optional(
            Type.String({ description: "User ID (overrides session user)" }),
          ),
        }),
        async execute(_toolCallId, params) {
          const json = (payload: unknown) => ({
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(payload, null, 2),
              },
            ],
            details: payload,
          });

          if (!config.enabled) {
            return json({
              error:
                "voiceNode bridge is disabled. Enable it in plugin config or set OPENCLAW_VOICENODE_BRIDGE_ENABLED=true",
            });
          }

          if (!config.token) {
            return json({
              error:
                "voiceNode bridge has no auth token configured. Set it in plugin config or OPENCLAW_VOICENODE_BRIDGE_TOKEN",
            });
          }

          if (!bridge?.isClientConnected()) {
            api.logger.warn("[voicenode-bridge] tool call rejected: voiceNode not connected");
            return json({ error: "voiceNode client not connected" });
          }

          // Use session-derived tenant/user, allow param overrides
          const effectiveTenantId = params.tenant_id || sessionTenantId;
          const effectiveUserId = params.user_id || sessionUserId;

          // Handle list_tools request
          if (params.list_tools) {
            const allTools = bridge.getAvailableTools();

            // Apply category filter if provided
            let tools = allTools;
            if (params.category_filter) {
              const prefix = params.category_filter.toLowerCase();
              tools = allTools.filter((t) =>
                t.name.toLowerCase().startsWith(prefix) ||
                t.category?.toLowerCase() === prefix
              );
            }

            // Group by category for easier reading
            const categories = bridge.getToolsByCategory();
            const categoryList: Record<string, string[]> = {};
            for (const [cat, toolNames] of categories) {
              if (!params.category_filter || cat.toLowerCase().startsWith(params.category_filter.toLowerCase())) {
                categoryList[cat] = toolNames;
              }
            }

            return json({
              success: true,
              total_tools: allTools.length,
              filtered_count: tools.length,
              filter: params.category_filter || null,
              categories: categoryList,
              tools: tools.map((t) => ({
                name: t.name,
                description: t.description,
                category: t.category,
              })),
            });
          }

          // Validate required params for tool execution
          if (!params.tool_name) {
            return json({
              error: "tool_name is required. Set list_tools=true to see available tools.",
            });
          }

          // Parse the JSON arguments string
          let parsedArgs: Record<string, unknown> = {};
          if (params.arguments) {
            try {
              parsedArgs =
                typeof params.arguments === "object"
                  ? (params.arguments as Record<string, unknown>)
                  : JSON.parse(params.arguments);
            } catch {
              return json({ error: "Invalid JSON in arguments parameter" });
            }
          }

          api.logger.info(
            `[voicenode-bridge] Calling voiceNode tool: "${params.tool_name}" (tenant=${effectiveTenantId}, user=${effectiveUserId})`,
          );

          try {
            const result = await bridge.callVoiceNodeTool(
              params.tool_name,
              parsedArgs,
              {
                tenantId: effectiveTenantId,
                userId: effectiveUserId,
              },
            );
            return json({ success: true, data: result });
          } catch (err) {
            return json({
              error: err instanceof Error ? err.message : String(err),
            });
          }
        },
      };
    });

    // ── Hook: forward background/cron agent results to voiceNode ────
    // Only fires for background tasks (cron, hooks, etc.) — NOT for
    // interactive chat which already delivers via chat.response.
    api.on("agent_end", async (event, ctx) => {
      if (!bridge?.isClientConnected()) return;
      if (!ctx.sessionKey) return;

      // Skip interactive chat — responses are already delivered via chat.response.
      // Interactive sessions have a messageProvider (e.g. "webchat", "whatsapp").
      // Cron/background jobs have no messageProvider.
      if (ctx.messageProvider) {
        api.logger.info(
          `[voicenode-bridge] Skipping agent_end notification for interactive session (provider=${ctx.messageProvider}, key=${ctx.sessionKey})`,
        );
        return;
      }

      // Extract the last assistant message as the result text
      const messages = event.messages as Array<{ role?: string; content?: unknown }>;
      let resultText = "";
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === "assistant" && typeof msg.content === "string" && msg.content.trim()) {
          resultText = msg.content.trim();
          break;
        }
        // Handle structured content (array of content blocks)
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
          const textParts = (msg.content as Array<{ type?: string; text?: string }>)
            .filter((b) => b.type === "text" && b.text)
            .map((b) => b.text!.trim())
            .filter(Boolean);
          if (textParts.length) {
            resultText = textParts.join("\n\n");
            break;
          }
        }
      }

      if (!resultText) return;

      // Extract tenant/user from session key.
      // Bridge sessions: tenant:{tenantId}:agent:{agentId}:bridge:{userId}
      // Cron sessions: agent:{agentId}:cron:{jobId} (no tenant prefix)
      let tenantId = extractTenantId(ctx.sessionKey);
      let userId: string | undefined;

      const parsed = parseTenantSessionKey(ctx.sessionKey);
      if (parsed) {
        // Tenant-prefixed key — extract userId from bridge segment
        const restParts = parsed.rest.split(":");
        const bridgeIdx = restParts.indexOf("bridge");
        if (bridgeIdx >= 0 && restParts.length > bridgeIdx + 1) {
          userId = restParts[bridgeIdx + 1];
        }
      }

      // For cron jobs (session key like agent:main:cron:{jobId}),
      // tenantId defaults to "default". Use the config's default tenant if available.
      if (tenantId === "default" && ctx.sessionKey.includes(":cron:")) {
        // Try to get tenantId from the config's tenant list
        const tenants = (api.config as OpenClawConfig).tenants;
        if (tenants && typeof tenants === "object") {
          const tenantKeys = Object.keys(tenants);
          if (tenantKeys.length === 1) {
            tenantId = tenantKeys[0];
          }
        }
      }

      api.logger.info(
        `[voicenode-bridge] Background task completed, forwarding notification (tenant=${tenantId}, user=${userId || "broadcast"}, key=${ctx.sessionKey})`,
      );

      try {
        const ack = await bridge.sendNotification({
          tenantId,
          userId,
          body: resultText,
          title: "Background Task Result",
          messageType: "task_result",
          metadata: {
            sessionKey: ctx.sessionKey,
            agentId: ctx.agentId,
            success: event.success,
            durationMs: event.durationMs,
          },
        });
        api.logger.info(
          `[voicenode-bridge] Forwarded background result to voiceNode (tenant=${tenantId}, user=${userId || "broadcast"}, delivered=${ack.delivered}, queued=${ack.queued})`,
        );
      } catch (err) {
        api.logger.error(
          `[voicenode-bridge] Failed to forward background result: ${err instanceof Error ? err.message : err}`,
        );
      }
    });

    registered = true;
    api.logger.info(
      `[voicenode-bridge] registered (enabled=${config.enabled}, port=${config.port}, tool=voicenode_tool)`,
    );
  },
};

export default voicenodePlugin;

/**
 * Get the bridge server instance (for use by other extensions).
 */
export function getBridgeServer(): BridgeServer | null {
  return bridge;
}
