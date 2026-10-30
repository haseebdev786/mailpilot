import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth";

export default async function HomePage() {
  let auth = null;
  try {
    auth = await getCurrentAuth();
  } catch { auth = null; }
  redirect(auth ? "/dashboard" : "/login");
}
