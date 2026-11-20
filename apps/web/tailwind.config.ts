import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          50: "#eef6f6",
          100: "#d5eaea",
          200: "#acd4d4",
          400: "#4f9a9b",
          500: "#2b7c7e",
          600: "#1f6466",
          700: "#184f51",
          800: "#123d3f",
          900: "#0c2a2b",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        fadeIn: { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        slideIn: {
          from: { opacity: "0", transform: "translateY(-12px)", maxHeight: "0" },
          to: { opacity: "1", transform: "none", maxHeight: "80px" },
        },
        toastIn: { from: { opacity: "0", transform: "translateX(24px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        "fade-in": "fadeIn 280ms ease-out both",
        "slide-in": "slideIn 450ms ease-out both",
        "toast-in": "toastIn 320ms ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
