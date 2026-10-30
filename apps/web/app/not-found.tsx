import Link from "next/link";

export default function NotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-canvas p-6"><div className="max-w-md rounded-2xl border border-line bg-panel p-8 text-center"><h1 className="text-2xl font-bold">Page not found</h1><p className="mt-3 text-sm text-muted">This page does not exist or has moved.</p><Link href="/dashboard" className="mt-6 inline-block rounded-xl bg-strong px-4 py-3 text-sm font-semibold text-white">Go to dashboard</Link></div></main>;
}
