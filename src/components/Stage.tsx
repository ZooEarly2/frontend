import { useEffect, type ReactNode } from 'react';

/** 그림 없이 그러데이션만 쓰는 화면의 분위기. */
export type Mood = 'sky' | 'meadow' | 'paper';

/**
 * 바탕에 떠다니는 장식.
 *
 * 이모지가 아니라 그림이다 — 🌸·☁️ 는 기기마다 색과 모양이 달라, 파스텔 바탕 위에서
 * 혼자 진한 채도로 튄다. 같은 팔레트로 직접 그리면 어디서든 배경에 녹는다.
 */
type Floaty = { top: string; left: string; delay: string; scale: number; shape: 'petal' | 'cloud' | 'spark' };

const FLOATIES: Record<Mood, Floaty[]> = {
  sky: [
    { top: '11%', left: '7%', delay: '0s', scale: 1, shape: 'petal' },
    { top: '5%', left: '60%', delay: '1.2s', scale: 1.3, shape: 'cloud' },
    { top: '29%', left: '85%', delay: '2.1s', scale: 0.9, shape: 'spark' },
    { top: '57%', left: '4%', delay: '0.6s', scale: 0.8, shape: 'petal' },
  ],
  meadow: [
    { top: '13%', left: '74%', delay: '0.4s', scale: 1, shape: 'spark' },
    { top: '7%', left: '12%', delay: '1.6s', scale: 1.2, shape: 'cloud' },
    { top: '61%', left: '86%', delay: '2.4s', scale: 0.9, shape: 'petal' },
  ],
  // 동화는 그림과 글이 화면을 꽉 채운다. 장식을 더하면 읽기만 방해한다.
  paper: [],
};

const SHAPES: Record<Floaty['shape'], React.ReactNode> = {
  petal: <path d="M14 3c5 4 8 8 8 12a8 8 0 0 1-16 0c0-4 3-8 8-12Z" fill="#F7C6CC" />,
  cloud: (
    <path
      d="M7 20a5 5 0 0 1 .6-9.9A7 7 0 0 1 21 11.4 4.3 4.3 0 0 1 20.4 20Z"
      fill="#FFFFFF"
    />
  ),
  spark: <path d="M14 2.5l2.6 6.9 6.9 2.6-6.9 2.6L14 21.5l-2.6-6.9L4.5 12l6.9-2.6Z" fill="#FFE0A3" />,
};

/**
 * 화면 하나를 담는 무대.
 *
 * 데스크톱에서는 세로 스테이지만 덩그러니 두지 않고, 지금 장면의 배경을 크게
 * 확대·블러 처리해 뒤에 깐다 — 그림책을 펼쳐 놓은 것 같은 깊이가 생긴다.
 * 모바일에서는 스테이지가 화면을 꽉 채워 이 층이 보이지 않는다.
 */
export function Stage({
  background,
  mood = 'sky',
  veiled = true,
  soft = false,
  children,
}: {
  /** 장면 배경 이미지 경로. 없으면 mood 그러데이션을 쓴다. */
  background?: string;
  mood?: Mood;
  /** 배경 그림 위에 글자를 얹을 때 대비를 만드는 막을 씌울지 */
  veiled?: boolean;
  /**
   * 배경 초점을 흐리는 정도.
   *  'lite' — 인트로. 장소는 읽히되 배경 속 인물만 뒤로 물러난다
   *  true   — 대화·따라 말하기. 캐릭터와 카드가 완전히 앞에 선다
   */
  soft?: boolean | 'lite';
  children: ReactNode;
}) {
  useEffect(() => {
    const ambience = document.getElementById('ambience');
    if (!ambience) return;
    ambience.style.backgroundImage = background ? `url(${background})` : 'none';
  }, [background]);

  return (
    <div className="stage">
      {background ? (
        <div
          className={`scene ${veiled ? 'scene--veiled' : ''} ${
            soft === 'lite' ? 'scene--soft-lite' : soft ? 'scene--soft' : ''
          }`}
          style={{ backgroundImage: `url(${background})` }}
          aria-hidden
        />
      ) : (
        <>
          <div className={`scene scene--${mood}`} aria-hidden />
          <div className="scene__floaties" aria-hidden>
            {FLOATIES[mood].map((item) => (
              <svg
                key={`${item.shape}${item.left}`}
                viewBox="0 0 28 24"
                width={28 * item.scale}
                height={24 * item.scale}
                style={{ top: item.top, left: item.left, animationDelay: item.delay }}
              >
                {SHAPES[item.shape]}
              </svg>
            ))}
          </div>
        </>
      )}
      <div className="scene-content">{children}</div>
    </div>
  );
}
