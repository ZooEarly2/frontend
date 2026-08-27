import { useEffect, useMemo, useRef, useState } from 'react';
import { BigButton, Confetti, PartnerActor, SpeechBubble } from '@/components';
import { Gem } from '@/components/Gem';
import { CATEGORY_GEM } from '@/scenarios/data';
import { CATEGORY_ORDER } from '@/scenarios/types';
import './screens.css';

/**
 * 보석 네 개를 다 모은 순간.
 *
 * 하루를 다 해내고 홈으로 돌아온 그 한 번이 이 앱에서 가장 큰 보상이다. 그런데
 * 그냥 두면 잠겨 있던 버튼이 조용히 켜지는 것뿐이라, 아이는 무엇이 달라졌는지
 * 모른 채 지나친다. 그래서 화면을 덮고 순서대로 보여준다.
 *
 *   넷이 사방에서 날아와 마름모로 앉는다 → **넷이 함께 떠 있다(230ms)** →
 *   동시에 가운데로 빨려든다 → 꽂힌 채 멈춘다 → 터진다 →
 *   동화책이 폭발에서 튀어나온다 → 부엉이가 말을 건다
 *
 * **가운데의 "넷이 함께 떠 있는 230ms" 가 이 연출의 전부다.** 예전에는 넷이
 * 일직선으로 날아와 같은 한 점으로 붕괴했고, 1번 보석이 사라질 때 4번이 겨우
 * 도착했다. 넷이 흩어진 채 함께 보이는 구간이 158ms 뿐이라 지각 하한(약
 * 230ms)에 못 미쳤다 — 이 앱이 축하하려는 문장이 연출 때문에 지워지고 있었다.
 *
 * 애니메이션은 CSS 지연으로 줄을 세운다. 자바스크립트 타이머로 단계를 넘기면
 * 화면이 느린 기기에서 순서가 어긋나는데, CSS 는 같은 타임라인 위에서 돈다.
 * 자바스크립트가 재는 것은 버튼이 열리는 시각 하나뿐이고, 그것마저 말풍선의
 * animationend 를 우선 쓴다.
 *
 * **하루에 한 번만 나온다.** 홈에 돌아올 때마다 터지면 축하가 아니라 방해다.
 */

const OWL = '/scenes/lunch/img_lunch_owl_choicepractice.png';
const BOOK = '/scenes/story/fairytale_pre.png';

/**
 * 보석 넷의 자리.
 *
 * `f*` 는 날아오기 시작하는 곳, `l*` 는 앉는 자리다. 위·오른쪽·아래·왼쪽에서
 * 들어와 마름모로 앉고 **가운데를 비운다.** 그 빈 자리가 빛이 차오르는 곳이라,
 * 다음에 넷이 빨려들 자리가 아이 눈에 미리 보인다. 일직선으로 날려 보내면
 * "네 방향에서 모였다" 가 안 읽히고 네 개가 한 덩어리로 지나간 것이 된다.
 *
 * `spin` 은 넷이 서로 다른 각도로 날아들게 한다. 각도가 같으면 같은 물체가
 * 네 번 지나간 것으로 보인다.
 */
const GEM_SEATS = [
  { fx: 0, fy: -132, lx: 0, ly: -38, spin: -26 }, // 등교 — 위
  { fx: 168, fy: -8, lx: 50, ly: 0, spin: -9 }, // 수업 — 오른쪽
  { fx: 0, fy: 132, lx: 0, ly: 38, spin: 9 }, // 급식 — 아래
  { fx: -168, fy: -8, lx: -50, ly: 0, spin: 26 }, // 하교 — 왼쪽
] as const;

/** 첫 보석이 뜨는 시각과 다음 보석까지의 간격. 90ms 는 넷이 한 덩어리로 뭉쳐 보였다. */
const GEM_FIRST = 160;
const GEM_STEP = 120;

/** 폭발 시각. 파편과 컨페티가 이 프레임에 같이 출발해야 "폭발이 만든 것" 으로 읽힌다. */
const IMPACT = 1410;

/** 부엉이가 말을 거는 시각. 대사 낭독도 여기서 시작한다. */
const OWL_AT = 1890;

/** 버튼이 보이는 시각과, 눌리기까지 더 기다리는 시간. */
const SHOW_AT = 2210;
const TAP_DELAY = 320;

/** 폭발이 흩뿌리는 파편 수 */
const SHARD_COUNT = 14;

export function StoryUnlock({ onGo, onClose }: { onGo: () => void; onClose: () => void }) {
  /**
   * 스플래시가 걷힌 뒤에 시작한다.
   *
   * 앱을 껐다 켜서 홈으로 바로 들어오면 이 층이 스플래시 **뒤에서** 재생돼,
   * 화면이 열렸을 땐 이미 다 끝나 있다. 축하를 통째로 놓치는 셈이다.
   */
  const [armed, setArmed] = useState(() => !document.querySelector('.splash'));
  /** 버튼이 보이나 */
  const [shown, setShown] = useState(false);
  /** 버튼이 눌리나. 보이는 것과 320ms 떼어 둔다 */
  const [ready, setReady] = useState(false);
  /**
   * 부엉이가 나타났나.
   *
   * 말풍선은 마운트되는 즉시 대사를 읽기 시작한다. 그래서 예전에는 부엉이가
   * 화면에 나타나기 1.9초 전, 즉 **연출이 시작되자마자** 목소리가 깔렸다 —
   * 보석이 날아다니는 내내 말이 흘러나오고, 정작 부엉이가 나타날 때쯤엔
   * 이미 다 말한 뒤였다. 부엉이가 보일 때 말하게 한다.
   */
  const [owlIn, setOwlIn] = useState(false);
  const alive = useRef(true);

  /** 폭발 파편. 회차마다 다시 뽑지 않는다 — 다시 그릴 때마다 튀면 안 된다 */
  const shards = useMemo(
    () =>
      Array.from({ length: SHARD_COUNT }, (_, i) => ({
        key: i,
        // 정확히 균등하면 톱니바퀴로 보인다. 조금씩 흐트린다
        angle: i * (360 / SHARD_COUNT) + ((i % 3) - 1) * 7,
        radius: 96 + ((i * 37) % 72),
        life: 620 + ((i * 53) % 280),
        delay: IMPACT + (i % 5) * 8,
        color: CATEGORY_GEM[CATEGORY_ORDER[i % 4]].base,
      })),
    [],
  );

  useEffect(() => {
    alive.current = true;
    if (armed) return undefined;
    const poll = window.setInterval(() => {
      if (!alive.current) return;
      if (!document.querySelector('.splash')) {
        window.clearInterval(poll);
        setArmed(true);
      }
    }, 120);
    return () => {
      alive.current = false;
      window.clearInterval(poll);
    };
  }, [armed]);

  useEffect(() => {
    if (!armed) return undefined;
    alive.current = true;
    const timers = [
      window.setTimeout(() => alive.current && setOwlIn(true), OWL_AT),
      // 말풍선의 animationend 가 먼저 오면 그걸 쓴다. 이건 안전망이다 —
      // 요소가 렌더되지 않거나 탭이 백그라운드로 갔다 오면 그 이벤트가 안 온다.
      window.setTimeout(() => alive.current && setShown(true), SHOW_AT),
    ];
    return () => {
      alive.current = false;
      timers.forEach(window.clearTimeout);
    };
  }, [armed]);

  // 보이고 나서 조금 뒤에 눌린다. 반투명한 버튼이 눌리면 아이는 자기가 무엇을
  // 눌렀는지 모른 채 축하가 사라진 화면을 보게 된다.
  useEffect(() => {
    if (!shown) return undefined;
    const timer = window.setTimeout(() => alive.current && setReady(true), TAP_DELAY);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (!armed) return null;

  return (
    <div className="unlock" role="status" aria-label="보석을 모두 모았어요">
      <div className="unlock__stage">
        {/* 뒤에서 도는 빛살과 빛무리. 무대 안에 둬야 폭발 지점과 중심이 맞는다 */}
        <span className="unlock__rays" aria-hidden />
        <span className="unlock__glow" aria-hidden />

        {/* 여기서부터가 흔들린다. 배경 빛까지 흔들면 화면이 밀린 것으로 보인다 */}
        <div className="unlock__shake">
          <span className="unlock__core" aria-hidden />

          {/* 흩어져 있던 보석 넷이 마름모로 앉았다가 함께 빨려든다 */}
          <div className="unlock__gems" aria-hidden>
            {CATEGORY_ORDER.map((category, index) => {
              const seat = GEM_SEATS[index];
              return (
                <span
                  key={category}
                  className="unlock__gem"
                  style={
                    {
                      '--fx': `${seat.fx}px`,
                      '--fy': `${seat.fy}px`,
                      '--lx': `${seat.lx}px`,
                      '--ly': `${seat.ly}px`,
                      '--spin': `${seat.spin}deg`,
                      '--delay': `${GEM_FIRST + index * GEM_STEP}ms`,
                    } as React.CSSProperties
                  }
                >
                  <Gem colors={CATEGORY_GEM[category]} size={44} />
                </span>
              );
            })}
          </div>

          {/* 터진다 */}
          <span className="unlock__bloom" aria-hidden />
          <span className="unlock__shock" aria-hidden />
          <span className="unlock__shock unlock__shock--late" aria-hidden />
          <div className="unlock__shards" aria-hidden>
            {shards.map((shard) => (
              <span
                key={shard.key}
                className="unlock__shard"
                style={
                  {
                    '--a': `${shard.angle}deg`,
                    '--r': `${shard.radius}px`,
                    '--t': `${shard.life}ms`,
                    '--d': `${shard.delay}ms`,
                    background: shard.color,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>

          {/* 폭발에서 동화책이 튀어나온다 */}
          <div className="unlock__bookframe">
            <img src={BOOK} alt="" aria-hidden />
          </div>
        </div>
      </div>

      {/* 컨페티는 폭발 프레임에 출발한다. 처음부터 떨어지면 축하가 사건이 아니라 배경이 된다 */}
      <Confetti pieces={18} startMs={IMPACT} />

      <div
        className="unlock__talk"
        onAnimationEnd={(event) => {
          // 말풍선·부엉이의 pop-in 도 여기까지 올라온다. 이름으로 걸러야 한다.
          if (event.animationName === 'unlock-rise' && alive.current) setShown(true);
        }}
      >
        <SpeechBubble tone="teacher" speaker="안내 부엉이" narrate={owlIn}>
          {'보석 네 개를 다 모았구나!\n오늘 이야기로 동화를 만들어 줄게.'}
        </SpeechBubble>
        <div className="actors actors--grounded">
          <PartnerActor src={OWL} height={170} />
        </div>
      </div>

      <div className="unlock__actions" data-shown={shown} data-ready={ready}>
        <BigButton icon="book" onClick={onGo}>
          동화 만들러 가기
        </BigButton>
        <button type="button" className="text-link" onClick={onClose}>
          나중에 볼래요
        </button>
      </div>
    </div>
  );
}
