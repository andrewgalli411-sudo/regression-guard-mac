import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#080b0a",
        surface: "#111614",
        raised: "#161c19",
        line: "#212b26",
        brand: "#8bd44f",
        ink: { DEFAULT: "#f2f5f2", soft: "#a8b3ad", mute: "#6d7a73" },
        series: { rev: "#57a838", cost: "#d55181", home: "#3987e5", super: "#c98500" },
        state: { good: "#57a838", warn: "#c98500", bad: "#e66767", info: "#3987e5" },
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      fontSize: { "2xs": ["0.6875rem", { lineHeight: "1rem" }] },
    },
  },
  plugins: [],
} satisfies Config;
