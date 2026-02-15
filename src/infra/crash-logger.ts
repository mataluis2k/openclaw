import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { STATE_DIR } from "../config/paths.js";
import { formatUncaughtError } from "./errors.js";

/**
 * Writes a crash log to disk with process state snapshot.
 * Uses synchronous write to ensure completion before process exit.
 *
 * @param params.error - The error that caused the crash
 * @param params.errorType - Type of error (unhandledRejection or uncaughtException)
 * @param params.isFatal - Whether this error is considered fatal
 */
export async function writeCrashLog(params: {
  error: unknown;
  errorType: "unhandledRejection" | "uncaughtException";
  isFatal: boolean;
}): Promise<void> {
  try {
    const crashDir = path.join(STATE_DIR, "crash-logs");
    await fs.mkdir(crashDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `crash-${timestamp}.json`;
    const filepath = path.join(crashDir, filename);

    const crashDump = {
      timestamp: new Date().toISOString(),
      errorType: params.errorType,
      isFatal: params.isFatal,
      error: formatUncaughtError(params.error),
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        cwd: process.cwd(),
      },
    };

    // Synchronous write to ensure it completes before exit
    fsSync.writeFileSync(filepath, JSON.stringify(crashDump, null, 2));

    // Keep only last 10 crash logs (async cleanup, best effort)
    pruneOldCrashLogs(crashDir, 10).catch(() => {
      // Ignore cleanup errors
    });
  } catch (err) {
    // Fallback to console if crash logging fails
    console.error("[openclaw] Failed to write crash log:", err);
  }
}

/**
 * Removes old crash logs, keeping only the N most recent files.
 */
async function pruneOldCrashLogs(crashDir: string, keepCount: number): Promise<void> {
  try {
    const entries = await fs.readdir(crashDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.startsWith("crash-"))
      .map((entry) => entry.name)
      .sort()
      .reverse(); // Most recent first

    if (files.length <= keepCount) {
      return;
    }

    const toDelete = files.slice(keepCount);
    await Promise.all(
      toDelete.map((filename) => fs.unlink(path.join(crashDir, filename)).catch(() => {})),
    );
  } catch {
    // Ignore pruning errors
  }
}
