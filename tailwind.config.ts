import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        well: "hsl(var(--well))",
        accent: {
          DEFAULT: "hsl(var(--accent))",
          soft: "hsl(var(--accent-soft))",
          muted: "hsl(var(--accent-muted))",
          faint: "hsl(var(--accent-faint))",
          foreground: "hsl(var(--accent-foreground))",
          tint: "hsl(var(--accent-tint))",
          "tint-foreground": "hsl(var(--accent-tint-foreground))",
        },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        // The secondary ink weight. Named apart from muted-foreground because
        // they are different roles: this is body copy, that is metadata.
        "foreground-soft": "hsl(var(--foreground-soft))",
        // Calendar categories. The hue carries the label, so these never merge
        // into the neutrals however close they sit.
        cat: {
          event: "hsl(var(--cat-event))",
          "event-foreground": "hsl(var(--cat-event-foreground))",
          holiday: "hsl(var(--cat-holiday))",
          "holiday-foreground": "hsl(var(--cat-holiday-foreground))",
          leave: "hsl(var(--cat-leave))",
          "leave-foreground": "hsl(var(--cat-leave-foreground))",
          lifecycle: "hsl(var(--cat-lifecycle))",
          "lifecycle-foreground": "hsl(var(--cat-lifecycle-foreground))",
        }
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      boxShadow: { soft: "0 16px 48px rgba(31, 36, 32, .08)" },
      // Radix Collapsible measures the panel and exposes its height as a
      // variable; without these the group snaps open instead of sliding.
      keyframes: {
        "collapsible-down": {
          from: { height: "0" },
          to: { height: "var(--radix-collapsible-content-height)" },
        },
        "collapsible-up": {
          from: { height: "var(--radix-collapsible-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "collapsible-down": "collapsible-down .18s ease-out",
        "collapsible-up": "collapsible-up .18s ease-out",
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};
export default config;
