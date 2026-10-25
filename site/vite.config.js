import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Keep font files as real files. Vite inlines files under 4 KB as
    // data: URIs, and the site's security policy (font-src 'self') blocks
    // data: fonts, so two tiny Georgian font pieces failed to load and showed
    // up as errors in Google's page test.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/i.test(file) ? false : undefined),
  },
})
