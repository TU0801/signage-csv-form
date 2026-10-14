import { defineConfig } from 'vitest/config';
import path from 'path';

// CSV の変更日（UTC）と変更日時（ローカル）を本番と同じ JST で検証するため、テストのタイムゾーンを固定する
process.env.TZ = 'Asia/Tokyo';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true,
    env: { TZ: 'Asia/Tokyo' },
  },
});
