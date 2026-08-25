import { getJson, postForm, postJson } from './client';
import type {
  ExpressionFeedback,
  NativeLanguage,
  PronunciationResult,
  PronunciationSentence,
  Scenario,
  Story,
  StorySceneRecord,
  SttResult,
  TtsResult,
} from './types';

/**
 * 게이트웨이 타임아웃보다 **조금 길게** 잡는다.
 *
 * 앱이 먼저 끊으면 서버는 멀쩡히 답하는 중인데 아이 화면만 실패한다 — 그러면
 * 서버 로그와 아이가 본 것이 어긋나 원인을 찾을 수 없다. 게이트웨이가 판단하고,
 * 앱은 그 판단을 기다린다. (게이트웨이 = 연결 3초 + 읽기 N초)
 */
const T_DEFAULT = 20_000; // 게이트웨이 15초
const T_STT = 50_000; // 게이트웨이 45초
const T_STORY = 65_000; // 게이트웨이 60초

/**
 * 발음 채점만 유독 길다.
 *
 * 채점 서비스는 유휴 뒤 첫 요청이 컨테이너를 깨우며 38초까지 걸린다(실측). 앱이
 * 연습 화면에 들어올 때 서버가 미리 깨워두므로 평소에는 1초 안에 끝나지만, 그 예열이
 * 늦은 날에도 아이가 말한 것이 헛되지 않아야 한다.
 */
const T_PRONUNCIATION = 70_000; // 게이트웨이 65초

export type RecordingFile = { blob: Blob; filename: string };

/** 녹음 파일을 multipart 파트로 만든다. 게이트웨이가 확장자로 컨테이너를 판단한다. */
function audioPart(form: FormData, audio: RecordingFile) {
  form.append('audio', audio.blob, audio.filename);
}

/** POST /ai/stt — 무엇을 말했는지(텍스트)만 본다. 발음은 보지 않는다. */
export function stt(audio: RecordingFile, signal?: AbortSignal): Promise<SttResult> {
  const form = new FormData();
  audioPart(form, audio);
  form.append('language', 'ko-KR'); // BCP-47 자유 문자열이다. enum 이 아니다
  return postForm<SttResult>('/ai/stt', form, { timeoutMs: T_STT, signal });
}

/** POST /ai/tts — 문장을 소리로. 응답은 base64 mp3/wav 다. */
export function tts(
  text: string,
  language: NativeLanguage,
  voice: 'TEACHER' | 'FRIEND',
  signal?: AbortSignal,
): Promise<TtsResult> {
  return postJson<TtsResult>(
    '/ai/tts',
    { text, language, voice, speed: 0.9 },
    { timeoutMs: T_DEFAULT, signal },
  );
}

/** GET /ai/pronunciation/sentences — 연습 문장 10개. 카테고리로 걸러 쓴다. */
export function getSentences(signal?: AbortSignal): Promise<PronunciationSentence[]> {
  return getJson<PronunciationSentence[]>('/ai/pronunciation/sentences', {
    timeoutMs: T_DEFAULT,
    signal,
  });
}

/**
 * POST /ai/pronunciation — 발음 채점.
 *
 * STT 를 거치지 않는다. 발음은 텍스트로 알 수 없어서 녹음을 그대로 보낸다.
 * `sentenceId` 는 위 목록에서 받은 값이며 앱이 만들지 않는다.
 */
export function pronunciation(
  audio: RecordingFile,
  sentenceId: string,
  signal?: AbortSignal,
): Promise<PronunciationResult> {
  const form = new FormData();
  audioPart(form, audio);
  form.append('sentenceId', sentenceId);
  return postForm<PronunciationResult>('/ai/pronunciation', form, {
    timeoutMs: T_PRONUNCIATION,
    signal,
  });
}

/** POST /ai/feedback — 표현 교정 + 모국어 번역(한 번에 온다). */
export function expressionFeedback(
  params: {
    targetSentence: string;
    recognizedText: string | null;
    scenario: Scenario;
    nativeLanguage: NativeLanguage;
    nickname: string;
  },
  signal?: AbortSignal,
): Promise<ExpressionFeedback> {
  return postJson<ExpressionFeedback>('/ai/feedback', params, {
    timeoutMs: T_DEFAULT,
    signal,
  });
}

/**
 * POST /ai/story — 하루치 4장면으로 동화 만들기.
 *
 * 다른 호출과 달리 "방금 한 행동"이 아니라 "오늘 한 일 전부"를 보낸다. 서버는
 * 아무것도 저장하지 않으므로 기록을 모아두는 것은 앱 몫이다.
 */
export function story(
  childName: string,
  scenes: StorySceneRecord[],
  signal?: AbortSignal,
): Promise<Story> {
  return postJson<Story>('/ai/story', { childName, scenes }, { timeoutMs: T_STORY, signal });
}
