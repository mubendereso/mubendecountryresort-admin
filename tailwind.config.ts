import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          light: "#f8f4ec",
          dark: "#1e1b16"
        },
        stoneWarm: {
          100: "#efe8d8",
          200: "#e2d6be",
          300: "#d2c1a0",
          400: "#b79f79",
          500: "#998360"
        },
        oliveMuted: {
          400: "#798066",
          500: "#646b54",
          600: "#525845"
        },
        bronze: {
          400: "#b58b5d",
          500: "#9d7548"
        }
      },
      boxShadow: {
        soft: "0 12px 30px rgba(55, 43, 30, 0.12)",
        panel: "0 20px 50px rgba(55, 43, 30, 0.18)"
      },
      borderRadius: {
        "4xl": "2rem"
      }
    }
  },
  plugins: []
};

export default config;
