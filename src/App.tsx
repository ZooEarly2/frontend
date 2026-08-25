import { useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { setAppReady } from '@/audio/speaker';
import { useAppState } from '@/store/appState';
import { Splash } from '@/screens/Splash';
import { WorldIntro } from '@/screens/WorldIntro';
import { Onboarding } from '@/screens/Onboarding';
import { Home } from '@/screens/Home';
import { Menu, ProfileEdit, ReviewCategory, ReviewList } from '@/screens/Menu';
import { DialoguePlay } from '@/screens/DialoguePlay';
import { ClassPlay } from '@/screens/ClassPlay';
import { StoryScreen } from '@/screens/Story';

/** 화면 전환 — 옆으로 미끄러지듯 넘어간다. 그림책 페이지를 넘기는 느낌을 낸다. */
const pageMotion = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.26, ease: [0.4, 0, 0.2, 1] as const },
};

export function App() {
  const location = useLocation();
  const { profile } = useAppState();
  const [booting, setBooting] = useState(true);

  return (
    <div className="app-shell">
      <div className="app-shell__ambience" id="ambience" aria-hidden />
      {/*
        스플래시는 앱 위에 덮는다. 아래 화면을 조건부로 감추지 않는 이유는,
        스플래시가 걷히는 동안 첫 화면이 이미 그려져 있어야 흰 화면이 끼어들지 않기 때문이다.
      */}
      {booting ? (
        <Splash
          onDone={() => {
            setBooting(false);
            // 말풍선 낭독은 여기서부터. 스플래시 뒤에서 먼저 읽어버리면 아이는
            // 로딩 화면에서 목소리를 듣고, 화면이 열릴 땐 말이 끝나 있다.
            setAppReady();
          }}
        />
      ) : null}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={location.pathname} {...pageMotion} style={{ display: 'contents' }}>
          <Routes location={location}>
            {/*
              프로필이 없으면 세계관 소개부터 — 아이는 이 앱이 무엇을 하는 곳인지
              모른 채 들어온다. 바로 이름을 물으면 왜 묻는지 알 수 없다.
            */}
            <Route path="/" element={<Navigate to={profile ? '/home' : '/intro'} replace />} />
            <Route path="/intro" element={<WorldIntro />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/home" element={<Guarded><Home /></Guarded>} />
            <Route path="/play/CLASS" element={<Guarded><ClassPlay /></Guarded>} />
            <Route path="/play/:category" element={<Guarded><DialoguePlay /></Guarded>} />
            <Route path="/story" element={<Guarded><StoryScreen /></Guarded>} />
            <Route path="/menu" element={<Guarded><Menu /></Guarded>} />
            <Route path="/menu/profile" element={<Guarded><ProfileEdit /></Guarded>} />
            <Route path="/menu/review" element={<Guarded><ReviewList /></Guarded>} />
            <Route path="/menu/review/:category" element={<Guarded><ReviewCategory /></Guarded>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** 닉네임·모국어를 아직 안 받았으면 온보딩으로 돌려보낸다 — 요청마다 실어야 하는 값이다. */
function Guarded({ children }: { children: React.ReactNode }) {
  const { profile } = useAppState();
  if (!profile) return <Navigate to="/" replace />;
  return <>{children}</>;
}
