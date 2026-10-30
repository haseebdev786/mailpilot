import { VerifyEmailForm } from "@/components/verify-email-form";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 text-ink">
      <VerifyEmailForm token={params.token ?? ""} />
    </main>
  );
}
