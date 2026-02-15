export type AuthProfileConfig = {
  provider: string;
  /**
   * Credential type expected in auth-profiles.json for this profile id.
   * - api_key: static provider API key
   * - oauth: refreshable OAuth credentials (access+refresh+expires)
   * - token: static bearer-style token (optionally expiring; no refresh)
   */
  mode: "api_key" | "oauth" | "token";
  email?: string;
};

export type UserRoleConfig = {
  /** User identifier (E.164 phone, email, username, senderId, etc.) */
  userId: string;
  /** User role: superAdmin (full access) or user (tenant-scoped) */
  role: "superAdmin" | "user";
};

export type AuthConfig = {
  profiles?: Record<string, AuthProfileConfig>;
  order?: Record<string, string[]>;
  cooldowns?: {
    /** Default billing backoff (hours). Default: 5. */
    billingBackoffHours?: number;
    /** Optional per-provider billing backoff (hours). */
    billingBackoffHoursByProvider?: Record<string, number>;
    /** Billing backoff cap (hours). Default: 24. */
    billingMaxHours?: number;
    /**
     * Failure window for backoff counters (hours). If no failures occur within
     * this window, counters reset. Default: 24.
     */
    failureWindowHours?: number;
  };
  /**
   * Role-based access control for multi-tenant security.
   * Maps user identifiers to roles (superAdmin or user).
   * SuperAdmins can access all files; regular users are confined to their tenant directories.
   */
  roles?: UserRoleConfig[];
};
