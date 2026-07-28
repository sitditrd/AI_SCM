import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' — Netlify·서브경로 어디에 올려도 자산 경로가 깨지지 않도록 상대경로
export default defineConfig({
  base: './',
  plugins: [react()],
})
