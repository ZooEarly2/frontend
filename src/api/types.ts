/**
 * 게이트웨이(`/api/v1/ai/*`)가 돌려주는 값의 모양.
 *
 * 게이트웨이는 FastAPI 응답 body 를 파싱하지 않고 그대로 흘려보낸다. 즉 여기 타입은
 * **FastAPI 가 만든 JSON** 그대로다 — 필드명이 camelCase 인 것도 그 때문이다.
 */

export type SuccessEnvelope<T> = { success: true; data: T };
export type ErrorEnvelope = {
  success: false;
  error: { code: string; message: string; field: string | null };
};

export type NativeLanguage = 'KOREAN' | 'CHINESE' | 'VIETNAMESE';
export type Scenario = 'ARRIVAL' | 'CLASS' | 'LUNCH' | 'DISMISSAL';

/** 문장 목록의 카테고리. 시나리오 enum 과도, 동화 카테고리와도 값이 다르다 — 섞지 않는다. */
export type SentenceCategory = 'arrival' | 'study' | 'lunch' | 'departure' | 'math';

export type AudioPayload = { data: string; format: string };

export type SttResult = {
  /** 못 알아들었으면 null 이다. 에러가 아니라 그대로 다음으로 간다. */
  text: string | null;
  confidence: number | null;
  language: NativeLanguage;
  durationSec: number;
};

export type TtsResult = {
  audio: AudioPayload;
  /** 목 서버가 만든 차임이면 true. 이때는 브라우저 음성으로 대신 읽어준다. */
  mock?: boolean;
};

export type PronunciationSentence = {
  sentenceId: string;
  category: SentenceCategory;
  text: string;
  /**
   * 모국어 번역. 언어 코드(`vi` · `zh`)를 키로 한 번에 온다.
   *
   * 표현 퀴즈의 힌트(전구)가 이 값을 띄운다. **화면 진입 때 받아 두는 것이 핵심이다** —
   * 전구를 누르는 순간 서버를 부르면 아이는 버튼이 안 눌린 줄 알고 다시 누른다.
   */
  translations?: Record<string, string>;
  /**
   * 번역문의 어느 조각이 한국어 어느 어절인지.
   *
   * 조각은 **번역문을 읽는 순서**대로다 — 한국어 순서가 아니라 `k` 가 뒤죽박죽인
   * 것이 정상이다("조금만 주세요" 는 베트남어로 "Cho con(1) một chút thôi ạ.(0)").
   * 한 조각이 어절 여럿을 덮을 수 있고(굳은 인사), 대응이 없으면 `k` 는 빈 배열이다.
   *
   * 동시(study)에는 없다. 서버가 늘 준다고 믿지 말 것.
   */
  translationParts?: Record<string, { t: string; k: number[] }[]>;
};

/** 앱 계약의 언어 enum → 번역표의 키. 한국어는 번역할 것이 없다. */
export const TRANSLATION_KEY: Record<NativeLanguage, string | null> = {
  KOREAN: null,
  VIETNAMESE: 'vi',
  CHINESE: 'zh',
};

export type WordScore = {
  word: string;
  z: number | null;
  warn: boolean;
  worstPhone: string | null;
};

export type PronunciationResult = {
  sentenceId: string;
  sentence: string;
  /**
   * 가장 약하게 발음한 어절. `null` 이면 전부 기준 이상이라는 뜻으로, 퀴즈 없이
   * 바로 칭찬 화면으로 간다. 잘함/못함 판정은 서버가 하고 앱은 이 값만 본다.
   */
  targetWord: string | null;
  targetIndex: number | null;
  targetZ: number | null;
  words: WordScore[];
};

export type ExpressionFeedback = {
  reaction: string;
  comment: string;
  naturalSentence: string;
  naturalHint: string;
  highlightWords: string[];
  translation: string | null;
  translationLanguage: NativeLanguage | null;
};

export type StorySceneCategory = 'school_arrival' | 'class' | 'lunch' | 'school_departure';

export type StorySceneRecord = {
  category: StorySceneCategory;
  partnerLine?: string | null;
  childSaid?: string | null;
  /**
   * 수업시간에 한 일.
   *
   * 이름이 poemText 인 것은 처음에 수업시간이 동시 읽기 하나뿐이었기 때문이다.
   * 지금은 수학(과일 세기)도 있어서 이름만으로는 무엇인지 알 수 없다 —
   * 어느 쪽인지는 아래 classSubject 가 말한다.
   */
  poemText?: string | null;
  /**
   * 수업시간의 과목. 안 보내면 서버가 국어(동시)로 본다.
   *
   * **이걸 안 보내면 동화가 거짓말을 한다.** 서버는 poemText 를
   * "아이가_읽은_동시" 라는 이름으로 LLM 에 넘기고, 대체 문구도 "동시를 또박또박
   * 읽었어요" 다. 과일을 센 아이에게 시를 읽었다고 적게 된다.
   */
  classSubject?: 'KOREAN' | 'MATH' | null;
  practicedWord?: string | null;
};

export type StoryScene = {
  category: StorySceneCategory;
  subtitle: string;
  opening: string;
  quote: string | null;
  narration: string;
};

export type Story = { title: string; scenes: StoryScene[] };

/**
 * 앨범에 남은 동화.
 *
 * 삽화는 담기지 않는다 — 앱 번들의 정적 그림이고 장면의 `category` 하나로 결정된다.
 * 그래서 목록에서도 `categories` 만 있으면 보석 줄을 그릴 수 있다.
 */
export type AlbumSummary = {
  id: number;
  title: string;
  /** 동화를 만든 그때의 이름. 나중에 이름을 바꿔도 옛 표지는 그대로다. */
  nickname: string;
  createdAt: string;
  categories: StorySceneCategory[];
};

export type AlbumDetail = {
  id: number;
  title: string;
  nickname: string;
  createdAt: string;
  scenes: StoryScene[];
};
