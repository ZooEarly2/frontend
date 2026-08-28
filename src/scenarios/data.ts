import type {
  CategoryId,
  ClassPoem,
  ClassScenario,
  ClassSubject,
  DialogueScenario,
  MathFruit,
} from './types';

/**
 * 시나리오 콘텐츠.
 *
 * 문구는 프로토타입(Figma 시안을 옮겨 둔 mock/*.ts)에서 그대로 가져왔다. 배경·캐릭터
 * 그림도 같은 프로젝트의 일러스트를 쓴다 — 그림 속 주인공이 주황 고양이(아이)와
 * 흰 토끼(선생님)라서, 스프라이트로 얹는 캐릭터와 세계관이 어긋나지 않는다.
 *
 * 선택지 문장은 여기 값이 **대체 문구**다. 화면에 실제로 뜨는 것은
 * GET /ai/pronunciation/sentences 가 준 문장이다 — 채점 기준 문장의 단일 소스가
 * 서버라서, 앱이 들고 있는 문구와 어긋나면 화면과 채점이 달라진다.
 */

export const ARRIVAL: DialogueScenario = {
  id: 'ARRIVAL',
  title: '등교하기',
  tagline: '친구에게 먼저 인사해요',
  sentenceCategory: 'arrival',
  storyCategory: 'school_arrival',
  scenes: {
    // 원본 bg_arrival_intro 에는 분홍 원피스 토끼가 한가운데 서 있었다.
    // 그 위에 호랑이 친구의 말풍선을 띄우니 토끼가 말하는 것처럼 읽혔다 —
    // 배경에서 인물을 지운 빈 거리로 바꾸고, 말하는 캐릭터는 직접 세운다.
    intro: '/scenes/arrival/bg_arrival_street.png',
    talk: '/scenes/arrival/bg_arrival_street.png',
    repeat: '/scenes/arrival/bg_arrival_street.png',
    complete: '/scenes/arrival/bg_arrival_complete2.webp',
  },
  partner: { name: '호랑이 친구', image: '/scenes/arrival/img_arrival_tiger.png', voice: 'FRIEND' },
  intro: { situation: '학교 앞이에요.\n친구를 만났어요!', prompt: '어떻게 인사해 볼까요?' },
  partnerLine: '안녕! 만나서 반가워.',
  speakPrompt: '마이크를 누르고\n인사해 보세요!',
  defaultSentenceId: 'arrival_1',
  fallbackChoices: [
    '안녕 나도 만나서 반가워 !',
    '안녕! 우리 같이 놀자!',
    '안녕! 같이 들어가자!',
    '안녕! 나도 반가워.',
    '안녕! 네 이름은 뭐야?',
    '안녕! 우리 친구 하자!',
    '안녕! 나 오늘 처음 왔어.',
    '안녕! 같이 가자!',
    '안녕! 만나서 나도 기뻐!',
  ],
  completeTitle: '등교하기 완료!',
  completeHint: '이제 수업을 들어볼까요?',
};

export const LUNCH: DialogueScenario = {
  id: 'LUNCH',
  title: '급식시간',
  tagline: '먹고 싶은 만큼 말해요',
  sentenceCategory: 'lunch',
  storyCategory: 'lunch',
  scenes: {
    intro: '/scenes/lunch/bg_lunch_intro.png',
    talk: '/scenes/lunch/bg_lunch_question.png',
    repeat: '/scenes/lunch/bg_lunch_question.png',
    complete: '/scenes/lunch/bg_lunch_complete2.webp',
  },
  // 배경에도 급식 선생님이 그려져 있지만, 인트로에서는 배경을 흐려 뒤로 밀고
  // 이 그림만 또렷하게 세운다 — 말하는 사람이 누구인지 분명해진다.
  partner: { name: '급식 선생님', image: '/scenes/lunch/img_lunch_rabbit_response.png', voice: 'TEACHER' },
  intro: { situation: '점심시간이에요.\n반찬을 받아봐요!', prompt: '얼마나 받을지 말해볼까요?' },
  partnerLine: '불고기 많이 줄까?',
  speakPrompt: '마이크를 누르고\n말해보세요!',
  defaultSentenceId: 'lunch_1',
  fallbackChoices: ['조금만 주세요.', '적당히 주세요.', '많이 주세요.'],
  completeTitle: '급식시간 완료!',
  completeHint: '맛있게 먹었어요!',
};

export const DISMISSAL: DialogueScenario = {
  id: 'DISMISSAL',
  title: '하교하기',
  tagline: '선생님께 인사드려요',
  sentenceCategory: 'departure',
  storyCategory: 'school_departure',
  scenes: {
    intro: '/scenes/dismissal/bg_dismissal_intro.png',
    talk: '/scenes/dismissal/bg_dismissal_intro.png',
    repeat: '/scenes/dismissal/bg_dismissal_intro.png',
    complete: '/scenes/dismissal/bg_dismissal_complete2.webp',
  },
  partner: {
    name: '코끼리 선생님',
    image: '/scenes/dismissal/img_dismissal_elephant.png',
    voice: 'TEACHER',
  },
  intro: { situation: '하루가 끝났어요.\n집에 갈 시간이에요!', prompt: '어떻게 인사해 볼까요?' },
  partnerLine: '이제 집에 갈 시간이에요 !',
  speakPrompt: '마이크를 누르고\n인사해 보세요!',
  defaultSentenceId: 'departure_1',
  fallbackChoices: [
    // "가세요" 가 아니라 "계세요" 다 — 가는 쪽은 아이고 선생님은 남아 계신다.
    '선생님, 안녕히 계세요!',
    '선생님, 감사합니다!',
    '내일 또 뵙겠습니다!',
    '오늘 정말 재미있었어요!',
    '내일 또 올게요!',
    '네, 조심해서 갈게요!',
  ],
  completeTitle: '하교하기 완료!',
  completeHint: '오늘도 멋진 하루를 보냈어요!',
};

export const CLASS: ClassScenario = {
  id: 'CLASS',
  title: '수업시간',
  tagline: '국어도 하고 수학도 해요',
  scenes: {
    // 수업시간 그림만 webp 다. 하늘 계조가 있는 그림이라 PNG 팔레트로 줄이면
    // 얼룩이 남고, 줄이지 않으면 한 장에 700KB 가 넘었다.
    complete: '/scenes/class/bg_class_complete2.webp',
  },
  /** 책 넘기기 화면이 쓰는 그림 */
  props: {
    bookFound: '/scenes/class/img_class_bookpage.webp',
    swipeHint: '/scenes/class/img_class_turn_hint.webp',
  },
  /*
   * 두 과목. 회차마다 하나가 나온다.
   *
   * 앞부분(선생님이 쪽을 부르고 → 아이가 책을 밀어 찾는다)은 완전히 같고,
   * 배경과 책 그림만 갈린다. 수학 시간에 국어책을 펴면 아이는 무엇을 하는
   * 시간인지 알 수 없다.
   */
  subjects: {
    KOREAN: {
      id: 'KOREAN',
      title: '국어 시간이에요',
      lead: '책을 펴고 동시를 읽어볼까요?',
      scene: '/scenes/class/bg_class_korean_intro.webp',
      find: '/scenes/class/bg_class_rabbit_order.webp',
      book: '/scenes/class/img_class_koreanbook.webp',
      teacherLine: '국어책 {page}페이지를 펴보자!',
      openLabel: '국어책 펴기',
    },
    MATH: {
      id: 'MATH',
      title: '수학 시간이에요',
      lead: '책을 펴고 과일을 세어볼까요?',
      scene: '/scenes/class/bg_class_math_intro.webp',
      find: '/scenes/class/bg_class_math_intro.webp',
      book: '/scenes/class/img_class_mathbook.webp',
      teacherLine: '수학책 {page}페이지를 펴보자!',
      openLabel: '수학책 펴기',
    },
  },
  /** 수학 문제 그림 — 과일은 이 위에 얹는다 */
  mathScene: '/scenes/class/img_class_math_scene.webp',
  /*
   * 셀 과일 세 가지. 한 그림에 한 종류만 놓는다 —
   * 섞으면 "몇 개인가" 가 "무엇이 몇 개인가" 가 되어 묻는 것이 둘로 늘어난다.
   */
  fruits: [
    { id: 'apple', name: '사과', image: '/scenes/class/img_fruit_apple.webp' },
    { id: 'watermelon', name: '수박', image: '/scenes/class/img_fruit_watermelon.webp' },
    { id: 'banana', name: '바나나', image: '/scenes/class/img_fruit_banana.webp' },
  ],
  /*
   * 동시 세 편. 회차마다 한 편을 뽑는다 — 같은 시만 나오면 두 번째 날부터는
   * 읽는 게 아니라 외운 것을 되뇌게 되고, 그러면 발음 채점이 아이가 지금 읽을
   * 수 있는 것을 재는 게 아니라 기억력을 재게 된다.
   *
   * 각 편의 sentenceId 는 서버 목록(study_1..4)과 같아야 한다. 시를 여기서만
   * 고치면 채점은 서버의 옛 문장으로 이뤄져 아이가 무엇을 읽든 어긋난다.
   */
  poems: [
    {
      sentenceId: 'study_1',
      title: '꽃',
      lines: ['노란 꽃이 피었어요', '예쁜 꽃이 피었어요', '바람이 살랑살랑', '꽃이 웃어요.'],
      scene: '/scenes/class/img_class_poem.webp',
    },
    {
      sentenceId: 'study_2',
      title: '눈',
      lines: ['눈이 와요, 눈이 와요', '하얀 눈이 펑펑 와요', '우리 같이 눈사람 만들어요.'],
      scene: '/scenes/class/img_class_poem_snow.webp',
      // 눈 그림은 위쪽이 비어 보이지 않는다. 한 줄만큼 내려 얹는다
      textOffset: 22,
    },
    {
      sentenceId: 'study_3',
      title: '파도',
      lines: ['파도가 와요, 철썩', '내 발을 만져요', '내가 뒤로 가면', '파도도 따라와요.'],
      scene: '/scenes/class/img_class_poem_wave.webp',
    },
    {
      sentenceId: 'study_4',
      title: '감기',
      lines: [
        '내 몸에',
        '불덩이가 들어왔다.',
        '뜨끈뜨끈.',
        '불덩이를 따라',
        '몹시 추운 사람도 들어왔다.',
        '오들오들.',
      ],
      scene: '/scenes/class/img_class_poem_cold.webp',
    },
  ],
};

/** 오늘의 과목. 화면에 들어올 때 한 번만 뽑는다. */
export function randomSubject(): ClassSubject {
  return Math.random() < 0.5 ? CLASS.subjects.KOREAN : CLASS.subjects.MATH;
}

/**
 * 오늘 셀 과일과 개수.
 *
 * 개수는 1~5 다. 여섯을 넘기면 아이가 한눈에 못 세고 하나씩 짚어야 하는데,
 * 그건 이 화면이 가르치려는 것(수를 말로 옮기기)이 아니라 세기 연습이 된다.
 */
export function randomFruitCount(): { fruit: MathFruit; count: number } {
  return {
    fruit: CLASS.fruits[Math.floor(Math.random() * CLASS.fruits.length)],
    count: 1 + Math.floor(Math.random() * 5),
  };
}

/** 직전에 읽은 시를 적어 두는 자리. 프로필과 따로 둔다 — 날짜가 바뀌어도 남아야 한다. */
const LAST_POEM_KEY = 'zooearly.lastPoem';

/**
 * 오늘 읽을 동시 한 편. 화면에 들어올 때 한 번만 뽑아 끝까지 같은 편을 쓴다.
 *
 * **직전에 나온 편은 빼고 뽑는다.** 순수 무작위로 세 편 중 하나를 고르면 같은 시가
 * 연달아 나오는 일이 자주 생긴다 — 세 편이면 3분의 1이다. 어른은 그걸 우연으로
 * 읽지만 아이는 "안 바뀐다" 로 읽고, 두 번째 날부터 시를 읽는 대신 외운 것을
 * 되뇌기 시작한다. 그러면 발음 채점이 아이가 지금 읽을 수 있는 것이 아니라
 * 기억력을 재게 된다.
 *
 * localStorage 가 막힌 브라우저(사파리 시크릿 등)에서는 그냥 무작위로 돌아간다 —
 * 시를 못 읽게 하는 것보다 가끔 겹치는 편이 낫다.
 */
export function randomPoem(): ClassPoem {
  let last: string | null = null;
  try {
    last = window.localStorage.getItem(LAST_POEM_KEY);
  } catch {
    last = null;
  }

  const pool = CLASS.poems.filter((item) => item.sentenceId !== last);
  const from = pool.length > 0 ? pool : CLASS.poems;
  const picked = from[Math.floor(Math.random() * from.length)];

  try {
    window.localStorage.setItem(LAST_POEM_KEY, picked.sentenceId);
  } catch {
    // 적어 두지 못하면 다음번에 겹칠 수 있다. 그뿐이라 넘어간다.
  }
  return picked;
}

/**
 * 직전에 읽은 시 기록을 지운다.
 *
 * "처음부터 플레이하기" 는 기기를 **다음 아이에게 넘기는** 동선이다. 앞 아이가
 * 읽은 것 때문에 다음 아이의 첫 시가 좁혀질 이유가 없다 — childId 를 새로 만드는
 * 것과 같은 이유다.
 */
export function forgetLastPoem(): void {
  try {
    window.localStorage.removeItem(LAST_POEM_KEY);
  } catch {
    // 못 지워도 다음 아이가 시 한 편을 덜 만날 뿐이다
  }
}

export const DIALOGUE_SCENARIOS: Record<Exclude<CategoryId, 'CLASS'>, DialogueScenario> = {
  ARRIVAL,
  LUNCH,
  DISMISSAL,
};

export const CATEGORY_META: Record<CategoryId, { title: string; tagline: string }> = {
  ARRIVAL: { title: ARRIVAL.title, tagline: ARRIVAL.tagline },
  CLASS: { title: CLASS.title, tagline: CLASS.tagline },
  LUNCH: { title: LUNCH.title, tagline: LUNCH.tagline },
  DISMISSAL: { title: DISMISSAL.title, tagline: DISMISSAL.tagline },
};

/**
 * 카테고리마다 다른 색 보석을 준다.
 *
 * 앱 이름이 "쥬얼리"다. 하루를 마치면 색이 다른 보석 네 개가 모이는데, 같은 별 네 개보다
 * 무엇을 몇 개 모았는지가 한눈에 들어온다 — 글자를 못 읽는 아이도 빈자리를 센다.
 */
export const CATEGORY_GEM: Record<CategoryId, { light: string; base: string; deep: string }> = {
  ARRIVAL: { light: '#FFD1D6', base: '#F2A0A8', deep: '#D2757F' },
  CLASS: { light: '#BFEDE3', base: '#7FD1C1', deep: '#4E9E8F' },
  LUNCH: { light: '#FFE7AE', base: '#FFD36E', deep: '#D9A22F' },
  DISMISSAL: { light: '#E0D5FA', base: '#C3AEF0', deep: '#9179CE' },
};

/** 홈·복습 화면이 카테고리 카드를 그릴 때 쓰는 배경 썸네일 */
export const CATEGORY_THUMB: Record<CategoryId, string> = {
  ARRIVAL: ARRIVAL.scenes.intro,
  // 수업시간은 과목이 둘이라 대표 그림이 없다. 홈 카드에는 국어 쪽을 쓴다.
  CLASS: CLASS.subjects.KOREAN.scene,
  LUNCH: LUNCH.scenes.intro,
  DISMISSAL: DISMISSAL.scenes.intro,
};

/** 회차마다 다른 국어책 쪽 번호. 한 쪽 앞을 먼저 보여줘야 해서 2 미만은 나오지 않는다. */
export function randomPage(): number {
  return 8 + Math.floor(Math.random() * 17);
}
