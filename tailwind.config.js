/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // O HomePage aplica a animação `float` via `style` inline (com durações/delays
  // escalonados por ícone), então a classe `animate-float` nunca aparece no
  // conteúdo escaneado — sem isto o JIT não emitiria `@keyframes float` e a
  // animação (referenciada pelo inline style) não resolveria.
  safelist: ['animate-float'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#faf5ff',
          100: '#f5ebff',
          200: '#e4d0fb',
          300: '#d4b8ff',
          400: '#bb87f0',
          500: '#9B5DE5',
          600: '#8447d6',
          700: '#7A3DC0',
          800: '#5e2da0',
          900: '#46217a',
        },
        accent: {
          sky: '#00bbf9',
          pink: '#F15BB5',
          yellow: '#FEE440',
        },
      },
      fontFamily: {
        display: ['Raleway', 'system-ui', 'sans-serif'],
        heading: ['Poppins', 'system-ui', 'sans-serif'],
        sans: ['Roboto', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        brand:
          '0 1px 2px 0 rgba(122, 61, 192, 0.08), 0 8px 24px -8px rgba(122, 61, 192, 0.25), 0 16px 32px -16px rgba(122, 61, 192, 0.20)',
        'brand-soft': '0 1px 2px 0 rgba(15, 23, 42, 0.05), 0 4px 12px -2px rgba(15, 23, 42, 0.08)',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'marquee-reverse': {
          '0%': { transform: 'translateX(-50%)' },
          '100%': { transform: 'translateX(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        marquee: 'marquee 28s linear infinite',
        'marquee-reverse': 'marquee-reverse 32s linear infinite',
        float: 'float 5s ease-in-out infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
