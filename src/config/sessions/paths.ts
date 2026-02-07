import os from "node:os";
import path from "node:path";
import type { SessionEntry } from "./types.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../../routing/session-key.js";
import { resolveStateDir, resolveStateDirForTenant } from "../paths.js";

function resolveAgentSessionsDir(
  agentId?: string,
  tenantId?: string,
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const root = resolveStateDirForTenant(tenantId, env, homedir);
  const id = normalizeAgentId(agentId ?? DEFAULT_AGENT_ID);
  return path.join(root, "agents", id, "sessions");
}

export function resolveSessionTranscriptsDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  return resolveAgentSessionsDir(DEFAULT_AGENT_ID, undefined, env, homedir);
}

export function resolveSessionTranscriptsDirForAgent(
  agentId?: string,
  tenantId?: string,
  env?: NodeJS.ProcessEnv,
  homedir?: () => string,
): string {
  return resolveAgentSessionsDir(agentId, tenantId, env, homedir);
}

export function resolveDefaultSessionStorePath(agentId?: string, tenantId?: string): string {
  return path.join(resolveAgentSessionsDir(agentId, tenantId), "sessions.json");
}

export function resolveSessionTranscriptPath(
  sessionId: string,
  agentId?: string,
  topicId?: string | number,
  tenantId?: string,
): string {
  const safeTopicId =
    typeof topicId === "string"
      ? encodeURIComponent(topicId)
      : typeof topicId === "number"
        ? String(topicId)
        : undefined;
  const fileName =
    safeTopicId !== undefined ? `${sessionId}-topic-${safeTopicId}.jsonl` : `${sessionId}.jsonl`;
  return path.join(resolveAgentSessionsDir(agentId, tenantId), fileName);
}

export function resolveSessionFilePath(
  sessionId: string,
  entry?: SessionEntry,
  opts?: { agentId?: string; tenantId?: string },
): string {
  const candidate = entry?.sessionFile?.trim();
  return candidate
    ? candidate
    : resolveSessionTranscriptPath(sessionId, opts?.agentId, undefined, opts?.tenantId);
}

export function resolveStorePath(store?: string, opts?: { agentId?: string; tenantId?: string }) {
  const agentId = normalizeAgentId(opts?.agentId ?? DEFAULT_AGENT_ID);
  const tenantId = opts?.tenantId;
  if (!store) {
    return resolveDefaultSessionStorePath(agentId, tenantId);
  }
  if (store.includes("{agentId}")) {
    const expanded = store.replaceAll("{agentId}", agentId);
    if (expanded.startsWith("~")) {
      return path.resolve(expanded.replace(/^~(?=$|[\\/])/, os.homedir()));
    }
    return path.resolve(expanded);
  }
  if (store.startsWith("~")) {
    return path.resolve(store.replace(/^~(?=$|[\\/])/, os.homedir()));
  }
  return path.resolve(store);
}

/**
 * Resolve the memory index database path for a given agent and optional tenant.
 * Tenant-scoped: each tenant gets its own memory-index.db under the tenant state dir.
 */
export function resolveMemoryDbPath(agentId?: string, tenantId?: string): string {
  const root = resolveStateDirForTenant(tenantId);
  const id = normalizeAgentId(agentId ?? DEFAULT_AGENT_ID);
  return path.join(root, "memory", `${id}.sqlite`);
}
