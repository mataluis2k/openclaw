/**
 * Configuration loader for the voiceNode bridge extension.
 *
 * Merges OpenClaw plugin config with environment variable overrides.
 */

export interface BridgeConfig {
  enabled: boolean;
  port: number;
  token: string;
  toolCallTimeout: number;
  allowedTools: string[];
}

const DEFAULT_ALLOWED_TOOLS = [
  // Messaging
  "sms_*",
  "whatsapp_*",
  "email_*",
  "slack_*",
  // CRM & Sales
  "hubspot_*",
  "salesforce_*",
  "apollo_*",
  "lead_manager_*",
  // E-commerce
  "shopify_*",
  "amazon_*",
  // Finance & Trading
  "stripe_*",
  "quickbooks_*",
  "alpaca_*",
  // Content & Documents
  "copywriter_*",
  "document_*",
  "esignature_*",
  // Scheduling
  "calcom_*",
  "calendly_*",
  // Dashboard & Widgets
  "dashboard_*",
  "widget_*",
  // Social
  "reddit_*",
  // Allow all tools with wildcard (plug & play)
  "*",
];

/**
 * Load bridge configuration from plugin config + environment variables.
 * Environment variables take precedence.
 */
export function loadConfig(
  pluginConfig: Record<string, unknown> = {},
): BridgeConfig {
  const envEnabled = process.env.OPENCLAW_VOICENODE_BRIDGE_ENABLED;
  const envPort = process.env.OPENCLAW_VOICENODE_BRIDGE_PORT;
  const envToken = process.env.OPENCLAW_VOICENODE_BRIDGE_TOKEN;

  // Handle nested config structure from openclaw.json: { config: { ... } }
  const nestedConfig = (pluginConfig.config as Record<string, unknown>) ?? {};
  const effectiveConfig = { ...nestedConfig, ...pluginConfig };

  return {
    enabled:
      envEnabled !== undefined
        ? envEnabled === "true"
        : ((effectiveConfig.enabled as boolean) ?? false),

    port:
      envPort !== undefined
        ? parseInt(envPort, 10)
        : ((effectiveConfig.port as number) ?? 9100),

    token: envToken ?? (effectiveConfig.token as string) ?? "",

    toolCallTimeout: (effectiveConfig.toolCallTimeout as number) ?? 30000,

    allowedTools:
      (effectiveConfig.allowedTools as string[]) ?? DEFAULT_ALLOWED_TOOLS,
  };
}
