import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, CHILD_FALLBACK } from '@/api/client';
import { getSentences, pronunciation, type RecordingFile } from '@/api/endpoints';
import { TRANSLATION_KEY, type PronunciationResult, type PronunciationSentence } from '@/api/types';
import {
  BigButton,
  BlankSentence,
  Character,
  ChoiceCard,
  Confetti,
  MicButton,
  PartnerActor,
  ProgressDots,
  SentenceBox,
  SpeechBubble,
  Thinking,
  TopBar,
} from '@/components';
import { GemKept, GemReward } from '@/components/GemReward';
import { Icon } from '@/components/Icon';
import { Stage } from '@/components/Stage';
import {
  announce,
  narrationText,
  prefetch,
  speak,
  stopSpeaking,
  whenNarrationDone,
} from '@/audio/speaker';
import { useRecorder } from '@/audio/useRecorder';
import { DIALOGUE_SCENARIOS } from '@/scenarios/data';
import type { CategoryId } from '@/scenarios/types';
import { useAppState } from '@/store/appState';
import './screens.css';

/** 화면에 한 번에 띄우는 표현 개수. 넷을 넘기면 아이가 고르지 못하고 헤맨다. */
const CHOICE_COUNT = 3;

/** 고른 문장이 아니라 다른 말을 했을 때 되묻는 말. 화면에도 뜨고 소리로도 나간다. */
const RETRY_LINE = '잘 못 들었어. 다시 말해줄래?';

/**
 * 표현 퀴즈에서 아이가 말을 했는지 판정하는 기준.
 *
 * `level` 은 마이크 RMS 에 4를 곱한 값이다(useRecorder). 사람 말소리는 0.2~0.8,
 * 조용한 방은 0.04 아래로 나온다. 0.13 이면 둘 사이가 넉넉히 갈린다.
 *
 * 한 프레임만 넘는 것으로는 안 본다 — 책상을 한 번 툭 치거나 옷깃이 스쳐도
 * 한 프레임은 튄다. 세 프레임(약 50ms)은 이어져야 소리를 낸 것으로 친다.
 *
 * 애매하면 **말한 쪽으로 기울인다.** 주변이 시끄러워서 통과되는 것보다
 * 말했는데 못 들었다고 되묻는 쪽이 아이에게 훨씬 나쁘다.
 */
const QUIZ_VOICE_LEVEL = 0.13;
const QUIZ_VOICE_FRAMES = 3;
/** 퀴즈에서 되묻는 횟수 상한. 그 뒤에는 답을 보여준다 — 여기 가둬둘 수는 없다 */
const QUIZ_RETRY_MAX = 2;

/**
 * 같은 씨앗이면 같은 순서.
 *
 * `Math.random()` 을 렌더 안에서 직접 부르면 다시 그릴 때마다 선택지가 뒤바뀐다 —
 * 아이가 두 번째 것을 누르려다 손이 닿는 순간 다른 문장이 되어 있다.
 * 씨앗을 화면당 한 번만 뽑아 두고, 순서는 그 씨앗에서 결정론적으로 만든다.
 */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed >>> 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 채점이 "다시 말하면 되는 실패" 였나.
 *
 * 422 를 통째로 본다. 코드로만 가르면 안 되는 이유가 있다 — 이 자리에서 422 로
 * 오는 것은 셋인데(문장과 다른 말 `OFF_SCRIPT`, 채점할 어절이 없음, 녹음이 비었음)
 * 아이 입장에서는 **전부 같은 일**이다. "네 말이 닿지 않았으니 다시 해보자".
 * 아이에게 세 갈래로 다른 말을 할 것도 아니면서 코드를 갈라 보면, 서버가 코드를
 * 하나 더 늘리는 날 조용히 칭찬 화면으로 새는 길만 남는다.
 *
 * 400 은 여기 들어오지 않는다 — 포맷·용량은 게이트웨이가 먼저 400 으로 끊는다.
 */
function retryable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 422;
}

/**
 * 등교·급식·하교 — 같은 흐름을 쓰는 세 시나리오.
 *
 *   상황을 본다 → 표현 셋 중 하나를 고른다 → 따라 말한다 → 발음을 되짚는다
 *
 * **갈래가 하나다.** 예전에는 "말해보기"(마이크로 자유롭게 답하고 /stt + 표현 교정을
 * 받는 길)가 함께 있었지만 뺐다. 아이가 무엇을 말해야 할지 모르는 상태에서 마이크부터
 * 들이대면 대부분 아무 말도 못 하고, 그 갈래를 지나야 나오는 화면이 둘 더 있어 흐름도
 * 길었다. 고를 문장을 먼저 보여주는 편이 "무슨 말을 할지" 를 가르치는 데 맞는다.
 * (게이트웨이의 /stt·/feedback 은 그대로 살아 있다 — 화면만 부르지 않는다.)
 *
 * 마이크는 한 번만 나온다. 따라 말하기에서 "어떻게 발음했나"를 오디오로 보는
 * /pronunciation 이고, STT 를 거치지 않는다 — 발음은 텍스트로 알 수 없기 때문이다.
 */

type Step =
  | 'INTRO'
  | 'CHOICE'
  | 'REPEAT'
  | 'PRAISE'
  | 'QUIZ'
  | 'QUIZ_LISTENING'
  | 'ANSWER'
  | 'COMPLETE';

/** 진행 점 4개. 연출용 화면(칭찬·퀴즈)은 따라 말하기와 같은 점을 쓴다. */
/**
 * 스스로 넘어가는 화면이 **말이 끝나기를 기다린다.**
 *
 * 칭찬을 반만 듣고 다음 화면으로 넘어가면 아이는 무슨 말이었는지 모른 채 지나간다.
 * 그렇다고 소리에만 매달면 소리를 꺼두었거나 재생이 막혔을 때 영영 안 넘어가므로,
 * 최소 시간과 상한을 함께 둔다 — 소리가 없으면 최소 시간만, 길어지면 상한에서 넘긴다.
 */
const HOLD_MIN_MS = 1200;
const HOLD_MAX_MS = 8000;

/**
 * "듣고 있어!" 뒤에 **아이가 실제로 말할 시간.**
 *
 * 이 화면은 마이크를 켜지 않는다 — 아이가 빈칸에 들어갈 말을 소리 내어
 * 말해보게 하는 자리다. 물음이 끝나자마자 정답이 떠버리면 입을 뗄 틈이 없고,
 * 아이는 자기가 말할 차례였다는 것조차 모른 채 답을 보게 된다.
 *
 * 만 5~8세가 낱말 하나를 떠올려 말하기까지는 생각보다 오래 걸린다 — 물음을
 * 알아듣고(1초쯤), 떠올리고, 입을 떼는 데까지. 넉넉히 준다.
 */
const SPEAKING_WINDOW_MS = 4500;

/** 읽어주기가 끝날 때까지. 소리가 없으면 최소 시간만, 길어지면 상한에서 놓아준다. */
function holdUntilSpoken(): Promise<void> {
  const after = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  return Promise.race([
    Promise.all([whenNarrationDone(), after(HOLD_MIN_MS)]).then(() => undefined),
    after(HOLD_MAX_MS),
  ]);
}

const DOT: Record<Step, number> = {
  INTRO: 0,
  CHOICE: 1,
  REPEAT: 2,
  PRAISE: 2,
  QUIZ: 2,
  QUIZ_LISTENING: 2,
  ANSWER: 2,
  COMPLETE: 3,
};

type Chosen = { text: string; sentenceId: string | null };

export function DialoguePlay() {
  const { category } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const { completeCategory, isCompleted, profile } = useAppState();

  const scenario = DIALOGUE_SCENARIOS[category as Exclude<CategoryId, 'CLASS'>];

  const [step, setStep] = useState<Step>('INTRO');
  /** 물음을 다 읽어줘서 이제 아이가 말할 차례인가. 남은 시간을 보여주는 데 쓴다. */
  const [myTurn, setMyTurn] = useState(false);
  const [sentences, setSentences] = useState<PronunciationSentence[] | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [score, setScore] = useState<PronunciationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 힌트를 펼쳤나. 아이가 직접 누를 때만 열린다 */
  const [hintOpen, setHintOpen] = useState(false);
  /** 문장과 아주 다른 말을 한 횟수. 0 이면 아직 한 번도 어긋나지 않았다 */
  const [offScript, setOffScript] = useState(0);
  /** 퀴즈에서 아무 말도 안 해서 되물은 횟수 */
  const [quizRetry, setQuizRetry] = useState(0);

  const alive = useRef(true);
  const abort = useRef<AbortController | null>(null);
  /** 방금 실패를 다시 해볼 수 있나. run() 이 삼킨 판정을 부른 쪽에 한 번 넘겨준다 */
  const lastErrorStatus = useRef<number | null>(null);
  /** 퀴즈에서 소리가 기준을 넘은 프레임 수 */
  const quizHeard = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
      stopSpeaking();
    };
  }, []);

  // 문장 목록은 화면에 들어올 때 한 번만 받는다. 카테고리마다 따로 부르지 않는다 —
  // 파라미터가 없는 API 라 10개를 통째로 받아 카테고리로 거른다.
  useEffect(() => {
    const controller = new AbortController();
    getSentences(controller.signal)
      .then((list) => {
        if (alive.current) setSentences(list);
      })
      .catch((error) => {
        // StrictMode 는 이펙트를 두 번 돌린다. 첫 번째의 정리 함수가 요청을 끊는데,
        // 그 취소를 실패로 받으면 곧 성공할 두 번째 요청과 경쟁해 빈 목록이 남는다.
        if (error instanceof ApiError && error.code === 'CANCELLED') return;
        // 목록을 못 받아도 화면을 막지 않는다 — 앱 번들 문구로 대신 보여준다.
        // 다만 그 보기에는 sentenceId 가 없어 채점으로 이어지지 않는다.
        if (alive.current) setSentences([]);
      });
    return () => controller.abort();
  }, []);

  /*
   * 회차마다 다른 선택지를 뽑되, 이 화면에 머무는 동안은 바뀌지 않게 한다.
   * 씨앗을 ref 에 한 번만 담아 두는 이유다 — useMemo 만으로는 React 가 캐시를
   * 버릴 때 순서가 새로 정해진다.
   */
  const shuffleSeed = useRef(Math.floor(Math.random() * 0xffffffff)).current;

  const choices = useMemo(() => {
    if (!scenario) return [];
    /*
     * 서버 목록에서 이 시나리오 것만 걸러 무작위 세 개를 뽑는다.
     * 등교는 9개, 하교는 6개, 급식은 3개다 — 급식은 뽑아도 그대로다.
     * 매번 같은 셋만 나오면 아이는 문장을 읽지 않고 자리를 외운다.
     */
    const pool = (sentences ?? []).filter((s) => s.category === scenario.sentenceCategory);
    if (pool.length > 0) return shuffled(pool, shuffleSeed).slice(0, CHOICE_COUNT);
    // 목록을 못 받은 경우다. id 가 없으므로 채점 단계에서 걸러진다.
    const fallback = scenario.fallbackChoices.map((text, i) => ({
      sentenceId: '',
      category: scenario.sentenceCategory,
      text,
      __fallback: i,
    })) as PronunciationSentence[];
    return shuffled(fallback, shuffleSeed).slice(0, CHOICE_COUNT);
  }, [scenario, sentences, shuffleSeed]);

  /*
   * 퀴즈 문장을 아이의 모국어로.
   *
   * 번역은 추론 서버가 문장 목록에 실어 내려준다 — 누를 때마다 번역을 부르면
   * 전구를 누르고 몇 초를 기다려야 하고, 그 사이 아이는 뜻을 물어본 것을 잊는다.
   * 문장이 열 개로 고정이라 목록에 함께 담아 보내는 편이 맞는다.
   *
   * 한국어를 모국어로 고른 아이에게는 전구를 보여주지 않는다 — 같은 문장을
   * 한 번 더 보여주는 버튼은 눌러봐야 아무 일도 안 일어난 것으로 배운다.
   */
  const hintKey = profile ? TRANSLATION_KEY[profile.nativeLanguage] : null;
  // 조각을 다시 잇는 문자. 중국어는 띄어쓰기가 없어서 붙여 써야 한다.
  const hintJoiner = hintKey === 'zh' ? '' : ' ';
  const hint = useMemo(() => {
    if (!hintKey || !score) return null;
    /*
     * sentenceId 로 찾는다. text 로 맞춰 보면 안 된다 —
     * 서버는 어절 수가 어긋나면 목록의 문장이 아니라 **채점기가 소리 나는 대로
     * 적은 문장**을 돌려준다("같이" → "가치"). 그때 text 비교는 조용히 빗나가서,
     * 아이가 전구를 눌러도 아무 일도 안 일어난다. sentenceId 는 그 경우에도 같다.
     */
    const found = (sentences ?? []).find((item) => item.sentenceId === score.sentenceId);
    const whole = found?.translations?.[hintKey];
    if (!whole) return null;
    return { whole, parts: found?.translationParts?.[hintKey] ?? null };
  }, [hintKey, score, sentences]);

  const run = useCallback(async <T,>(task: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setNotice(null);
    lastErrorStatus.current = null;
    try {
      return await task(controller.signal);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null;
      if (code === 'CANCELLED') return null;
      lastErrorStatus.current = error instanceof ApiError ? error.status : null;
      /*
       * 422 만 빼놓는다. 나머지는 아이가 할 수 있는 일이 없어서 늘 같은 말만
       * 하지만, 422 는 **다시 말하면 되는 일**이라 부른 쪽이 아이 말투로 따로
       * 안내한다. 여기서 뭉뚱그리면 "오류" 문구와 구분이 없어진다.
       */
      if (alive.current && !retryable(error)) setNotice(CHILD_FALLBACK);
      return null;
    } finally {
      if (alive.current && abort.current === controller) setBusy(false);
    }
  }, []);

  // ── 따라 말하기 녹음: /pronunciation ────────────
  const onRepeatRecorded = useCallback(
    async (audio: RecordingFile) => {
      if (!chosen?.sentenceId) {
        // 채점할 기준 문장이 없다(목록을 못 받은 경우). 칭찬하고 넘어간다 —
        // 여기서 막으면 아이는 이유도 모른 채 갇힌다.
        setStep('PRAISE');
        return;
      }
      const result = await run((signal) => pronunciation(audio, chosen.sentenceId as string, signal));
      if (!alive.current) return;
      if (!result) {
        /*
         * 고른 문장이 아니라 아주 다른 말을 했다.
         *
         * 예전에는 채점이 실패한 **모든** 경우를 여기서 칭찬 화면으로 흘려보냈다.
         * 아이를 실패에 가두지 않으려던 것인데, 그 바람에 전혀 다른 말을 해도
         * "잘했어!" 가 떴다 — 서버는 off_script 로 알고 있었고 앱이 그 신호를
         * 버리고 있었다. 아이가 배우는 것이 "아무 말이나 하면 통과한다" 가 된다.
         *
         * 그렇다고 무한히 붙잡아 둘 수도 없다. 세 번까지는 다시 말해보게 하고,
         * 그 뒤에는 넘어갈 길을 열어준다(아래 scene-footer).
         */
        if (lastErrorStatus.current === 422) {
          setOffScript((n) => n + 1);
          return; // REPEAT 에 그대로 머문다
        }
        setStep('PRAISE');
        return;
      }
      setOffScript(0);
      setScore(result);
      // 잘함/못함 판정은 서버가 한다. 앱은 targetWord 가 null 인지만 본다.
      setStep(result.targetWord === null ? 'PRAISE' : 'QUIZ');
    },
    [chosen, run],
  );

  const recorder = useRecorder(onRepeatRecorded);

  /*
   * 아이가 말할 차례 동안 소리가 났는지 센다.
   *
   * 채점하지 않는다 — 퀴즈에서 아이가 말하는 것은 빈칸 한 낱말이라, 문장
   * 전체를 기준으로 채점하면 무엇을 말해도 어긋난다. 여기서 알아야 하는 것은
   * "말을 하긴 했나" 하나뿐이고, 그건 마이크 크기만 보면 되므로 서버를 부를
   * 일도 없다. 아이가 말하자마자 판정이 끝난다.
   */
  useEffect(() => {
    if (step !== 'QUIZ_LISTENING') return;
    if (recorder.level >= QUIZ_VOICE_LEVEL) quizHeard.current += 1;
  }, [recorder.level, step]);

  // 칭찬·듣는 중 화면은 버튼이 없다 — 읽어주기가 끝나면 스스로 넘어간다.
  useEffect(() => {
    if (step !== 'PRAISE' && step !== 'QUIZ_LISTENING') return;
    const listening = step === 'QUIZ_LISTENING';
    // 칭찬은 다 들려주면 끝이지만, "듣고 있어!" 는 그 뒤가 아이 차례다.
    const speakingTime = listening ? SPEAKING_WINDOW_MS : 0;
    let cancelled = false;
    setMyTurn(false);
    quizHeard.current = 0;

    void holdUntilSpoken()
      .then(async () => {
        if (cancelled || !alive.current) return;
        // 물음을 다 읽어준 지금부터가 아이 시간이다. 그때 남은 시간을 보여준다.
        if (!listening) return;
        setMyTurn(true);
        // 낭독이 끝난 뒤에 연다. 열어둔 채 읽어주면 스피커 소리가 그대로 녹음된다.
        await recorder.start();
        await new Promise<void>((resolve) => window.setTimeout(resolve, speakingTime));
        await recorder.stop(); // 파일은 쓰지 않는다. 크기만 보려고 연 것이다
      })
      .then(() => {
        if (cancelled || !alive.current) return;
        if (!listening) {
          setStep('COMPLETE');
          return;
        }
        /*
         * 아무 말도 안 했는데 "잘했어!" 가 뜨고 있었다. 이 단계는 녹음도 채점도
         * 하지 않고 4.5초만 기다렸다가 무조건 정답 화면으로 넘어갔다 —
         * 아이가 배우는 것이 "가만히 있으면 통과한다" 가 된다.
         */
        /*
         * 마이크가 막힌 아이는 판정할 방법이 없다. 그때 되물으면 아이는 시키는
         * 대로 크게 말해도 계속 같은 화면을 보게 된다 — 자기가 무엇을 잘못하는지
         * 알 수 없는 채로. 들을 수 없으면 들은 것으로 친다.
         */
        const spoke = recorder.error !== null || quizHeard.current >= QUIZ_VOICE_FRAMES;
        if (spoke || quizRetry >= QUIZ_RETRY_MAX) {
          setStep('ANSWER');
          return;
        }
        setQuizRetry((n) => n + 1);
        setStep('QUIZ');
      });

    return () => {
      cancelled = true;
    };
  }, [step]);

  /*
    첫 화면에서는 **상황만** 읽어준다.

    상대가 건넨 말은 다음 장(표현 고르기)에서 다시 읽어준다. 여기서까지 읽으면
    같은 말을 두 번 듣게 되므로, 첫 화면은 "지금 무슨 상황인가"만 알려준다.
    말풍선 쪽은 narrate={false} 로 꺼 둔다 — 둘이 같이 읽으면 서로를 끊는다.
  */
  useEffect(() => {
    if (step !== 'INTRO' || !scenario) return;
    void announce(narrationText(`${scenario.intro.situation} ${scenario.intro.prompt}`));
    return () => stopSpeaking();
  }, [step, scenario]);

  /*
   * 되묻는 말을 소리로도 들려준다.
   *
   * 예전에는 말풍선이라 스스로 읽었는데, 띠로 바꾸면서 그 기능이 없어졌다.
   * 글자를 아직 못 읽는 아이가 대부분이라 소리가 없으면 화면이 그냥 멈춘 것으로
   * 보인다 — 무엇이 잘못됐는지도, 다시 말하면 된다는 것도 알 수 없다.
   *
   * 마이크가 열려 있는 동안에는 speaker 쪽이 알아서 참는다(스피커 소리가 녹음에
   * 섞이기 때문이다). 여기까지 왔다는 건 이미 녹음이 끝났다는 뜻이다.
   */
  useEffect(() => {
    if (offScript === 0) return;
    void announce(RETRY_LINE, 'KOREAN', 'TEACHER');
  }, [offScript]);

  // 따라 말하기 화면에 들어오면 음성을 미리 받아둔다.
  // 받아두기만 하고 재생하지 않는다 — 소리는 탭했을 때만 난다.
  useEffect(() => {
    if (step === 'REPEAT' && chosen) prefetch(chosen.text, 'KOREAN');
  }, [step, chosen]);

  // 완료할 때 오늘의 기록을 남긴다. 이게 있어야 동화를 만들 수 있다.
  useEffect(() => {
    if (step !== 'COMPLETE' || !scenario) return;
    completeCategory(scenario.id, {
      category: scenario.storyCategory,
      partnerLine: scenario.partnerLine,
      /*
       * 아이가 실제로 고른 문장만 담는다. 목표 문장으로 대신 채우지 않는다.
       *
       * 세 번을 어긋난 뒤 넘어온 경우도 빼야 한다. 서버가 세 번이나 "그 문장이
       * 아니다" 라고 한 말을, 동화에서는 아이가 한 말로 인쇄하게 된다 —
       * 화면의 거짓 칭찬을 걷어내 놓고 동화에 그대로 남기면 고친 게 아니다.
       * 담지 않으면 동화는 그 장면을 아이 대사 없이 엮는다.
       */
      childSaid: offScript >= 3 ? null : (chosen?.text ?? null),
      practicedWord: score?.targetWord ?? null,
    });
  }, [step, scenario, chosen, score, offScript, completeCategory]);

  if (!scenario) return null;

  /**
   * 표현 고르기 화면은 배경 그림을 깔지 않는다.
   *
   * 흐린 배경 위에 캐릭터·말풍선·보기 셋을 얹으니 볼 것이 너무 많아, 정작 골라야 할
   * 문장이 묻혔다. 이 화면에서 할 일은 하나뿐이라 바탕을 비우고 문장만 남긴다.
   */
  const plainChoice = step === 'CHOICE';

  const background = plainChoice
    ? undefined
    : step === 'COMPLETE'
      ? scenario.scenes.complete
      : step === 'INTRO'
        ? scenario.scenes.intro
        : scenario.scenes.repeat;

  // 완료 화면만 배경을 또렷하게 둔다 — 아이가 해낸 장면을 그린 축하 그림이라
  // 그 자체가 보상이다. 인트로는 앞에 세운 캐릭터가 말하는 것으로 읽히도록 살짝만
  // 흐리고, 나머지는 캐릭터와 카드가 완전히 앞에 서도록 더 흐린다.
  const softBackground: boolean | 'lite' =
    step === 'COMPLETE' ? false : step === 'INTRO' ? 'lite' : true;

  // 어떤 이유로든 녹음이 안 되면 우회로를 연다. 마이크 권한이든 브라우저 지원이든
  // 원인은 아이가 고칠 수 없는 것이고, 여기서 막히면 화면에 갇힌다.
  const micBlocked = recorder.error !== null;

  return (
    <Stage background={background} soft={softBackground} mood="paper">
      <div className="play-head">
        <TopBar
          title={scenario.title}
          onBack={step === 'COMPLETE' ? undefined : () => navigate('/home')}
        />
        <ProgressDots total={4} index={DOT[step]} />
      </div>

      {step === 'PRAISE' || step === 'ANSWER' ? <Confetti /> : null}

      <div className="scene-body">
        {step === 'INTRO' && (
          <>
            <div className="stage-center">
              <div className="spacer" />
              {/*
                인트로에는 **말을 거는 상대 하나만** 가운데 세운다.

                아이(고양이)를 함께 세우지 않는 이유: 급식·하교 배경에는 이미 아이가
                그려져 있어 같은 아이가 두 번 나오고, 둘을 나란히 두면 시선이 갈린다.
                지금 화면에서 중요한 건 "누가 나에게 말을 걸었나" 하나다.

                배경은 살짝 흐려 뒤로 민다(soft='lite'). 그래야 배경 속 인물이 아니라
                앞에 선 이 캐릭터가 말하는 것으로 읽힌다.
              */}
              <div className="talk-group">
                <SpeechBubble
                  tone="partner"
                  speaker={scenario.partner.name}
                  voice={scenario.partner.voice}
                  narrate={false}
                >
                  {scenario.partnerLine}
                </SpeechBubble>
                <div className="actors actors--grounded">
                  <PartnerActor src={scenario.partner.image} height={190} />
                </div>
              </div>
              <div className="card" style={{ width: '100%' }}>
                <p className="title">{scenario.intro.situation}</p>
                <p className="lead" style={{ marginTop: 6 }}>
                  {scenario.intro.prompt}
                </p>
              </div>
            </div>
            <div className="scene-footer">
              <BigButton icon="choose" onClick={() => setStep('CHOICE')}>
                표현 고르기
              </BigButton>
            </div>
          </>
        )}

        {step === 'CHOICE' && (
          <>
            <div className="stage-center">
              <div className="talk-group">
                <SpeechBubble
                  tone="partner"
                  speaker={scenario.partner.name}
                  voice={scenario.partner.voice}
                >
                  {scenario.partnerLine}
                </SpeechBubble>
                <div className="actors actors--grounded">
                  <PartnerActor src={scenario.partner.image} height={132} />
                </div>
              </div>
              <p className="subtitle">어떤 표현을 사용해볼까요?</p>
              <div className="stack">
                {choices.slice(0, 3).map((choice, index) => (
                  <ChoiceCard
                    key={choice.sentenceId || `fallback-${index}`}
                    index={index}
                    text={choice.text}
                    selected={selectedIndex === index}
                    onClick={() => {
                      setSelectedIndex(index);
                      setChosen({ text: choice.text, sentenceId: choice.sentenceId || null });
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="scene-footer">
              <BigButton disabled={chosen === null} onClick={() => setStep('REPEAT')}>
                이걸로 말해볼래요
              </BigButton>
            </div>
          </>
        )}

        {step === 'REPEAT' && chosen && (
          <>
            <div className="stage-center">
              <p className="subtitle on-scene">이제 따라 말해볼까요?</p>
              {offScript > 0 ? (
                /*
                  말풍선이 아니라 가로 띠다. 말풍선으로 두면 캐릭터가 하는 말처럼
                  읽혀서 아이가 말한 사람을 찾게 되는데, 이건 누가 하는 말이 아니라
                  화면이 지금 어떤 상태인지를 알리는 것이다.

                  key 에 횟수를 태워 매번 다시 나타나게 한다 — 두 번째 실패에서
                  아무 변화가 없으면 아이는 자기 말이 닿았는지조차 알 수 없다.
                  소리는 위의 useEffect 가 같은 값을 보고 따로 읽어준다.
                */
                <p key={offScript} className="retry-note">
                  {RETRY_LINE}
                </p>
              ) : null}
              <SentenceBox text={chosen.text} />
              <Character who="me" pose={recorder.isRecording ? 'speak' : 'hello'} height={150} />
              {busy ? (
                <span className="pill-note">
                  잘 들었어요 <Thinking />
                </span>
              ) : (
                <span className="pill-note">문장을 눌러 먼저 들어봐도 좋아요</span>
              )}
              {notice ? <p className="error-note">{notice}</p> : null}
            </div>
            <div className="scene-footer">
              <div style={{ display: 'grid', placeItems: 'center' }}>
                <MicButton
                  recording={recorder.isRecording}
                  level={recorder.level}
                  progress={recorder.progress}
                  disabled={busy}
                  hint={recorder.isRecording ? '다 말했으면 다시 눌러요' : '눌러서 따라 말하기'}
                  onClick={async () => {
                    if (recorder.isRecording) {
                      const audio = await recorder.stop();
                      if (audio) await onRepeatRecorded(audio);
                    } else {
                      await recorder.start();
                    }
                  }}
                />
              </div>
              {offScript >= 3 ? (
                /*
                  세 번을 다시 말해도 닿지 않으면 길을 열어준다. 마이크가 먼
                  자리이거나, 주변이 시끄럽거나, 아이가 오늘은 말하기 싫은 날일
                  수 있다 — 어느 쪽이든 같은 화면에 계속 붙잡아 두는 것보다
                  나쁘지 않다.

                  다만 칭찬 화면으로는 보내지 않는다. 그게 처음의 문제였다.
                */
                <BigButton tone="ghost" onClick={() => setStep('COMPLETE')}>
                  괜찮아, 다음으로
                </BigButton>
              ) : micBlocked ? (
                /*
                  순서가 중요하다. 마이크 오류를 먼저 보면, 세 번 어긋난 아이가
                  마이크까지 막혔을 때 탈출구가 COMPLETE 에서 PRAISE 로 바뀐다 —
                  방금 닫은 거짓 칭찬 길이 그대로 다시 열린다. 어긋난 적이 있으면
                  그쪽이 먼저다.
                */
                <BigButton tone="ghost" onClick={() => setStep('PRAISE')}>
                  마이크 없이 넘어가기
                </BigButton>
              ) : null}
            </div>
          </>
        )}

        {step === 'PRAISE' && (
          <div className="stage-center">
            <SpeechBubble tone="teacher">{'훌륭해!\n너무 멋져'}</SpeechBubble>
            <Character who="me" pose="cheer" height={200} />
            <div className="card">
              <p className="subtitle">정말 자연스럽게 말했어요!</p>
            </div>
          </div>
        )}

        {(step === 'QUIZ' || step === 'QUIZ_LISTENING' || step === 'ANSWER') && score && (
          <>
            <div className="stage-center">
              <p className="subtitle on-scene">오늘의 표현 퀴즈</p>
              {/* 기린도 흉상이다. 말풍선을 바로 위에 붙이고, 기린은 빈칸 카드에
                  살짝 파묻어 단면을 가린다 */}
              <div className="talk-group">
                <SpeechBubble key={`${step}-${quizRetry}`} tone="teacher">
                  {step === 'QUIZ_LISTENING'
                    ? '듣고 있어!'
                    : step === 'ANSWER'
                      ? '잘했어!'
                      : quizRetry > 0
                        ? '소리가 안 들렸어. 다시 말해볼래?'
                        : '문장을 다시 말해볼래?'}
                </SpeechBubble>
                <div className="actors actors--grounded">
                  <PartnerActor
                    src="/scenes/pronunciation/img_pronunciation_giraffe.png"
                    height={148}
                  />
                </div>
              </div>
              <div className="card" style={{ width: '100%' }}>
                <BlankSentence
                  sentence={score.sentence}
                  targetIndex={score.targetIndex ?? 0}
                  answer={step === 'ANSWER' ? (score.targetWord ?? undefined) : undefined}
                />
                {hint ? (
                  <div className="hint">
                    {/*
                      뜻을 늘 띄워두지 않는다. 모국어가 옆에 있으면 아이는 한국어를
                      읽지 않고 그것부터 본다 — 물어봤을 때만 켜져야 한다.
                    */}
                    <button
                      type="button"
                      className="hint__btn"
                      data-on={hintOpen}
                      aria-expanded={hintOpen}
                      onClick={() => setHintOpen((open) => !open)}
                    >
                      <Icon name="bulb" size={20} />
                      {/*
                        소리는 내지 않는다. 이 화면에서 아이가 들어야 하는 소리는
                        한국어 문장뿐이라, 모국어까지 읽어주면 지금 무엇을 따라
                        말해야 하는지가 흐려진다. 뜻은 눈으로만 확인하고 넘어간다.
                        그래서 버튼도 "다시 들어보기" 가 아니라 접었다 펴는 것이다.
                      */}
                      <span>{hintOpen ? '뜻 접기' : '무슨 뜻이야?'}</span>
                    </button>
                    {hintOpen ? (
                      <p className="hint__text">
                        {/*
                          빈칸이 모국어 문장의 **어느 부분인지** 짚어준다.
                          뜻만 통째로 보여주면 "그래서 빈칸이 어느 말이냐" 가 그대로
                          남는다. 어순이 달라서 같은 자리가 아니다 — "조금만 주세요" 의
                          "조금만" 은 베트남어에서 문장 뒤쪽이다.

                          대응표가 없으면(동시 등) 뜻만 보여준다. 짚어줄 자리를
                          모르는 채 아무 데나 밑줄을 그으면 틀린 것을 가르치게 된다.
                        */}
                        {hint.parts && score.targetIndex !== null
                          ? hint.parts.map((part, index) => (
                              <span
                                key={`${part.t}-${index}`}
                                className="hint__part"
                                data-mark={part.k.includes(score.targetIndex as number)}
                              >
                                {part.t}
                                {hintJoiner}
                              </span>
                            ))
                          : hint.whole}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {quizRetry > 0 && step === 'QUIZ' ? (
                // 말풍선이 이미 되묻고 있으므로 여기서는 무엇을 하면 되는지만 짚는다
                <p className="retry-note">마이크에 대고 크게 말해요</p>
              ) : null}
              {step === 'QUIZ_LISTENING' ? (
                /*
                  5초 가까이 점 세 개만 깜빡이면 아이는 화면이 멈춘 줄 안다.
                  줄어드는 막대로 "지금이 네 차례고, 이만큼 남았다"를 보여준다 —
                  글자를 못 읽어도 줄어드는 것은 읽는다.
                */
                <div className="speak-window" data-running={myTurn} aria-hidden>
                  <span style={{ animationDuration: `${SPEAKING_WINDOW_MS}ms` }} />
                </div>
              ) : null}
            </div>
            <div className="scene-footer">
              <div className="row">
                <BigButton
                  tone="ghost"
                  icon="sound"
                  onClick={() => void speak(score.sentence, 'KOREAN', 'TEACHER')}
                >
                  다시 들어보기
                </BigButton>
                {step === 'ANSWER' ? (
                  <BigButton onClick={() => setStep('COMPLETE')}>다음</BigButton>
                ) : (
                  <BigButton
                    disabled={step === 'QUIZ_LISTENING'}
                    icon="mic"
                    onClick={() => setStep('QUIZ_LISTENING')}
                  >
                    말해보기
                  </BigButton>
                )}
              </div>
            </div>
          </>
        )}

        {step === 'COMPLETE' && (
          <>
            {/*
              보석은 흐름 밖이다. 완료 배경 네 장 모두 고양이 머리가 화면 38%
              아래에서 시작하고 그 위는 비어 있다. 예전에는 흰 원판이 흐름 안,
              즉 화면 한복판에 있어서 고양이 얼굴을 덮었다.
            */}
            <GemReward category={scenario.id} />
            {/* 완료에서만 새로 뿌린다. key 가 없으면 ANSWER 에서 넘어올 때
                React 가 같은 요소를 재사용해 출발 시각이 무시된다 */}
            <Confetti key="complete" pieces={16} startMs={120} />

            <div className="stage-center">
              {/* 완료 배경은 아이가 해낸 장면을 그린 축하 그림이다. 그 위에 글자만
                  얹으면 밝은 부분에서 안 읽혀, 카드에 담아 아래쪽에 놓는다 */}
              <div className="spacer" />
              <div className="card gem-reward-card" style={{ width: '100%' }}>
                <p className="title">{scenario.completeTitle}</p>
                <p className="lead" style={{ marginTop: 6 }}>
                  보석을 하나 받았어요! {scenario.completeHint}
                </p>
                {/* 큰 보석은 떠나고 여기 남는다 */}
                <GemKept category={scenario.id} isCompleted={isCompleted} />
              </div>
            </div>
            <div className="scene-footer">
              <BigButton icon="home" onClick={() => navigate('/home')}>
                홈으로 돌아가기
              </BigButton>
            </div>
          </>
        )}
      </div>
    </Stage>
  );
}
