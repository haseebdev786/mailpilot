import { NextResponse } from "next/server";
import { isDatabaseUnavailable } from "@mailpilot/shared/database-errors";

export function withDatabaseErrors<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try { return await handler(...args); } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      return NextResponse.json({ error: "The database connection is temporarily unavailable. Please wait a moment and try again.", code: "DATABASE_UNAVAILABLE" }, { status: 503, headers: { "Retry-After": "3" } });
    }
  };
}
