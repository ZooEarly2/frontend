import { useEffect, useMemo, useRef, useState } from 'react';
import { BigButton, Confetti, PartnerActor, SpeechBubble } from '@/components';
import { Gem } from '@/components/Gem';
import { GEM_MERGE, haptic, stopHaptics } from '@/audio/haptics';
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
/*
 * `ex`/`ey` 는 **진행 축의 단위벡터**다. 스쿼시가 이 축을 따라간다 — 위에서
 * 내리꽂힌 보석은 가로로 퍼지고, 옆에서 온 보석은 세로로 퍼져야 한다. 왼쪽에서
 * 날아온 보석이 세로로 눌리면 물리가 어긋나 "박혔다" 가 안 읽힌다.
 *
 * `at` 은 출발 시각, `w` 는 **타격 무게**다. 스쿼시 깊이·링 크기·불꽃 세기·화면
 * 킥이 전부 이 값 하나로 커진다.
 */
const GEM_SEATS = [
  { fx: 0, fy: -138, lx: 0, ly: -38, spin: -26, ex: 0, ey: 1, at: 150, w: 0.8 }, // 등교 — 위
  { fx: 176, fy: -8, lx: 50, ly: 0, spin: -9, ex: 1, ey: 0, at: 340, w: 0.9 }, // 수업 — 오른쪽
  { fx: 0, fy: 138, lx: 0, ly: 38, spin: 9, ex: 0, ey: 1, at: 530, w: 1.0 }, // 급식 — 아래
  { fx: -176, fy: -8, lx: -50, ly: 0, spin: 26, ex: 1, ey: 0, at: 790, w: 1.2 }, // 하교 — 왼쪽
] as const;

/*
 * 타격 간격이 190 / 190 / **260** 인 것은 실수가 아니다.
 *
 * 같은 간격 넷은 메트로놈이다. 셋을 또박또박 치고 **한 박자 쉰 뒤** 마지막을 크게
 * 치면, 그 쉼표가 네 번째를 사건으로 만든다 — 그게 "넷을 다 모았다" 의 프레임이다.
 *
 * 예전에는 비행 420ms 에 간격 120ms 라 **항상 3.5개가 동시에 날았다.** 넷이 한
 * 무리로 흘러서 "하나씩" 이 아예 안 보였다. 비행을 250ms 로 줄이니 동시에 움직이는
 * 것이 1개 이하가 되어 비로소 하나·둘·셋·넷이 세어진다.
 */

/*
 * 아래 값들은 **CSS 키프레임과 반드시 같아야 한다.** 이 파일이 이미 한 번 겪은
 * 사고다 — 타이머가 300ms 인데 키프레임이 900ms 였다. 그래서 각 시각을 숫자로
 * 따로 적지 않고 **식으로 이어** 둔다. 한 곳을 옮기면 나머지가 따라온다.
 */

/** gem-slam 한 판의 길이와, 그 안에서 **박히는 프레임**이 오는 시각(46%) */
const GEM_DUR = 250;
const GEM_CONTACT = Math.round(GEM_DUR * 0.46); // 115

/** 넷이 다 박힌 채 240ms 를 그대로 둔다. 이 화면이 축하하려는 문장이 거기서 읽힌다 */
const MERGE_AT = 1280;
const MERGE_DUR = 320;

/**
 * 폭발 시각. 파편과 컨페티가 이 프레임에 같이 출발해야 "폭발이 만든 것" 으로 읽힌다.
 *
 * gem-merge 의 56% 에서 넷이 가운데에 꽂히고, 거기서 **91ms 멈췄다가** 터진다.
 * 그 정지가 없으면 빨려든 것과 터진 것이 한 동작으로 뭉쳐 "삼켜졌다" 가 안 읽힌다.
 */
const IMPACT = MERGE_AT + Math.round(MERGE_DUR * 0.56) + 91; // 1550

/** 부엉이가 말을 거는 시각. 대사 낭독도 여기서 시작한다. */
const OWL_AT = 2030;

/** 버튼이 보이는 시각과, 눌리기까지 더 기다리는 시간. */
const SHOW_AT = 2350;
const TAP_DELAY = 320;

/** 첫 보석이 박히는 순간. 진동 4연타가 여기서 배열째 한 번 나간다 */
const FIRST_SLAM = GEM_SEATS[0].at + GEM_CONTACT;

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

  /**
   * 손끝으로도 네 번 친다.
   *
   * **타이머는 하나다.** 착지마다 부르면 새 vibrate() 가 진행 중이던 패턴을 무조건
   * 끊어서(W3C Vibration API) 넷이 서로를 지운다. 게다가 느린 기기에서는 JS 타이머가
   * CSS 타임라인과 어긋나 진동과 화면이 따로 논다. 배열 하나를 넘기면 운영체제가
   * 리듬을 돌려주므로 둘 다 생기지 않는다.
   *
   * 안 되는 기기에서는 haptic() 이 조용히 아무 일도 안 한다 — 아이폰·아이패드는
   * 애플이 이 API 를 구현하지 않아 **영원히** 안 된다. 그래서 이 연출은 진동이
   * 없어도 화면만으로 타격이 다 읽혀야 한다(스쿼시·히트스톱·링·불꽃·화면 킥).
   *
   * 움직임을 줄여 달라고 한 기기에는 아예 쏘지 않는다. 그 판단은 haptics.ts 가
   * 이미 하고 있고(소리 스위치도 같이 따른다), 여기서는 떠날 때 끊기만 한다.
   */
  useEffect(() => {
    if (!armed) return undefined;
    const buzz = window.setTimeout(() => haptic(GEM_MERGE), FIRST_SLAM);
    return () => {
      window.clearTimeout(buzz);
      // 화면을 떠나는데 손이 계속 울리면 안 된다
      stopHaptics();
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
    /*
      장식 수십 개가 든 상자를 라이브 영역으로 두면, 스크린리더는 마운트되는 즉시
      이름만 읽고 정작 **결말은 못 말한다.** 상자는 통째로 감추고, 결과 한 줄만
      따로 두어 버튼이 뜰 때 채운다.
    */
    <div className="unlock">
      <p className="unlock__sr" role="status">
        {shown ? '보석 네 개를 다 모아서 오늘의 동화책이 열렸어요.' : ''}
      </p>

      <div className="unlock__stage" aria-hidden>
        {/* 뒤에서 도는 빛살과 빛무리. 무대 안에 둬야 폭발 지점과 중심이 맞는다 */}
        <span className="unlock__rays" aria-hidden />
        <span className="unlock__glow" aria-hidden />

        {/* 여기서부터가 흔들린다. 배경 빛까지 흔들면 화면이 밀린 것으로 보인다 */}
        <div className="unlock__shake">
          <span className="unlock__core" aria-hidden />

          {/*
            박히는 자리의 충격파. **보석보다 먼저 그린다** — 뒤에 깔려야 보석이
            링을 뚫고 나온 것으로 읽힌다. 그리고 보석과 형제로 두는 이유는,
            보석이 스쿼시로 일그러질 때 자식이면 링까지 같이 찌그러지기 때문이다.
          */}
          <div className="unlock__slams">
            {CATEGORY_ORDER.map((category, index) => {
              const seat = GEM_SEATS[index];
              return (
                <span
                  key={category}
                  className="unlock__slam"
                  style={
                    {
                      '--lx': `${seat.lx}px`,
                      '--ly': `${seat.ly}px`,
                      '--w': `${seat.w}`,
                      '--hit': `${seat.at + GEM_CONTACT}ms`,
                      // 링 색은 base 가 아니라 deep 이다. 크림 배경 위에서
                      // 파스텔 base 는 형체가 사라진다
                      '--slam': CATEGORY_GEM[category].deep,
                    } as React.CSSProperties
                  }
                />
              );
            })}
          </div>

          {/* 하나씩 내리꽂혀 박히고, 넷이 다 박히면 그때 가운데로 빨려든다 */}
          <div className="unlock__gems">
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
                      '--ex': `${seat.ex}`,
                      '--ey': `${seat.ey}`,
                      '--w': `${seat.w}`,
                      '--delay': `${seat.at}ms`,
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
