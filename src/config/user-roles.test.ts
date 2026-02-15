import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "./config.js";
import { resolveUserRole } from "./user-roles.js";

describe("resolveUserRole", () => {
  it("returns user when no roles configured", () => {
    const cfg: OpenClawConfig = {};
    const ctx = {
      SenderId: "user123",
      SenderE164: "+15551234567",
    } as any;

    const role = resolveUserRole({ cfg, ctx });
    expect(role).toBe("user");
  });

  it("returns superAdmin when SenderId matches", () => {
    const cfg: OpenClawConfig = {
      auth: {
        roles: [{ userId: "admin123", role: "superAdmin" }],
      },
    };
    const ctx = {
      SenderId: "admin123",
    } as any;

    const role = resolveUserRole({ cfg, ctx });
    expect(role).toBe("superAdmin");
  });

  it("returns superAdmin when SenderE164 matches", () => {
    const cfg: OpenClawConfig = {
      auth: {
        roles: [{ userId: "+15551234567", role: "superAdmin" }],
      },
    };
    const ctx = {
      SenderE164: "+15551234567",
    } as any;

    const role = resolveUserRole({ cfg, ctx });
    expect(role).toBe("superAdmin");
  });

  it("returns superAdmin when SenderUsername matches", () => {
    const cfg: OpenClawConfig = {
      auth: {
        roles: [{ userId: "admin", role: "superAdmin" }],
      },
    };
    const ctx = {
      SenderUsername: "admin",
    } as any;

    const role = resolveUserRole({ cfg, ctx });
    expect(role).toBe("superAdmin");
  });

  it("returns user when sender does not match any role", () => {
    const cfg: OpenClawConfig = {
      auth: {
        roles: [{ userId: "admin123", role: "superAdmin" }],
      },
    };
    const ctx = {
      SenderId: "user456",
    } as any;

    const role = resolveUserRole({ cfg, ctx });
    expect(role).toBe("user");
  });

  it("is case-insensitive when matching user IDs", () => {
    const cfg: OpenClawConfig = {
      auth: {
        roles: [{ userId: "Admin@Example.Com", role: "superAdmin" }],
      },
    };
    const ctx = {
      SenderId: "admin@example.com",
    } as any;

    const role = resolveUserRole({ cfg, ctx });
    expect(role).toBe("superAdmin");
  });

  it("checks all sender identifier fields", () => {
    const cfg: OpenClawConfig = {
      auth: {
        roles: [{ userId: "admin@example.com", role: "superAdmin" }],
      },
    };
    const ctx = {
      SenderId: "other",
      From: "admin@example.com",
    } as any;

    const role = resolveUserRole({ cfg, ctx });
    expect(role).toBe("superAdmin");
  });

  it("returns user for regular user role", () => {
    const cfg: OpenClawConfig = {
      auth: {
        roles: [{ userId: "user123", role: "user" }],
      },
    };
    const ctx = {
      SenderId: "user123",
    } as any;

    const role = resolveUserRole({ cfg, ctx });
    expect(role).toBe("user");
  });
});
