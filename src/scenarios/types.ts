import type { Scenario, SentenceCategory, StorySceneCategory } from '@/api/types';

/** 카테고리는 고정 4개다. 새 콘텐츠는 카테고리가 아니라 시나리오로 늘린다. */
export type CategoryId = Scenario;

export const CATEGORY_ORDER = ['ARRIVAL', 'CLASS', 'LUNCH', 'DISMISSAL'] as const;

/**
 * 같은 하나의 활동을 세 군데서 다른 이름으로 부른다. 값이 다르니 섞어 쓰면 400 이다.
 *
 * | 뜻 | 시나리오 | 문장 목록 | 동화 |
 * |---|---|---|---|
 * | 등교 | ARRIVAL | arrival | school_arrival |
 * | 수업 | CLASS | study | class |
 * | 급식 | LUNCH | lunch | lunch |
 * | 하교 | DISMISSAL | departure | school_departure |
 */
export type DialogueScenario = {
  id: Exclude<CategoryId, 'CLASS'>;
  title: string;
  /** 홈 카드의 한 줄 설명 */
  tagline: string;
  sentenceCategory: Exclude<SentenceCategory, 'study'>;
  storyCategory: Exclude<StorySceneCategory, 'class'>;

  /** 배경 그림. 없는 자리는 앞 단계 배경을 그대로 쓴다. */
  scenes: { intro: string; talk: string; repeat: string; complete: string };

  /**
   * 상대 캐릭터 — 아이에게 말을 거는 쪽.
   *
   * ``voice`` 는 말풍선을 읽어줄 목소리다. 또래 친구는 아이 목소리로, 선생님은
   * 어른 목소리로 나간다 — 글자를 못 읽는 아이도 누가 말하는지 소리로 안다.
   */
  partner: { name: string; image: string; voice: 'TEACHER' | 'FRIEND' };


  /**
   * 첫 화면 문구.
   *
   * 첫 화면에서 읽어주는 것은 **이 상황 안내뿐이다.** 상대가 건넨 말은 다음 장
   * (표현 고르기)에서 다시 읽어주므로, 여기서까지 읽으면 같은 말을 두 번 듣게 된다.
   */
  intro: { situation: string; prompt: string };
  /** 상대가 아이에게 한 말. 동화 기록의 partnerLine 으로도 그대로 나간다. */
  partnerLine: string;
  /** 마이크 화면 문구 */
  speakPrompt: string;
  /**
   * 말해보기(자유 발화) 갈래에서 쓸 기준 문장.
   *
   * 발음 채점은 sentenceId 를 요구하는데 자유 발화에는 고른 문장이 없다. 그래서
   * 이 카테고리의 대표 문장 하나를 기준으로 삼아, 자유 발화로 와도 따라 말하기와
   * 채점이 그대로 이어지게 한다. 목록을 못 받았을 때의 대체 문구이기도 하다.
   */
  defaultSentenceId: string;
  fallbackChoices: string[];
  completeTitle: string;
  completeHint: string;
};

/**
 * 동시 한 편.
 *
 * 그림을 시와 함께 묶어 둔다. 따로 두면 시만 바꾸고 그림을 안 바꾸는 실수가
 * 나는데, 눈 오는 시에 꽃 그림이 깔려도 코드는 아무 말을 안 한다.
 *
 * `sentenceId` 도 여기 있다. 채점은 앱이 보낸 id 로 서버가 자기 문장을 찾아
 * 하는 것이라, 화면에 띄운 시와 id 가 어긋나면 아이가 읽은 것과 다른 시를
 * 기준으로 채점된다 — 무엇을 읽어도 "다른 말을 했다" 가 된다.
 */
export type ClassPoem = {
  sentenceId: string;
  title: string;
  lines: string[];
  /** 시 카드에 깔리는 그림 */
  scene: string;
  /**
   * 글자를 아래로 더 내릴 거리(px).
   *
   * 그림마다 위쪽에 무엇이 그려져 있는지가 달라서, 같은 자리에 글을 얹으면
   * 어떤 그림에서는 그림 속 물체와 겹친다. 시와 그림이 한 덩어리로 묶여 있으니
   * 이 값도 여기 둔다 — 그림을 바꾸면 이 값도 같이 봐야 한다.
   */
  textOffset?: number;
};

export type ClassScenario = {
  id: 'CLASS';
  title: string;
  tagline: string;
  scenes: { intro: string; find: string; poem: string; complete: string };
  /** 화면 위에 올리는 소품 그림 */
  props: { book: string; bookFound: string; swipeHint: string };
  teacherLine: string;
  /** 회차마다 이 중 한 편을 뽑는다 */
  poems: ClassPoem[];
};
