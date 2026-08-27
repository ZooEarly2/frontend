import type { NativeLanguage } from '@/api/types';

/**
 * 아이콘.
 *
 * 이모지를 쓰지 않는다. 이유가 세 가지다.
 *
 *  1. 기기마다 그림이 다르다. 같은 🎤 가 안드로이드·iOS·윈도우에서 각각 다른 색과
 *     모양으로 뜬다 — 앱 팔레트와 어긋나고, 화면마다 굵기가 달라 조잡해 보인다.
 *  2. **윈도우는 국기 이모지를 아예 그리지 않는다.** 🇰🇷 가 "KR" 이라는 글자 두 개로
 *     떨어진다. 실제로 온보딩의 언어 선택이 그렇게 나왔다.
 *  3. 이모지는 글자라서 크기·정렬이 글꼴에 끌려다닌다. 버튼 안에서 미세하게 어긋난다.
 *
 * 그래서 24 그리드에 2px 선, 둥근 끝으로 통일해 직접 그린다.
 * 유아용 앱(Khan Academy Kids · Duolingo ABC · Lingokids · Sago Mini · Toca Boca ·
 * PBS Kids · Epic! · Pinkfong · Endless Alphabet · Montessori Preschool)이 공통으로
 * 쓰는 규칙을 따랐다 — 굵고 둥근 선, 최소한의 디테일, 채우기보다 윤곽.
 */

export type IconName =
  | 'mic'
  | 'choose'
  | 'home'
  | 'sound'
  | 'sound-on'
  | 'book'
  | 'lock'
  | 'play'
  | 'menu'
  | 'back'
  | 'next'
  | 'replay'
  | 'person'
  | 'books'
  | 'backpack'
  | 'check'
  | 'bulb';

const PATHS: Record<IconName, React.ReactNode> = {
  mic: (
    <>
      <path d="M12 3.4a2.9 2.9 0 0 1 2.9 2.9v5.2a2.9 2.9 0 1 1-5.8 0V6.3A2.9 2.9 0 0 1 12 3.4Z" />
      <path d="M5.6 11.2a6.4 6.4 0 0 0 12.8 0" />
      <path d="M12 17.6V20.6" />
      <path d="M8.6 20.6h6.8" />
    </>
  ),
  // 보기 목록에서 하나를 고른다 — 마지막 줄에 체크가 붙는다
  choose: (
    <>
      <path d="M4 6.6h10" />
      <path d="M4 12h10" />
      <path d="M4 17.4h5.5" />
      <path d="M13.8 16.8l2.4 2.4 4.2-4.6" />
    </>
  ),
  home: (
    <>
      <path d="M3.6 10.6 12 3.6l8.4 7" />
      <path d="M5.9 9.6V19a1.4 1.4 0 0 0 1.4 1.4h9.4A1.4 1.4 0 0 0 18.1 19V9.6" />
      <path d="M10 20.4v-5.1h4v5.1" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9.4h3.4L12 5.4v13.2L7.4 14.6H4Z" />
      <path d="M15.6 9.8a3.6 3.6 0 0 1 0 4.4" />
    </>
  ),
  // 재생 중 — 파동이 하나 더 있다
  'sound-on': (
    <>
      <path d="M4 9.4h3.4L12 5.4v13.2L7.4 14.6H4Z" />
      <path d="M15.6 9.8a3.6 3.6 0 0 1 0 4.4" />
      <path d="M18.2 7.2a7.2 7.2 0 0 1 0 9.6" />
    </>
  ),
  // 펼친 책. "국어책 펴기" 자리에 쓰므로 덮인 책이 아니라 펼친 모양이어야 한다
  book: (
    <>
      <path d="M12 6.4C10.4 4.9 8.3 4.1 6 4.1H3.6v13.4H6c2.3 0 4.4.8 6 2.4" />
      <path d="M12 6.4c1.6-1.5 3.7-2.3 6-2.3h2.4v13.4H18c-2.3 0-4.4.8-6 2.4" />
      <path d="M12 6.4v13.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4.8" y="10.4" width="14.4" height="10" rx="2.6" />
      <path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6" />
    </>
  ),
  play: <path d="M8.4 5.4 18 12l-9.6 6.6Z" />,
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  back: <path d="M15 4.8 7.6 12 15 19.2" />,
  next: <path d="M9 4.8 16.4 12 9 19.2" />,
  replay: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20.3 4.2v4.6h-4.6" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8.2" r="3.8" />
      <path d="M4.8 20.4a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  books: (
    <>
      <rect x="4" y="4.6" width="4.4" height="15" rx="1.3" />
      <rect x="9.8" y="4.6" width="4.4" height="15" rx="1.3" />
      <path d="M16.4 6.6l3.5.9a1.3 1.3 0 0 1 .9 1.6l-2.8 10.4" />
    </>
  ),
  backpack: (
    <>
      <path d="M5.2 10.8A4.6 4.6 0 0 1 9.8 6.2h4.4a4.6 4.6 0 0 1 4.6 4.6v7.6a2 2 0 0 1-2 2H7.2a2 2 0 0 1-2-2Z" />
      <path d="M9.2 6.4V5.2a2.8 2.8 0 0 1 5.6 0v1.2" />
      <path d="M9.4 13.6h5.2" />
    </>
  ),
  check: <path d="M5 12.6 9.8 17.4 19 6.8" />,
  bulb: (
    <>
      {/* 유리구 — 위가 둥글고 아래로 좁아진다 */}
      <path d="M12 3.2a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.6h5.4v-.6c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3.2Z" />
      {/* 소켓 두 줄 */}
      <path d="M9.7 18.4h4.6" />
      <path d="M10.4 20.8h3.2" />
      {/* 빛 — 켜졌다는 신호 */}
      <path d="M12 1.2v-.9M4.6 4.6l-.6-.6M19.4 4.6l.6-.6M2.6 11.4h-.9M21.4 11.4h.9" />
    </>
  ),
};

/** 채워서 그리는 아이콘 — 선으로 그리면 형태가 안 읽힌다 */
const FILLED: IconName[] = ['sound', 'sound-on', 'play'];

export function Icon({
  name,
  size = 22,
  className = '',
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const filled = FILLED.includes(name);
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {/* 소리·재생처럼 덩어리로 읽혀야 하는 것만 면으로 채운다 */}
      <g fill={filled ? 'currentColor' : 'none'}>{PATHS[name]}</g>
    </svg>
  );
}

/**
 * 언어 깃발.
 *
 * 이모지 국기(🇰🇷)를 쓰면 윈도우에서 "KR" 글자로 떨어진다. 아직 한글을 못 읽는
 * 아이가 자기 언어를 찾아야 하는 자리라, 글자로 떨어지면 기능이 사라진다.
 */
export function Flag({ lang, size = 34 }: { lang: NativeLanguage; size?: number }) {
  const common = {
    width: size,
    height: (size * 2) / 3,
    viewBox: '0 0 30 20',
    className: 'flag',
    'aria-hidden': true as const,
    focusable: 'false' as const,
  };

  if (lang === 'KOREAN') {
    // 태극은 원을 빨강으로 채운 뒤 아래쪽 물결만 파랑으로 덮어 그린다 —
    // 반원 둘을 따로 그리면 가운데 S 곡선이 나오지 않아 그냥 두 색 덩어리가 된다.
    const trigram = 'M-1.9 -1.4H1.9M-1.9 0H1.9M-1.9 1.4H1.9';
    return (
      <svg {...common}>
        <rect width="30" height="20" rx="3" fill="#fff" />
        <circle cx="15" cy="10" r="4.2" fill="#CD2E3A" />
        <path
          d="M10.8 10a2.1 2.1 0 0 1 4.2 0 2.1 2.1 0 0 0 4.2 0 4.2 4.2 0 0 1-8.4 0Z"
          fill="#0047A0"
        />
        <g stroke="#141414" strokeWidth="0.8" strokeLinecap="round">
          <g transform="translate(5.4 5) rotate(-33)">
            <path d={trigram} />
          </g>
          <g transform="translate(24.6 5) rotate(33)">
            <path d={trigram} />
          </g>
          <g transform="translate(5.4 15) rotate(33)">
            <path d={trigram} />
          </g>
          <g transform="translate(24.6 15) rotate(-33)">
            <path d={trigram} />
          </g>
        </g>
        <rect width="30" height="20" rx="3" fill="none" stroke="rgba(0,0,0,.12)" />
      </svg>
    );
  }

  if (lang === 'VIETNAMESE') {
    return (
      <svg {...common}>
        <rect width="30" height="20" rx="3" fill="#DA251D" />
        <path
          d="m15 5.2 1.5 3.1 3.4.5-2.5 2.4.6 3.4-3-1.6-3 1.6.6-3.4L10.1 8.8l3.4-.5Z"
          fill="#FFCD00"
        />
        <rect width="30" height="20" rx="3" fill="none" stroke="rgba(0,0,0,.12)" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect width="30" height="20" rx="3" fill="#DE2910" />
      <path d="m7 4.2 1.2 2.5 2.7.4-2 1.9.5 2.7L7 10.4l-2.4 1.3.5-2.7-2-1.9 2.7-.4Z" fill="#FFDE00" />
      <g fill="#FFDE00">
        <circle cx="13.2" cy="3.6" r="1" />
        <circle cx="15.6" cy="5.8" r="1" />
        <circle cx="15.6" cy="8.8" r="1" />
        <circle cx="13.2" cy="10.8" r="1" />
      </g>
      <rect width="30" height="20" rx="3" fill="none" stroke="rgba(0,0,0,.12)" />
    </svg>
  );
}
