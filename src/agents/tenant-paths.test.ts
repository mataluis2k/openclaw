import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveStateDirForTenant } from "../config/paths.js";
import { assertTenantPath, type TenantPathContext } from "./tenant-paths.js";

describe("assertTenantPath", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-tenant-test-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("allows superAdmin to access any path", async () => {
    const ctx: TenantPathContext = { tenantId: "tenant1", userRole: "superAdmin" };
    const testFile = path.join(testDir, "test.txt");
    await fs.writeFile(testFile, "test");

    const result = await assertTenantPath({
      filePath: testFile,
      cwd: testDir,
      root: testDir,
      tenantContext: ctx,
    });

    expect(result.resolved).toBe(testFile);
  });

  it("jails regular user to tenant directory", async () => {
    const ctx: TenantPathContext = { tenantId: "tenant1", userRole: "user" };
    const tenantRoot = resolveStateDirForTenant("tenant1");
    const stateDir = resolveStateDirForTenant(undefined); // Parent state dir

    // Try to access file outside tenant boundary (but within state dir)
    // This will pass sandbox validation but fail tenant validation
    const outsidePath = path.join(stateDir, "other-tenant-file.txt");

    await expect(
      assertTenantPath({
        filePath: outsidePath,
        cwd: tenantRoot,
        root: stateDir, // Use state dir as root, not tenant dir
        tenantContext: ctx,
      }),
    ).rejects.toThrow("Tenant isolation violation");
  });

  it("allows access within tenant boundary", async () => {
    const ctx: TenantPathContext = { tenantId: "tenant1", userRole: "user" };
    const tenantRoot = resolveStateDirForTenant("tenant1");
    await fs.mkdir(tenantRoot, { recursive: true });
    const testFile = path.join(tenantRoot, "workspace", "file.txt");
    await fs.mkdir(path.dirname(testFile), { recursive: true });
    await fs.writeFile(testFile, "test");

    const result = await assertTenantPath({
      filePath: "workspace/file.txt",
      cwd: tenantRoot,
      root: tenantRoot,
      tenantContext: ctx,
    });

    expect(result.resolved).toBe(testFile);
  });

  it("allows full access for default tenant", async () => {
    const ctx: TenantPathContext = { tenantId: "default", userRole: "user" };
    const testFile = path.join(testDir, "test.txt");
    await fs.writeFile(testFile, "test");

    const result = await assertTenantPath({
      filePath: testFile,
      cwd: testDir,
      root: testDir,
      tenantContext: ctx,
    });

    expect(result.resolved).toBe(testFile);
  });

  it("allows full access when no tenant context provided", async () => {
    const testFile = path.join(testDir, "test.txt");
    await fs.writeFile(testFile, "test");

    const result = await assertTenantPath({
      filePath: testFile,
      cwd: testDir,
      root: testDir,
      // No tenantContext
    });

    expect(result.resolved).toBe(testFile);
  });

  it("allows full access when tenantId is undefined", async () => {
    const ctx: TenantPathContext = { tenantId: undefined, userRole: "user" };
    const testFile = path.join(testDir, "test.txt");
    await fs.writeFile(testFile, "test");

    const result = await assertTenantPath({
      filePath: testFile,
      cwd: testDir,
      root: testDir,
      tenantContext: ctx,
    });

    expect(result.resolved).toBe(testFile);
  });

  it("prevents path traversal attacks for regular users", async () => {
    const ctx: TenantPathContext = { tenantId: "tenant1", userRole: "user" };
    const tenantRoot = resolveStateDirForTenant("tenant1");

    // Path traversal is caught by assertSandboxPath before tenant check
    await expect(
      assertTenantPath({
        filePath: "../../sensitive.txt",
        cwd: tenantRoot,
        root: tenantRoot,
        tenantContext: ctx,
      }),
    ).rejects.toThrow(/escapes sandbox root|isolation/i);
  });

  it("prevents absolute path access outside tenant for regular users", async () => {
    const ctx: TenantPathContext = { tenantId: "tenant1", userRole: "user" };
    const tenantRoot = resolveStateDirForTenant("tenant1");

    // Absolute paths outside sandbox are caught by assertSandboxPath
    await expect(
      assertTenantPath({
        filePath: "/etc/passwd",
        cwd: tenantRoot,
        root: tenantRoot,
        tenantContext: ctx,
      }),
    ).rejects.toThrow(/escapes sandbox root|isolation/i);
  });
});
