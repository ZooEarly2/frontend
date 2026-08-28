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
    /*
     * 개발 서버가 게이트웨이 요청을 대신 넘겨준다.
     *
     * **왜 필요한가.** 배포된 게이트웨이는 CORS 허용 목록에 배포된 사이트 하나만
     * 두고 있다. 그래서 브라우저가 localhost:5173 에서 부르면 전부 403 이고,
     * 화면에는 "선생님이 잘 못 들었어" 같은 엉뚱한 문구가 뜬다 — 아이 잘못도,
     * 서버 잘못도 아닌데. curl 로는 Origin 헤더가 없어 통과하므로 이 문제가
     * 사람 손 검사에서 잘 안 잡힌다.
     *
     * 운영 설정에 localhost 를 더하는 대신 여기서 푼다. 브라우저 입장에서는
     * 같은 출처라 CORS 규칙이 아예 적용되지 않고, 운영은 손대지 않는다.
     *
     * Origin 헤더는 떼고 보낸다. 그대로 넘기면 게이트웨이가 다시 막는다.
     */
    proxy: {
      '/api': {
        target: 'https://zooearly-gw.jollyhill-992be81c.koreacentral.azurecontainerapps.io',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
    },
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
