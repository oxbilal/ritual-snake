import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ritual: {
          black: "#000000",
          elevated: "#111827",
          surface: "#1F2937",
          green: "#19D184",
          lime: "#BFFF00",
          pink: "#FF1DCE",
          gold: "#FACC15",
          red: "#EF4444"
        }
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "Fira Code", "monospace"]
      },
      boxShadow: {
        card: "0 4px 40px -12px rgba(0, 0, 0, 0.5)",
        "glow-green": "0 0 30px -5px rgba(25, 209, 132, 0.25)",
        "glow-pink": "0 0 30px -5px rgba(255, 29, 206, 0.2)"
      }
    }
  },
  plugins: []
};

export default config;
