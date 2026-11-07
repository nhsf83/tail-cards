import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages에서는 BASE_PATH=/<repo>/ 로 빌드 (워크플로에서 설정)
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Tail Cards — 꼬리질문 면접 카드',
        short_name: 'Tail Cards',
        description: '꼬리질문 카드형 면접 스크립트 학습 앱',
        lang: 'ko',
        theme_color: '#1f6f5c',
        background_color: '#f7f5f0',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
