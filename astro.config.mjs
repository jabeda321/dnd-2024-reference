// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://jabeda321.github.io',
  base: '/dnd-2024-reference',
  trailingSlash: 'always',
  build: { format: 'directory' },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
});
