/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F8FAF9',
        border: '#E5E9E8',
        ink: {
          DEFAULT: '#1A2B29',
          2: '#5B6B69',
          3: '#93A3A1',
        },
        brand: {
          DEFAULT: '#0F766E',
          dark: '#0B5D57',
          soft: '#E6F3F2',
        },
        amber: {
          DEFAULT: '#D97706',
          soft: '#FEF3E2',
        },
        success: {
          DEFAULT: '#15803D',
          soft: '#E9F7EE',
        },
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(15,60,55,.06), 0 1px 2px rgba(15,60,55,.04)',
        soft: '0 8px 30px rgba(15,60,55,.08)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
