/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#f2c94c",
        "accent-strong": "#f2994a",
        ink: "#102323",
        "ink-muted": "#4c5b5b",
        panel: "rgba(255, 255, 255, 0.82)",
        surface: "#ffffff",
        "panel-border": "rgba(16, 35, 35, 0.12)",
      },
      boxShadow: {
        panel: "0 24px 60px rgba(16, 35, 35, 0.12)",
        primary: "0 14px 30px rgba(242, 201, 76, 0.35)",
        toast: "0 12px 30px rgba(16, 35, 35, 0.2)",
      },
      fontFamily: {
        sans: ["Pretendard", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        toastIn: {
          from: { opacity: "0", transform: "translate(-50%, -6px)" },
          to: { opacity: "1", transform: "translate(-50%, 0)" },
        },
        floatIn: {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeInUp: "fadeInUp 0.6s ease both",
        toastIn: "toastIn 0.2s ease-out",
        floatIn: "floatIn 0.8s ease-out",
      },
    },
  },
  plugins: [],
};
