import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // TeraSky Brand Colors
        brand: {
          50: "#fef7f5",
          100: "#fdeee9",
          200: "#fbd9d0",
          300: "#f8baa8",
          400: "#f39a7f",
          500: "#ef7b59", // Primary TeraSky Orange
          600: "#e35a34",
          700: "#c44424",
          800: "#a33920",
          900: "#86331f",
          950: "#49180c",
        },
        // TeraSky Dark Grey
        terasky: {
          50: "#f6f6f7",
          100: "#e2e3e5",
          200: "#c4c6cb",
          300: "#9fa2a9",
          400: "#7a7e87",
          500: "#5f636c",
          600: "#4b4e56",
          700: "#3e4047",
          800: "#2d2d3f", // Primary TeraSky Dark
          900: "#282a32",
          950: "#18191e",
        },
        // Status colors
        status: {
          pass: "#22c55e",
          warning: "#f59e0b",
          fail: "#ef4444",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "pulse-subtle": "pulseSubtle 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSubtle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.8" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
