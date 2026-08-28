import { useEffect } from 'react';
import { Gem } from './Gem';
import { GEM_EARNED, haptic } from '@/audio/haptics';
import { CATEGORY_GEM } from '@/scenarios/data';
import { CATEGORY_ORDER, type CategoryId } from '@/scenarios/types';

/**
 * 시나리오 하나를 마친 순간의 보상 — 떠올랐다가 사라지는 보석.
 *
 * 등교·수업·급식·하교의 완료 화면은 **같은 사건**이다. 아이는 하루에 이 연출을
 * 네 번 본다. 네 번이 조금이라도 다르면 아이는 그것을 "다른 일이 일어났다" 로
 * 읽는다 — 두 파일에 같은 JSX 를 두면 한쪽만 고쳐지는 날이 오고, 그날 아이는
 * 오전과 오후에 다른 보상을 받는다. 색만 category 로 갈리고 나머지는 여기 있다.
 *
 * **흐름 밖의 절대 배치다.** 배경 그림 네 장 모두 고양이 머리가 화면 38% 아래에서
 * 시작하고 그 위는 하늘·천장·크림 벽으로 비어 있다. 예전에는 92px 흰 원판이
 * 흐름 안(카드 바로 위)에 있어서 화면 한복판, 즉 고양이 얼굴 위에 얹혔다.
 * 흐름 안에서는 위쪽에 앉힐 방법이 없어 빼냈다.
 *
 * 기준은 `.scene-body` 다. 화면 비율(17% 같은 것)로 잡으면 노치가 있는 기기에서
 * `.scene-content` 의 패딩이 커지며 진행 점이 내려오는데, 절대 배치의 기준은
 * 패딩 박스라 보석은 그대로 있어 서로 덮는다. `.scene-body` 는 항상 진행 점
 * 바로 아래에서 시작하므로 무엇이 바뀌든 따라간다.
 */
export function GemReward({ category }: { category: CategoryId }) {
  /*
   * 보석이 자리를 잡는 순간 손끝으로도 알린다.
   *
   * 마운트 즉시가 아니라 187ms 뒤다 — gem-rise 키프레임의 11% 지점, 보석이
   * 1.12배로 튀어 올라 "도착했다" 로 읽히는 프레임이다. 먼저 울리면 아무것도
   * 없는 화면이 떨리고, 늦으면 보석은 이미 가만히 떠 있어서 무엇 때문에
   * 떨렸는지 이어지지 않는다.
   *
   * 진동이 안 되는 기기(아이폰)에서는 아무 일도 일어나지 않는다.
   */
  useEffect(() => {
    const at = window.setTimeout(() => haptic(GEM_EARNED), 187);
    return () => window.clearTimeout(at);
  }, []);

  return (
    <div className="gem-reward" aria-hidden>
      <span className="gem-reward__halo" />
      <span className="gem-reward__gem">
        <Gem colors={CATEGORY_GEM[category]} size={96} outlined />
      </span>
    </div>
  );
}

/**
 * 큰 보석이 떠난 자리에 남는 증거. 홈 화면에 있는 것과 **같은 네 칸**이다.
 *
 * 사라지는 것이 "없어졌다" 가 아니라 "옮겨 담았다" 로 읽히려면, 옮겨 간 곳이
 * 아이가 다음에 볼 화면과 같은 모양이어야 한다. 글자를 못 읽는 아이도 빈 칸은 센다.
 *
 * `earned` 를 스토어에만 맡기지 않는다 — `completeCategory()` 는 이펙트에서
 * 부르므로 완료 화면의 첫 프레임에는 방금 것이 아직 안 들어와 있다. 그 한 프레임
 * 때문에 방금 받은 칸이 비어 보이면 안 된다.
 */
export function GemKept({
  category,
  isCompleted,
}: {
  category: CategoryId;
  isCompleted: (category: CategoryId) => boolean;
}) {
  const earned = CATEGORY_ORDER.filter((id) => id === category || isCompleted(id));
  return (
    <div
      className="gem-track gem-track--kept"
      // div 의 암묵 role 은 generic 이라 aria-label 이 무시된다. role 을 줘야 읽힌다.
      role="img"
      aria-label={`보석 ${earned.length}개 중 ${CATEGORY_ORDER.length}개`}
    >
      {CATEGORY_ORDER.map((id) => (
        <span key={id} data-new={id === category ? 'true' : undefined}>
          {/*
            작은 보석에도 테두리를 준다. 카드 배경이 거의 흰색인데 급식 보석
            (#FFD36E)은 흰 바탕에서 1.2:1 이라, 테두리가 없으면 "여기 남았다" 는
            증거가 하필 급식에서만 안 보인다.
          */}
          <Gem colors={CATEGORY_GEM[id]} size={26} empty={!earned.includes(id)} outlined />
        </span>
      ))}
    </div>
  );
}
