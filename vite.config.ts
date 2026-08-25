import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // 마이크는 보안 컨텍스트(https 또는 localhost)에서만 열린다. 휴대폰으로 같은
    // 와이파이에서 접속해 확인할 때 IP 주소로 들어오면 녹음이 막히므로,
    // 그때는 https 프록시나 터널을 쓴다 — README 참고.
    host: true,
  },
  build: {
    outDir: 'dist',
    // Azure Static Website 는 정적 파일만 서빙한다. 해시가 붙은 자산과 index.html
    // 만 올리면 되고, 별도 서버 설정이 필요 없다.
    assetsDir: 'assets',
  },
});
