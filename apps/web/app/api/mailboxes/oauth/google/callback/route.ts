import { handleMailboxOAuthCallback } from "@/lib/mailbox-oauth";

export async function GET(request: Request) {
  return handleMailboxOAuthCallback("GOOGLE", request);
}
