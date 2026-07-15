import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// Single self-contained bundle for the offline interactive demo artifact.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      input: 'index.demo.html',
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
})
