import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-signal text-signal-foreground shadow-sm enabled:hover:brightness-95 enabled:active:brightness-90",
  secondary: "border border-line bg-panel text-ink enabled:hover:border-signal enabled:hover:bg-signal/10",
  ghost: "text-muted enabled:hover:bg-signal/10 enabled:hover:text-ink",
  danger: "bg-danger text-white enabled:hover:brightness-90"
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: "sm" | "md" | "lg";
};

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return <button className={cn("inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-not-allowed disabled:border-line disabled:bg-disabled disabled:text-disabled-foreground disabled:shadow-none", size === "sm" ? "h-9 px-3 text-xs" : size === "lg" ? "h-12 px-5 text-sm" : "h-10 px-4 text-sm", variants[variant], className)} {...props} />;
}
