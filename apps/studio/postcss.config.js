// The studio's own PostCSS config. Vite looks for one from this directory
// upward and stops at the first it finds, so this file is what keeps the root
// postcss.config.js (Tailwind v3 + autoprefixer, scanning the site's src/ and
// scripts/) out of the studio build.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
