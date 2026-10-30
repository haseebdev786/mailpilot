import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MailPilot — AI outreach, under your control",
  description: "A focused AI email outreach and auto-reply workspace."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `try{var theme=localStorage.getItem("mailpilot-theme");document.documentElement.classList.toggle("dark",theme==="dark"||(!theme&&matchMedia("(prefers-color-scheme: dark)").matches));}catch{}` }} /></head><body>{children}</body></html>;
}
