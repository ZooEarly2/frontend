import type { CategoryId, ClassPoem, ClassScenario, DialogueScenario } from './types';

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

const S = '/scenes';

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
    intro: `${S}/arrival/bg_arrival_street.png`,
    talk: `${S}/arrival/bg_arrival_street.png`,
    repeat: `${S}/arrival/bg_arrival_street.png`,
    complete: `${S}/arrival/bg_arrival_complete.png`,
  },
  partner: { name: '호랑이 친구', image: `${S}/arrival/img_arrival_tiger.png`, voice: 'FRIEND' },
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
    intro: `${S}/lunch/bg_lunch_intro.png`,
    talk: `${S}/lunch/bg_lunch_question.png`,
    repeat: `${S}/lunch/bg_lunch_question.png`,
    complete: `${S}/lunch/bg_lunch_complete.png`,
  },
  // 배경에도 급식 선생님이 그려져 있지만, 인트로에서는 배경을 흐려 뒤로 밀고
  // 이 그림만 또렷하게 세운다 — 말하는 사람이 누구인지 분명해진다.
  partner: { name: '급식 선생님', image: `${S}/lunch/img_lunch_rabbit_response.png`, voice: 'TEACHER' },
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
    intro: `${S}/dismissal/bg_dismissal_intro.png`,
    talk: `${S}/dismissal/bg_dismissal_intro.png`,
    repeat: `${S}/dismissal/bg_dismissal_intro.png`,
    complete: `${S}/dismissal/bg_dismissal_complete.png`,
  },
  partner: {
    name: '코끼리 선생님',
    image: `${S}/dismissal/img_dismissal_elephant.png`,
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
  tagline: '동시를 같이 읽어요',
  scenes: {
    // 수업시간 그림만 webp 다. 하늘 계조가 있는 그림이라 PNG 팔레트로 줄이면
    // 얼룩이 남고, 줄이지 않으면 한 장에 700KB 가 넘었다.
    intro: `${S}/class/bg_class_korean_intro.webp`,
    find: `${S}/class/bg_class_rabbit_order.webp`,
    poem: `${S}/class/bg_class_korean_intro.webp`,
    complete: `${S}/class/bg_class_complete.webp`,
  },
  /** 책 넘기기·시 읽기 화면이 쓰는 그림 */
  props: {
    book: `${S}/class/img_class_koreanbook.webp`,
    bookFound: `${S}/class/img_class_bookpage.webp`,
    swipeHint: `${S}/class/img_class_turn_hint.webp`,
  },
  teacherLine: '국어책 {page}페이지를 펴보자!',
  /*
   * 동시 세 편. 회차마다 한 편을 뽑는다 — 같은 시만 나오면 두 번째 날부터는
   * 읽는 게 아니라 외운 것을 되뇌게 되고, 그러면 발음 채점이 아이가 지금 읽을
   * 수 있는 것을 재는 게 아니라 기억력을 재게 된다.
   *
   * 각 편의 sentenceId 는 서버 목록(study_1..3)과 같아야 한다. 시를 여기서만
   * 고치면 채점은 서버의 옛 문장으로 이뤄져 아이가 무엇을 읽든 어긋난다.
   */
  poems: [
    {
      sentenceId: 'study_1',
      title: '꽃',
      lines: ['노란 꽃이 피었어요', '예쁜 꽃이 피었어요', '바람이 살랑살랑', '꽃이 웃어요.'],
      scene: `${S}/class/img_class_poem.webp`,
    },
    {
      sentenceId: 'study_2',
      title: '눈',
      lines: ['눈이 와요, 눈이 와요', '하얀 눈이 펑펑 와요', '우리 같이 눈사람 만들어요.'],
      scene: `${S}/class/img_class_poem_snow.webp`,
    },
    {
      sentenceId: 'study_3',
      title: '파도',
      lines: ['파도가 와요, 철썩', '내 발을 만져요', '내가 뒤로 가면', '파도도 따라와요.'],
      scene: `${S}/class/img_class_poem_wave.webp`,
    },
  ],
};

/** 오늘 읽을 동시 한 편. 화면에 들어올 때 한 번만 뽑아 끝까지 같은 편을 쓴다. */
export function randomPoem(): ClassPoem {
  return CLASS.poems[Math.floor(Math.random() * CLASS.poems.length)];
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
  CLASS: CLASS.scenes.intro,
  LUNCH: LUNCH.scenes.intro,
  DISMISSAL: DISMISSAL.scenes.intro,
};

/** 회차마다 다른 국어책 쪽 번호. 한 쪽 앞을 먼저 보여줘야 해서 2 미만은 나오지 않는다. */
export function randomPage(): number {
  return 8 + Math.floor(Math.random() * 17);
}
