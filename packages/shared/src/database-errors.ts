export function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as { code?: unknown; errorCode?: unknown };
  const code = value.code ?? value.errorCode;
  return typeof code === "string" ? code : undefined;
}

export function isDatabaseUnavailable(error: unknown): boolean {
  return ["P1001", "P1002", "P1008", "P1017", "P2024", "P2037"].includes(databaseErrorCode(error) ?? "");
}

// Only use for reads: an interrupted write may already have committed.
export async function retryDatabaseRead<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); } catch (error) {
    // Pool exhaustion needs load to drain; immediately replaying it makes it worse.
    if (!["P1001", "P1002", "P1017"].includes(databaseErrorCode(error) ?? "")) throw error;
    await new Promise((resolve) => setTimeout(resolve, 200));
    return read();
  }
}
