import { useEffect, useRef, useState } from 'react';
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
 *   보석 넷이 모인다 → 빛이 터진다 → 동화책이 나타난다 → 부엉이가 말을 건다
 *
 * 애니메이션은 CSS 지연으로 줄을 세운다. 자바스크립트 타이머로 단계를 넘기면
 * 화면이 느린 기기에서 순서가 어긋나는데, CSS 는 같은 타임라인 위에서 돈다.
 *
 * **하루에 한 번만 나온다.** 홈에 돌아올 때마다 터지면 축하가 아니라 방해다.
 */

const OWL = '/scenes/lunch/img_lunch_owl_choicepractice.png';
const BOOK = '/scenes/story/fairytale_pre.png';

export function StoryUnlock({ onGo, onClose }: { onGo: () => void; onClose: () => void }) {
  /**
   * 스플래시가 걷힌 뒤에 시작한다.
   *
   * 앱을 껐다 켜서 홈으로 바로 들어오면 이 층이 스플래시 **뒤에서** 재생돼,
   * 화면이 열렸을 땐 이미 다 끝나 있다. 축하를 통째로 놓치는 셈이다.
   */
  const [armed, setArmed] = useState(() => !document.querySelector('.splash'));
  // 마지막 단계(버튼)가 나오기 전에는 닫지 않는다 — 다 보기 전에 눌러 넘기면
  // 무엇을 받았는지 못 본다.
  const [ready, setReady] = useState(false);
  const alive = useRef(true);

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
    const timer = window.setTimeout(() => alive.current && setReady(true), 2200);
    return () => {
      alive.current = false;
      window.clearTimeout(timer);
    };
  }, [armed]);

  if (!armed) return null;

  return (
    <div className="unlock" role="dialog" aria-label="보석을 모두 모았어요">
      {/* 뒤에서 도는 빛살. 시선을 가운데로 모은다 */}
      <span className="unlock__rays" aria-hidden />
      <span className="unlock__glow" aria-hidden />
      <Confetti pieces={40} />

      <div className="unlock__stage">
        {/* 흩어져 있던 보석 넷이 가운데로 모인다 */}
        <div className="unlock__gems" aria-hidden>
          {CATEGORY_ORDER.map((category, index) => (
            <span
              key={category}
              className="unlock__gem"
              style={
                {
                  // 각자 제자리에서 출발해 가운데로 모인다
                  '--from-x': `${(index - 1.5) * 68}px`,
                  '--delay': `${0.12 + index * 0.09}s`,
                } as React.CSSProperties
              }
            >
              <Gem colors={CATEGORY_GEM[category]} size={40} />
            </span>
          ))}
        </div>

        {/* 보석이 모인 자리에서 빛이 터지고, 그 자리에 동화책이 남는다 */}
        <span className="unlock__burst" aria-hidden />
        <img className="unlock__book" src={BOOK} alt="" aria-hidden />
      </div>

      <div className="unlock__talk">
        <SpeechBubble tone="teacher" speaker="안내 부엉이">
          {'보석 네 개를 다 모았구나!\n오늘 이야기로 동화를 만들어 줄게.'}
        </SpeechBubble>
        <div className="actors actors--grounded">
          <PartnerActor src={OWL} height={170} />
        </div>
      </div>

      <div className="unlock__actions" data-ready={ready}>
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
