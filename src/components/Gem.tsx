/**
 * 보석.
 *
 * 시나리오를 마치면 받는 상표다. 앱 이름이 "쥬얼리"라 별이 아니라 보석을 준다.
 * 카테고리마다 색이 달라, 하루가 끝나면 색이 다른 네 개가 모인다.
 *
 * 이모지(💎)를 쓰지 않은 이유가 있다 — 기기마다 모양과 색이 달라 앱 팔레트와 어긋나고,
 * 안드로이드에서는 파란 마름모로 떠서 코랄 계열 화면에서 튄다. 면(facet)을 직접 그리면
 * 어디서든 같은 보석이 뜬다.
 */
export function Gem({
  colors,
  size = 22,
  /** 아직 못 받은 자리. 테두리만 남긴다 */
  empty = false,
}: {
  colors: { light: string; base: string; deep: string };
  size?: number;
  empty?: boolean;
}) {
  if (empty) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
        <path
          d="M7 3h10l4 6-9 12L3 9z"
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeDasharray="2.5 2.5"
        />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      {/* 아래로 갈수록 어두워지는 몸통 — 깎인 돌처럼 보이게 한다 */}
      <path d="M7 3h10l4 6-9 12L3 9z" fill={colors.base} />
      {/* 왼쪽 위 큰 면: 빛을 받는 쪽 */}
      <path d="M7 3h5l-1.5 6H3z" fill={colors.light} />
      {/* 오른쪽 위 면: 그늘 */}
      <path d="M17 3h-5l1.5 6H21z" fill={colors.deep} opacity="0.85" />
      {/* 가운데 테이블 면 */}
      <path d="M12 3l1.5 6h-3z" fill={colors.light} opacity="0.7" />
      {/* 아래로 모이는 면 하나만 어둡게 — 두 개 다 칠하면 평평해 보인다 */}
      <path d="M12 21l9-12h-7.5z" fill={colors.deep} opacity="0.55" />
      {/* 반짝임 */}
      <path d="M8.6 4.6l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6L6.3 6.9l1.6-.7z" fill="#fff" opacity="0.9" />
    </svg>
  );
}
