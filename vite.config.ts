// Vite 构建配置：React + Tailwind v4 插件 + `@` 路径别名；同时承载 Vitest（纯逻辑层，node 环境）。
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    // T02 感知性能：vendor 按库拆分成独立 chunk。
    // 目的：① 避免 React 被重复打进多个 chunk；② 长尾 vendor 可独立缓存；
    //       ③ 首屏只需加载当前面板代码（配合 AppShell 的 React.lazy 分包）。
    // 用函数式 manualChunks：Vite 会把依赖预打包进 node_modules/.vite/deps/，
    // 对象式写法匹配不到，故按解析后的 id 路径归桶。
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-colorful')) return 'react-colorful';
          if (id.includes('zod')) return 'zod';
          if (id.includes('@radix-ui')) return 'radix-ui';
          // react / react-dom / scheduler 等 React 运行时统一进 react-vendor。
          if (id.includes('react-dom') || id.includes('react') || id.includes('scheduler')) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
