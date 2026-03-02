/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pm: {
          bg: "#0a0e1a",
          surface: "#111827",
          border: "#1f2937",
          accent: "#3b82f6",
          text: "#f9fafb",
          muted: "#6b7280",
          republican: "#ef4444",
          democrat: "#3b82f6",
          independent: "#8b5cf6",
          green: "#10b981",
          libertarian: "#f59e0b",
        },
      },
    },
  },
  plugins: [],
};

