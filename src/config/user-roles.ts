import type { MsgContext } from "../auto-reply/templating.js";
import type { OpenClawConfig } from "./config.js";

/**
 * Resolves the user role based on config and message context.
 *
 * Checks all sender identifiers (SenderId, SenderE164, SenderUsername, etc.)
 * against configured roles. Defaults to "user" (tenant-scoped) if no match found.
 *
 * @param params.cfg - OpenClaw configuration
 * @param params.ctx - Message context with sender information
 * @returns "superAdmin" (full access) or "user" (tenant-scoped)
 */
export function resolveUserRole(params: {
  cfg: OpenClawConfig;
  ctx: MsgContext;
}): "superAdmin" | "user" {
  const roles = params.cfg.auth?.roles;
  if (!roles || !Array.isArray(roles)) {
    return "user"; // Default deny - unknown users are regular users
  }

  // Collect all sender identifiers from context
  const senderIds = [
    params.ctx.SenderId,
    params.ctx.SenderE164,
    params.ctx.SenderUsername,
    params.ctx.SenderName,
    params.ctx.From,
  ].filter(Boolean);

  // Check if any sender identifier matches a configured role
  for (const roleEntry of roles) {
    if (!roleEntry?.userId) {
      continue;
    }
    const configUserId = roleEntry.userId.toLowerCase();
    for (const senderId of senderIds) {
      if (senderId?.toLowerCase() === configUserId) {
        return roleEntry.role;
      }
    }
  }

  return "user"; // Unknown users default to regular user (tenant-jailed)
}
