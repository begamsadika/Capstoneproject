/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        wellora: {
          DEFAULT: "#14B886",
          hover: "#119e75",
          dark: "#0c8a6a",
          light: "#F4FDF9",
          soft: "#e6faf4",
          surface: "#ecfdf5",
        },
      },
    },
  },
  plugins: [],
};
