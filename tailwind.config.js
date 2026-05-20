/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        cj: {
          bg: "#f6f8fb",
          panel: "#ffffff",
          panel2: "#f1f5f9",
          border: "#dbe4ee",
          accent: "#2563eb",
          accent2: "#0f766e",
          ok: "#059669",
          warn: "#d97706",
          err: "#dc2626",
          dim: "#64748b",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 2px rgba(15,23,42,0.06), 0 8px 24px rgba(15,23,42,0.06)",
      },
    },
  },
  plugins: [],
};
