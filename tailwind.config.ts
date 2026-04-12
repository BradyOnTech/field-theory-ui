import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        card: "#0a0a0a",
        border: "#1c1c1e",
        surface: "#1c1c1e",
        foreground: "#ffffff",
        body: "#d4d4d8",
        secondary: "#a1a1aa",
        muted: "#71717a",
        disabled: "#3f3f46",
        accent: "#22c55e",
        ring: "#3f3f46",
        success: "#22c55e",
        warning: "#eab308",
        error: "#ef4444",
      },
      fontFamily: {
        sans: [
          "'Plus Jakarta Sans'",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "'JetBrains Mono'",
          "'SF Mono'",
          "Monaco",
          "'Cascadia Code'",
          "monospace",
        ],
      },
      borderRadius: {
        card: "12px",
        button: "8px",
        badge: "6px",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
