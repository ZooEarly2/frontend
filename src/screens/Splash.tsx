import { useEffect, useRef, useState } from 'react';
import './screens.css';

/**
 * 첫 로딩 화면.
 *
 * 그냥 기다리게 하는 화면이 아니다. 여기 머무는 동안 **첫 화면이 쓸 그림을 미리
 * 받아둔다** — 캐릭터 스프라이트와 등교 배경이다. 이걸 안 하면 온보딩에 들어간 뒤
 * 토끼가 한 박자 늦게 튀어나오고, 시나리오 첫 화면에서 배경이 뒤늦게 깔린다.
 *
 * 최소 표시 시간을 두는 이유: 그림이 캐시에 이미 있으면 스플래시가 한 프레임만
 * 번쩍이고 사라져 오히려 화면이 깨진 것처럼 보인다.
 */

const MIN_VISIBLE_MS = 1500;

/**
 * 눌러서 건너뛸 수 있게 되기까지.
 *
 * 브라우저는 화면을 한 번 건드리기 전에는 소리를 못 내게 막는다. 여기서 아이가
 * 한 번 누르면 바로 다음 화면(부엉이의 첫 마디)부터 소리가 난다 — 기다림을
 * 줄이는 김에 그 빗장도 함께 푼다.
 */
const TAPPABLE_AFTER_MS = 500;

/** 스플래시에 머무는 동안 미리 받아둘 그림 */
const PRELOAD = [
  '/characters/teacher-hello.png',
  '/characters/me-hello.png',
  '/characters/me-cheer.png',
  '/scenes/arrival/bg_arrival_street.png',
];

function preload(src: string) {
  return new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve(); // 실패해도 화면을 막지 않는다
    image.src = src;
  });
}

export function Splash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [tappable, setTappable] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  const leave = useRef(() => {});

  useEffect(() => {
    let alive = true;
    // 누르기와 타이머가 겹쳐 두 번 나가지 않도록. state 는 이 클로저에서 낡는다.
    let left = false;
    const started = Date.now();

    leave.current = () => {
      if (!alive || left) return;
      left = true;
      setLeaving(true);
      setTimeout(() => alive && done.current(), 450);
    };
    const tapTimer = setTimeout(() => alive && setTappable(true), TAPPABLE_AFTER_MS);

    const ready = Promise.all([
      ...PRELOAD.map(preload),
      // 글꼴이 늦게 오면 첫 화면 글자가 한 번 갈아끼워지며 튄다.
      // 여기서 기다리면 그 튐이 스플래시 뒤에서 끝난다.
      document.fonts?.ready ?? Promise.resolve(),
    ]);

    void ready.then(() => {
      const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - started));
      // 사라지는 동안(0.45s) 다음 화면이 아래에서 그려진다
      setTimeout(() => leave.current(), wait);
    });

    return () => {
      alive = false;
      clearTimeout(tapTimer);
    };
  }, []);

  return (
    <div className={`splash ${leaving ? 'splash--leaving' : ''}`} role="status" aria-label="쥬얼리를 여는 중">
      <div className="splash__art" />
      {tappable ? (
        <button
          type="button"
          className="splash__skip"
          onClick={() => leave.current()}
          aria-label="바로 시작하기"
        />
      ) : null}
      <div className="splash__loader" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
