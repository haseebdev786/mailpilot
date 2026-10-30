import { DashboardShell } from "@/components/dashboard-shell";
import { requireAuth } from "@/lib/auth";

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const auth = await requireAuth();
  return <DashboardShell user={auth.user} workspace={auth.workspace}>{children}</DashboardShell>;
}
