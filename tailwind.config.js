/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        cj: {
          bg: "#0f1115",
          panel: "#161922",
          panel2: "#1c2030",
          border: "#262b3b",
          accent: "#7c9cff",
          accent2: "#a78bfa",
          ok: "#34d399",
          warn: "#fbbf24",
          err: "#f87171",
          dim: "#8a93a6",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 12px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
};
