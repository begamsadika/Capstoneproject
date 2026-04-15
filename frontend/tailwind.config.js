/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        wellora: {
          DEFAULT: '#14B886',
          hover: '#119e75',
          dark: '#0c8a6a',
          light: '#F4FDF9',
          soft: '#e6faf4',
          surface: '#ecfdf5',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'gradient': 'gradient 8s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
  plugins: [],
};
