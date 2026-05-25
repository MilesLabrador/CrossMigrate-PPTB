/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        card: '#161926',
        cardalt: '#1e2130',
      },
      boxShadow: {
        node: '0 4px 20px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};
