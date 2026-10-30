import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "hsl(var(--ink))",
        canvas: "hsl(var(--canvas))",
        panel: "hsl(var(--panel))",
        line: "hsl(var(--line))",
        muted: "hsl(var(--muted))",
        signal: "hsl(var(--signal))",
        "signal-foreground": "hsl(var(--signal-foreground))",
        strong: "hsl(var(--strong))",
        mint: "hsl(var(--mint))",
        danger: "hsl(var(--danger))",
        disabled: "hsl(var(--disabled))",
        "disabled-foreground": "hsl(var(--disabled-foreground))",
        coral: "hsl(var(--coral))",
        amber: "hsl(var(--amber))"
      },
      boxShadow: {
        glow: "0 0 0 1px hsl(var(--signal) / 0.16), 0 12px 36px hsl(220 40% 4% / 0.15)"
      },
      borderRadius: { xl: "1.1rem", "2xl": "1.45rem" }
    }
  },
  plugins: []
};

export default config;
