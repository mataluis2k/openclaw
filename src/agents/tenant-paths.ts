import path from "node:path";
import { resolveStateDirForTenant } from "../config/paths.js";
import { assertSandboxPath } from "./sandbox-paths.js";

export type TenantPathContext = {
  tenantId: string | undefined;
  userRole?: "superAdmin" | "user";
};

/**
 * Tenant-aware path validation that builds on existing assertSandboxPath().
 *
 * Security model:
 * - No tenant context: Full access (backward compatible)
 * - superAdmin role: Full filesystem access
 * - default tenant: Full access (backward compatible)
 * - Regular user with tenant: Jailed to tenant-scoped directory
 *
 * @param params.filePath - Path to validate
 * @param params.cwd - Current working directory
 * @param params.root - Sandbox root directory
 * @param params.tenantContext - Optional tenant context for multi-tenant isolation
 * @returns Resolved and relative paths after validation
 * @throws Error if path escapes tenant boundary (for non-superAdmin users)
 */
export async function assertTenantPath(params: {
  filePath: string;
  cwd: string;
  root: string;
  tenantContext?: TenantPathContext;
}): Promise<{ resolved: string; relative: string }> {
  // Step 1: Run existing sandbox validation (handles symlinks, '..' escapes, etc.)
  const sandboxResult = await assertSandboxPath(params);

  // Step 2: If no tenant context or superAdmin role, allow full access
  if (!params.tenantContext || params.tenantContext.userRole === "superAdmin") {
    return sandboxResult;
  }

  // Step 3: If default tenant or undefined, allow (backward compatible)
  const tenantId = params.tenantContext.tenantId;
  if (!tenantId || tenantId === "default") {
    return sandboxResult;
  }

  // Step 4: Validate path is within tenant boundary
  const tenantRoot = resolveStateDirForTenant(tenantId);
  const tenantRelative = path.relative(tenantRoot, sandboxResult.resolved);

  if (tenantRelative.startsWith("..") || path.isAbsolute(tenantRelative)) {
    throw new Error(
      `Tenant isolation violation: Path escapes tenant boundary (tenant: ${tenantId})`,
    );
  }

  return sandboxResult;
}
