import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { AppStateProvider } from './store/appState';
import './styles/global.css';

/*
 * HashRouter 를 쓰는 이유 — 배포 환경 때문이다.
 * Azure Static Website 는 정적 파일만 서빙해서 /home 같은 경로로 새로고침하면
 * 404 가 난다(서버 리라이트 규칙을 걸 자리가 없다). 해시 라우팅은 그 문제를
 * 아예 만들지 않는다. 앱이 딥링크를 쓰지 않으므로 잃는 것도 없다.
 */
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <HashRouter>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </HashRouter>
  </StrictMode>,
);
