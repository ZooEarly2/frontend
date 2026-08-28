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
  partner: {
    name: string;
    /**
     * 동화에 적을 이름. 없으면 `name` 을 그대로 쓴다.
     *
     * 화면에서는 "코끼리 선생님" 이 맞다 — 아이가 보는 캐릭터가 코끼리이고,
     * 말풍선 위에 누가 말하는지 이름이 떠야 한다. 그런데 **동화 문장에 넣으면
     * 어색하다**: "코끼리 선생님께서 말씀하셨어요" 는 동물 이야기처럼 읽히는데,
     * 이 동화는 아이가 오늘 학교에서 겪은 일을 적는 기록이다.
     */
    storyName?: string;
    image: string;
    voice: 'TEACHER' | 'FRIEND';
  };


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

/** 셀 수 있는 과일. 그림 하나에 한 종류만 놓는다 — 섞으면 세는 일이 두 가지가 된다 */
export type MathFruit = {
  id: 'apple' | 'watermelon' | 'banana';
  /** 아이에게 읽어줄 이름 */
  name: string;
  image: string;
  /**
   * 개수 1~5 의 채점 문장 id. 서버 목록(math_1..15)과 같아야 한다.
   *
   * 자리(index)가 곧 개수−1 이라 **순서를 바꾸면 안 된다** — 바꾸면 사과를 센
   * 아이가 수박 문장으로 채점받는다.
   *
   * 짝은 ZooEarly-AI-develop 의 app/core/sentences.py 다. 그쪽 문장을 고치면
   * countSentence() 가 만드는 글자도 같이 고쳐야 한다 — 화면에 보이는 문장과
   * 채점하는 문장이 어긋나면 아이가 아무리 잘 읽어도 다른 말이라고 나온다.
   */
  sentenceIds: string[];
};

/**
 * 수업시간의 과목.
 *
 * 국어와 수학은 **앞부분이 같고 뒷부분만 다르다** — 둘 다 선생님이 쪽을 부르고,
 * 아이가 책을 밀어 그 쪽을 찾는다. 그 뒤에 국어는 동시를 읽고 수학은 과일을 센다.
 * 그래서 책 찾기까지는 한 코드가 맡고, 여기 담긴 그림과 문구만 갈아 끼운다.
 *
 * 배경과 책 그림이 과목마다 다른 이유는 화면이 거짓말을 하지 않게 하려는 것이다 —
 * 수학 시간에 국어책을 펴면 아이는 무엇을 하는 시간인지 알 수 없다.
 */
export type ClassSubject = {
  id: 'KOREAN' | 'MATH';
  /** 인트로 카드 제목 — "국어 시간이에요" */
  title: string;
  /** 그 아래 한 줄 */
  lead: string;
  /** 책 찾기 전까지 깔리는 배경 */
  scene: string;
  /**
   * 책을 찾는 동안 깔리는 배경.
   *
   * 과목마다 다르다. 국어 배경에는 그림 속에 **국어책이 그려져 있어서**,
   * 수학 시간에 그대로 쓰면 아이가 수학책을 밀면서 국어책을 보게 된다.
   */
  find: string;
  /** 손으로 밀어 넘기는 책 */
  book: string;
  /** 선생님이 쪽을 부르는 말. {page} 자리에 쪽 번호가 들어간다 */
  teacherLine: string;
  /** 책을 펴는 버튼 문구 */
  openLabel: string;
  /**
   * 다 끝냈을 때 깔리는 배경.
   *
   * 이것도 과목마다 다르다 — 국어 완료 그림에는 칠판에 국어 이야기가 적혀
   * 있어서, 수학을 다 푼 아이가 국어 시간을 마친 화면을 보게 된다.
   */
  complete: string;
  /**
   * 완료 화면에서 "무엇을 했는지" 짚어주는 말.
   *
   * 한 문장으로 뭉뚱그리면 수학을 한 아이에게 동시를 읽었다고 말하게 된다.
   * 오늘 한 일을 정확히 되짚어 주는 것이 이 화면이 하는 일의 전부다.
   */
  completeLine: string;
};

export type ClassScenario = {
  id: 'CLASS';
  title: string;
  tagline: string;
  /** 화면 위에 올리는 소품 그림 */
  props: { bookFound: string; swipeHint: string };
  /** 회차마다 둘 중 하나를 뽑는다 */
  subjects: { KOREAN: ClassSubject; MATH: ClassSubject };
  /** 국어 시간에 읽을 동시들 — 그중 한 편을 뽑는다 */
  poems: ClassPoem[];
  /** 수학 시간에 셀 과일들 — 그중 한 종류를 뽑는다 */
  fruits: MathFruit[];
  /** 수학 문제 그림 */
  mathScene: string;
};
