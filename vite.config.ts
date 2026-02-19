import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'QuickFuelUp',
        short_name: 'QuickFuelUp',
        description: 'Capture fuel fill-ups and post to LubeLogger',
        start_url: '/',
        display: 'standalone',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        icons: [
          // Placeholder icon; replace with dedicated PNGs later.
          { src: '/vite.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
})
