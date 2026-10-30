import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-muted", className)} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("h-11 w-full rounded-xl border border-line bg-canvas px-3.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-signal focus:ring-2 focus:ring-signal/15", className)} {...props} />;
}
