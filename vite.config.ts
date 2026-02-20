import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')) as {
  version?: string
}

function getGitSha() {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromVercel) return fromVercel.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version ?? '0.0.0'),
    __GIT_SHA__: JSON.stringify(getGitSha()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Ensure new deployments activate immediately (so version/SHA updates show up).
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'QuickFuelUp',
        short_name: 'QuickFuelUp',
        description: 'Capture fuel fill-ups and post to LubeLogger',
        start_url: '/',
        display: 'standalone',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        icons: [
          { src: '/icons/android/android-launchericon-192-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/android/android-launchericon-512-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
