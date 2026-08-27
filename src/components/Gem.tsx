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
  /**
   * 그림이나 밝은 면 위에 홀로 얹힐 때. 몸통 바깥에만 어두운 테두리를 두른다.
   *
   * 완료 배경 네 장은 보석이 지나가는 위쪽이 전부 밝다(하늘·크림 벽). 게다가 그
   * 위에 크림 베일까지 덮여 있어 더 밝아진다. 흰 테두리는 거기서 1.02~1.14:1 로
   * 증발하고, 급식 보석은 몸통(#FFD36E)마저 배경과 1.2:1 이라 형체가 사라진다.
   * 어두운 잉크색은 네 배경 모두에서 8:1 을 넘긴다.
   *
   * 배경 그림의 고양이·풍선·튤립도 전부 따뜻한 갈색 외곽선으로 그려져 있다 —
   * 어두운 테두리는 대비를 위한 타협이 아니라 그림의 화법과 같아지는 선택이다.
   *
   * `paint-order: stroke` 는 칠을 선 위에 덮어 **바깥쪽 절반만** 남긴다.
   * 필터가 아니라 기하라 블러 패스가 없다.
   */
  outlined = false,
}: {
  colors: { light: string; base: string; deep: string };
  size?: number;
  empty?: boolean;
  outlined?: boolean;
}) {
  if (empty) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
        <path
          d="M7 3h10l4 6-9 12L3 9z"
          fill="none"
          style={{ stroke: 'var(--line-strong)' }}
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
      <path
        d="M7 3h10l4 6-9 12L3 9z"
        fill={colors.base}
        strokeWidth={outlined ? 1.3 : undefined}
        strokeLinejoin="round"
        style={outlined ? { stroke: 'var(--ink)', paintOrder: 'stroke' } : undefined}
      />
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
