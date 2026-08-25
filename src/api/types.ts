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
export type SentenceCategory = 'arrival' | 'study' | 'lunch' | 'departure';

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
  poemText?: string | null;
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
