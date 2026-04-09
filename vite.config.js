// Diagnostic logs for vite.config.js
console.log('vite.config.js loaded at:', new Date().toISOString());
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script', // Automatically injects the service worker script
      devOptions: {
        enabled: true, // Enables PWA in development mode
        type: 'module',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        name: 'Seal Freight',
        short_name: 'Seal',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          {
            src: '/seal.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/seal.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  base: '/', // ensures routes resolve correctly on Vercel
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate PDF generation library
          pdf: ['@react-pdf/renderer'],
          // Separate other large libraries
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // Supabase and other utilities
          supabase: ['@supabase/supabase-js'],
          // Date utilities
          utils: ['date-fns'],
          // Other chunks for remaining dependencies
        }
      }
    }
  }
})  