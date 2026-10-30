import { ResetPasswordForm } from "@/components/reset-password-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 text-ink">
      <ResetPasswordForm token={params.token ?? ""} />
    </main>
  );
}
