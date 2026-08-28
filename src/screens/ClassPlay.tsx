import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { getSentences, pronunciation, stt, type RecordingFile } from '@/api/endpoints';
import { TRANSLATION_KEY, type PronunciationResult, type PronunciationSentence } from '@/api/types';
import {
  BigButton,
  BlankSentence,
  Character,
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
import { announce, speak, speakLines, stopSpeaking, whenNarrationDone } from '@/audio/speaker';
import { useRecorder } from '@/audio/useRecorder';
import { CLASS, randomFruitCount, randomPage, randomPoem, randomSubject } from '@/scenarios/data';
import { countLabel, countSentence, heardCount, MAX_COUNT } from '@/scenarios/counting';
import { FruitCount } from '@/components/FruitCount';
import { useAppState } from '@/store/appState';
import './screens.css';

/**
 * 수업시간 — 책을 펴고 국어면 동시를 읽고, 수학이면 과일을 센다.
 *
 * 다른 시나리오와 달리 **고를 것이 없다.** 문장 목록의 study 항목이 하나뿐이라
 * "표현 고르기" 화면 자체가 없고, 시 전체가 한 문장으로 채점된다.
 * 그 밖에는 따라 말하기와 완전히 같은 호출을 쓴다 — 별도 낭독 API 가 필요 없다.
 */

type Step =
  | 'INTRO'
  | 'FIND_PAGE'
  | 'FIND_PAGE_DONE'
  // 국어 — 동시를 읽는다
  | 'POEM'
  | 'POEM_FEEDBACK'
  // 수학 — 과일을 센다
  | 'COUNT'
  | 'COUNT_READ'
  | 'COUNT_PRAISE'
  | 'COUNT_QUIZ'
  | 'COUNT_QUIZ_LISTENING'
  | 'COUNT_ANSWER'
  | 'COUNT_FEEDBACK'
  | 'COMPLETE';

/** 진행 점 4개 — 다른 시나리오와 같은 눈금을 쓴다 */
const DOT: Record<Step, number> = {
  INTRO: 0,
  FIND_PAGE: 1,
  FIND_PAGE_DONE: 1,
  POEM: 2,
  POEM_FEEDBACK: 2,
  COUNT: 2,
  COUNT_READ: 2,
  COUNT_PRAISE: 2,
  COUNT_QUIZ: 2,
  COUNT_QUIZ_LISTENING: 2,
  COUNT_ANSWER: 2,
  COUNT_FEEDBACK: 2,
  COMPLETE: 3,
};

/** 목표 쪽에서 이만큼 떨어진 곳에서 시작한다 — 두 번은 넘겨야 닿는다 */
const START_OFFSET = 2;
/** 넘길 수 있는 범위. 너무 멀리 가면 아이가 길을 잃는다 */
const RANGE = 4;
/** 이만큼 밀어야 한 장이 넘어간다 */
const SWIPE_THRESHOLD = 44;

/** 시가 아니라 다른 말을 읽었을 때 되묻는 말. 화면에도 뜨고 소리로도 나간다. */
const RETRY_LINE = '잘 못 들었어. 다시 읽어줄래?';

/** 수학에서 문장과 다른 말을 했을 때. 여기는 "말하기" 자리라 낱말이 다르다. */
const READ_RETRY_LINE = '잘 못 들었어. 다시 말해줄래?';

/*
 * 빈칸 퀴즈의 값들. 표현 퀴즈(DialoguePlay)와 **같아야 한다** — 같은 모양의
 * 화면인데 기다리는 시간이나 되묻는 횟수가 다르면 아이는 다른 규칙을 배운다.
 */
/** 이만큼은 소리가 커야 "말했다" 로 본다. 조용한 방은 0.04 아래로 나온다 */
const QUIZ_VOICE_LEVEL = 0.13;
/** 그 크기가 몇 번 연달아 잡혀야 하는가. 기침 한 번에 통과하지 않게 */
const QUIZ_VOICE_FRAMES = 3;
/** 안 들렸을 때 되묻는 횟수 */
const QUIZ_RETRY_MAX = 2;
/** 아이 차례로 열어 두는 시간 */
const SPEAKING_WINDOW_MS = 4500;

/**
 * 한 장이 넘어가는 데 걸리는 시간.
 *
 * **CSS 키프레임과 이 타이머는 반드시 같은 값이어야 한다.** 예전에 여기가
 * 300ms 인데 키프레임이 900ms 였던 적이 있다. 그러면 종이가 애니메이션의 앞
 * 3분의 1(각도로 30도쯤)만 재생되고 지워져서, 넘어가는 것이 아니라 반투명한
 * 무언가가 스쳐 지나가는 것처럼 보인다. 그래서 이 값을 `--flip-ms` 로
 * 내려보내 CSS 가 같은 것을 읽게 했다 — 한쪽만 고쳐도 어긋나지 않는다.
 *
 * 700ms 는 실제 책장 라이브러리(turn.js 600 · DearFlip 800 · StPageFlip 1000)
 * 한가운데다.
 */
const FLIP_MS = 700;
/** 모션을 줄여 달라고 한 기기에서는 회전을 건너뛴다 — 기다리게 두지 않는다 */
const REDUCED_FLIP_MS = 160;

function flipDuration(): number {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? REDUCED_FLIP_MS
    : FLIP_MS;
}

type Flip = 'next' | 'prev' | null;

export function ClassPlay() {
  const navigate = useNavigate();
  const { completeCategory, isCompleted, profile } = useAppState();

  const [step, setStep] = useState<Step>('INTRO');
  // 회차마다 다른 쪽 번호를 한 번만 뽑아 끝까지 같은 값을 쓴다.
  const target = useMemo(() => randomPage(), []);
  // 오늘 읽을 시도 한 번만 뽑는다. 매 렌더마다 뽑으면 글자를 읽는 도중에 시가 바뀐다.
  const poem = useMemo(() => randomPoem(), []);
  /*
   * 오늘의 과목. 국어와 수학이 반반이다.
   *
   * 책을 찾는 데까지는 두 과목이 완전히 같아서, 이 값은 배경·책 그림·선생님
   * 말만 갈아 끼운다. 갈리는 것은 책을 편 다음부터다.
   */
  const subject = useMemo(() => randomSubject(), []);
  /** 수학 시간에 셀 것. 한 종류를 1~5개 */
  const quiz = useMemo(() => randomFruitCount(), []);
  /**
   * 골라 봤다가 틀린 보기들.
   *
   * 지우지 않고 남긴다 — 아이가 무엇을 이미 눌러 봤는지 보여야 같은 것을 또
   * 누르지 않는다. 다섯 중에 고르는 일이라 기억에만 맡기면 헛수고를 반복한다.
   */
  const [wrongPicks, setWrongPicks] = useState<number[]>([]);
  /** 읽은 문장의 발음 채점 결과. null 이면 채점이 아예 안 됐다 */
  const [readScore, setReadScore] = useState<PronunciationResult | null>(null);
  /** 문장과 다른 말을 읽어 되물은 횟수 */
  const [misread, setMisread] = useState(0);
  /** 채점이 아예 안 됐나(서버가 죽었거나 시간이 넘었다). 못 들은 것과는 다른 일이다 */
  const [readFailed, setReadFailed] = useState(false);
  /**
   * 방금 맞게 골랐나 — 색종이를 터뜨릴지 정한다.
   *
   * "다시 읽기" 로 이 화면에 되돌아온 경우에는 터뜨리지 않는다. 이룬 것이 없는데
   * 축하하면 색종이가 무슨 뜻인지 흐려진다.
   */
  const [justPicked, setJustPicked] = useState(false);
  /** 빈칸 퀴즈에서 안 들려 되물은 횟수 */
  const [quizRetry, setQuizRetry] = useState(0);
  /** 지금이 아이 차례인가 — 줄어드는 막대를 켠다 */
  const [myTurn, setMyTurn] = useState(false);
  /** 뜻(전구)을 펼쳤나 */
  const [hintOpen, setHintOpen] = useState(false);
  /** 목록에서 받아 둔 이 문장 항목. 뜻을 띄울 때 쓴다 */
  const [sentenceItem, setSentenceItem] = useState<PronunciationSentence | null>(null);
  /**
   * 아이 목소리가 이만큼 컸던 프레임 수.
   *
   * **화면에 그리지 않으므로 state 가 아니라 ref 다.** state 로 두면 프레임마다
   * 화면을 다시 그리게 되고, 그 사이 값이 뒤처져 판정이 어긋난다.
   */
  const quizHeard = useRef(0);

  /**
   * 지금 단계. 응답이 늦게 온 뒤에도 화면을 되돌리지 않으려고 들고 있다.
   *
   * 채점은 왕복이 길다. 그 사이 아이가 "괜찮아, 다음으로" 를 눌러 완료 화면에
   * 가 있는데 응답이 도착하면, 예전에는 그대로 setStep 을 불러 **보석 화면을
   * 걷어내고 읽기 화면으로 도로 끌어냈다.** alive 만 봐서는 못 막는다 —
   * 화면은 살아 있고 단계만 앞으로 간 경우이기 때문이다.
   */
  const stepRef = useRef<Step>('INTRO');

  /** 아이가 맞힌 문장의 채점 id. 개수 1~5 가 곧 자리 0~4 다 */
  const answerSentenceId = quiz.fruit.sentenceIds[quiz.count - 1];

  /**
   * 이 서버가 수학 문장을 채점할 수 있나.
   *
   * **묻지 않고 부르면 안 된다.** 문장 목록은 서버가 단일 소스로 쥐고 있어서,
   * 아직 math_* 를 모르는 서버에 보내면 422 INVALID_PARAMETER 가 돌아온다.
   * 그건 아이가 아무리 잘 읽어도 통과할 수 없는 상태라, 그대로 두면 못 나가는
   * 화면이 된다. 그래서 화면에 들어올 때 목록을 받아 **실제로 있는지 확인**하고,
   * 없으면 예전 길(STT 로 받아쓴 글자에서 수를 뽑는 것)로 물러선다.
   *
   * null 은 "아직 모른다" 다. 확인이 끝나기 전에는 마이크를 잠가 둔다 —
   * 여기서 짐작으로 고르면 둘 중 한 길은 반드시 헛돈다.
   */
  const [scorable, setScorable] = useState<boolean | null>(null);

  /** 맞힌 문장. 보기이자, 그 뒤에 따라 읽을 말이다 */
  const answerSentence = countSentence(quiz.fruit.name, quiz.count);

  /** 지금 아이에게 하는 말. 화면의 띠와 소리가 **같은 곳**에서 나온다 */
  /*
   * 읽고 난 뒤에 하는 말.
   *
   * **채점이 안 된 것과 잘 읽은 것은 다른 일이다.** 둘을 한 갈래로 묶으면
   * 서버가 죽은 날에도 "또박또박 읽었어요" 가 나간다 — 아이가 어떻게 읽었는지
   * 아무도 모르는데. 동시 낭독에서 고친 것과 같은 종류의 거짓 칭찬이라 여기도
   * 갈라 둔다.
   */
  /*
   * 퀴즈 문장을 아이의 모국어로. 목록에 실려 온 값을 그대로 쓴다 —
   * 누를 때마다 번역을 부르면 전구를 누르고 몇 초를 기다려야 한다.
   *
   * 수학 문장에는 조각 대응표가 없다(빈칸 퀴즈를 염두에 두고 만든 표가 아니다).
   * 그때는 뜻만 통째로 보여준다 — 짚어줄 자리를 모르는 채 아무 데나 밑줄을
   * 그으면 틀린 것을 가르치게 된다.
   */
  const hintKey = profile ? TRANSLATION_KEY[profile.nativeLanguage] : null;
  const hintText = hintKey ? (sentenceItem?.translations?.[hintKey] ?? null) : null;
  /**
   * 번역문을 어절별 조각으로 쪼갠 것.
   *
   * 이게 있어야 **빈칸이 모국어의 어느 말인지 짚어준다.** 뜻만 통째로 보여주면
   * "그래서 빈칸이 어느 말이냐" 가 그대로 남는다 — 한국어를 못 읽는 아이에게는
   * 전구가 사실상 먹통인 버튼이 된다.
   *
   * 어순이 달라서 같은 자리가 아니다. "사과가(0) 두(1) 개(2) 있어요(3)" 는
   * 베트남어로 "Có(3) hai(1) quả(2) táo.(0)" 다 — 뒤집힌다.
   */
  const hintParts = hintKey ? (sentenceItem?.translationParts?.[hintKey] ?? null) : null;
  /** 조각을 다시 잇는 문자. 중국어는 띄어쓰기가 없어 붙여 쓴다 */
  const hintJoiner = hintKey === 'zh' ? '' : ' ';

  /** 짚어주는 화면에서 하는 말. 잘 읽은 경우는 여기 오지 않는다 — 칭찬 화면이 맡는다 */
  const readLine = readScore?.targetWord
    ? `"${readScore.targetWord}" 부분을\n조금 더 천천히 읽어볼까요?`
    : readFailed
      ? // 채점이 아예 안 됐다. 아이가 어떻게 읽었는지 아무도 모르므로 칭찬하지 않는다.
        '선생님이 잘 못 들었어.\n그래도 끝까지 읽었구나!'
      : // 들리기는 했는데 문장과 달랐다. 못 들었다고 하면 그것도 사실이 아니다.
        '잘 들었어요.\n한 번 더 또박또박 읽어볼까요?';

  /*
   * 칭찬 화면의 아래 한 줄.
   *
   * 채점을 받았을 때만 "자연스럽게 말했다" 고 할 수 있다. 서버가 이 문장을 아직
   * 몰라 STT 로만 들은 경우에는 **발음을 본 적이 없으므로** 그 말을 하면 안 된다 —
   * 무엇을 말했는지만 알 뿐이다.
   */
  const praiseLine = readScore ? '정말 자연스럽게 말했어요!' : '끝까지 또렷하게 말했어요!';

  const questionLine =
    wrongPicks.length > 0 ? '다시 한번 세어 볼까요?' : '그림에 있는 과일의 개수는 몇 개인가요?';
  // 앞뒤 어느 쪽으로도 가야 하도록, 시작 위치를 목표의 앞이나 뒤에 둔다.
  const [page, setPage] = useState(() => target + (Math.random() < 0.5 ? -1 : 1) * START_OFFSET);
  const [flip, setFlip] = useState<Flip>(null);
  const [drag, setDrag] = useState(0);
  const [readingLine, setReadingLine] = useState(-1);
  const [score, setScore] = useState<PronunciationResult | null>(null);
  const [busy, setBusy] = useState(false);
  /** 시가 아니라 아주 다른 말을 읽은 횟수 */
  const [offScript, setOffScript] = useState(0);

  const alive = useRef(true);
  /** 지금 펼쳐진 쪽. 타이머가 낡은 값을 보지 않도록 따로 들고 있는다 */
  const pageRef = useRef(page);
  const abort = useRef<AbortController | null>(null);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
      stopSpeaking();
    };
  }, []);

  /*
   * 들어오자마자 채점 서비스를 깨운다.
   *
   * 이 화면은 문장 목록을 받아갈 일이 없다 — 동시가 앱에 들어 있다. 그래서
   * 목록 요청에 붙어 있던 예열이 여기서만 통째로 빠져 있었고, 낭독 채점은
   * 늘 콜드 스타트를 그대로 맞았다. 아이는 책을 찾고 시를 읽느라 그 사이
   * 한참을 쓰므로, 마이크를 누를 때쯤이면 이미 깨어 있다.
   *
   * 시를 펴는 순간 한 번 더 두드린다 — 책 찾기가 길어져 다시 식었을 수 있다.
   * 서버가 90초 안에 온 노크는 무시하므로 헛되이 겹치지 않는다.
   */
  /*
   * 화면에 들어올 때 **딱 한 번** 부른다. 두 가지를 같이 한다.
   *
   * 1) **예열.** 서버는 이 목록을 내주면서 채점 컨테이너를 깨운다. 예전에
   *    수업시간만 목록을 부를 일이 없어서 예열이 한 번도 안 걸렸고, 낭독 채점이
   *    늘 콜드 스타트(38~68초 실측)를 그대로 맞았다.
   * 2) **이 서버가 수학 문장을 아는지 확인.** 목록이 곧 답이라 따로 물어볼
   *    필요가 없다. 422 를 받아 보고 짐작하는 것보다 확실하다 —
   *    422 는 "문장을 모른다" 와 "채점할 말소리가 없다" 가 같은 코드로 온다.
   *
   * **단계(step)를 의존성에 넣지 않는다.** 넣었다가 아이 화면이 통째로 멈췄다:
   * 단계가 바뀌면 정리 함수가 먼저 돌아 응답을 버리는데, 그때 아직 답이 안 왔으면
   * scorable 이 null 로 굳는다. 그 상태에서는 마이크가 잠긴 채 "선생님을 부르는
   * 중이에요" 만 떠 있고 다시 물어볼 기회도 없다. 확인은 화면당 한 번이면 된다.
   */
  useEffect(() => {
    getSentences().then(
      (list) => {
        // 응답을 받는 것 자체가 예열이다. 국어는 결과를 쓸 일이 없다.
        if (alive.current && subject.id === 'MATH') {
          const found = list.find((item) => item.sentenceId === answerSentenceId) ?? null;
          setSentenceItem(found);
          setScorable(found !== null);
        }
      },
      () => {
        // 모르면 옛 길로 간다 — 아는 길이 하나라도 열려 있어야 아이가 갇히지 않는다.
        if (alive.current && subject.id === 'MATH') setScorable(false);
      },
    );
  }, [subject.id, answerSentenceId]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  /*
   * 수학 문제를 소리로도 들려준다.
   *
   * 말풍선이었을 때는 스스로 읽었지만 띠로 바꾸면서 그 기능이 없어졌다.
   * 글자를 아직 못 읽는 아이가 대부분이라, 소리가 없으면 무엇을 하라는
   * 화면인지 알 수가 없다.
   */
  useEffect(() => {
    if (step !== 'COUNT') return;
    void announce(questionLine, 'KOREAN', 'TEACHER');
    /*
     * 문구가 같아도 다시 말해야 하는 자리가 있다 — 두 번째로 틀리게 골랐을 때다.
     * 그때 "다시 한번 세어 볼까요?" 는 그대로라 문구만 보면 아무 일도 안 일어나고,
     * 아이 눈에는 눌러도 반응이 없는 화면이 된다. 그래서 고른 횟수도 같이 본다.
     */
  }, [step, questionLine, wrongPicks.length]);

  /*
   * 되묻는 말을 소리로도 들려준다.
   *
   * 말풍선일 때는 스스로 읽었지만 띠에는 그 기능이 없다. 글자를 아직 못 읽는
   * 아이에게 소리까지 없으면 화면이 그냥 멈춘 것으로 보인다.
   */
  useEffect(() => {
    if (offScript === 0) return;
    void announce(RETRY_LINE, 'KOREAN', 'TEACHER');
  }, [offScript]);

  /*
   * 칭찬 화면은 버튼이 없다. 말풍선을 다 읽어주면 스스로 넘어간다 —
   * 등교하기의 칭찬 화면과 같은 처리다. 아이가 해낸 직후에 "다음" 을 누르게
   * 하면 칭찬이 끊기고, 글자를 못 읽는 아이는 무엇을 누르라는 건지도 모른다.
   *
   * 낭독이 안 끝나도 8초면 넘어간다. 소리가 꺼진 기기에서는 끝나는 신호가
   * 영영 안 와서, 그것만 기다리면 화면이 멈춘다.
   */
  useEffect(() => {
    if (step !== 'COUNT_PRAISE') return;
    let cancelled = false;
    const after = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
    void Promise.race([
      Promise.all([whenNarrationDone(), after(1200)]).then(() => undefined),
      after(8000),
    ]).then(() => {
      if (!cancelled && alive.current) setStep('COMPLETE');
    });
    return () => {
      cancelled = true;
    };
  }, [step]);

  /*
   * 되묻는 말을 소리로도 들려준다.
   *
   * 국어(offScript)에는 이 이펙트가 있는데 수학(misread)만 없었다. 그래서 띠는
   * 다시 나타나는데 아무 소리도 안 났다 — 한글을 아직 못 읽는 아이에게는 눌러도
   * 반응이 없는 화면이다. 정작 이 앱을 쓰는 아이 대부분이 그렇다.
   */
  useEffect(() => {
    if (misread === 0) return;
    void announce(READ_RETRY_LINE, 'KOREAN', 'TEACHER');
  }, [misread]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const poemText = poem.lines.join(' ');

  // ── 책 넘기기 ───────────────────────────────────

  /**
   * 한 장 넘긴다.
   *
   * 앞뒤 양쪽으로 간다. 한 방향으로만 넘어가면 지나친 쪽으로 되돌아갈 수 없어
   * "찾는다"는 행동 자체가 성립하지 않는다.
   */
  const turn = useCallback(
    (direction: 1 | -1) => {
      if (flip) return; // 넘어가는 중에는 겹쳐 넘기지 않는다
      const next = page + direction;
      if (next < target - RANGE || next > target + RANGE) return;
      setFlip(direction > 0 ? 'next' : 'prev');
      window.setTimeout(() => {
        if (!alive.current) return;
        setPage(next);
        setFlip(null);
        // 찾았으면 잠깐 보여주고 넘어간다 — 바로 화면이 바뀌면 찾은 줄 모른다
        if (next === target) {
          window.setTimeout(() => {
            // 그 잠깐 사이에 아이가 한 번 더 밀었을 수 있다. 그때는 이미 목표
            // 쪽이 아니므로 축하하지 않는다 — 다른 쪽을 펴 놓고 "잘 찾았어요!" 가
            // 뜨면 아이는 자기가 무엇을 해서 맞았는지를 반대로 배운다.
            if (alive.current && pageRef.current === target) setStep('FIND_PAGE_DONE');
          }, 640);
        }
      }, flipDuration());
    },
    [flip, page, target],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    dragStart.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (dragStart.current === null) return;
    // 손끝을 따라 책이 조금 기운다. 밀 수 있다는 걸 알려주는 신호다.
    setDrag(Math.max(-90, Math.min(90, event.clientX - dragStart.current)));
  };

  const onPointerUp = () => {
    const dx = drag;
    dragStart.current = null;
    setDrag(0);
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    // 왼쪽으로 밀면 다음 쪽 — 종이책과 같은 방향이다
    turn(dx < 0 ? 1 : -1);
  };

  // ── 낭독 채점 ───────────────────────────────────

  const onRecorded = useCallback(async (audio: RecordingFile) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    try {
      const result = await pronunciation(audio, poem.sentenceId, controller.signal);
      if (!alive.current) return;
      setOffScript(0);
      setScore(result);
      setStep('POEM_FEEDBACK');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CANCELLED') return;
      if (!alive.current) return;
      /*
       * 시가 아니라 아주 다른 말을 읽었거나, 채점할 만한 말소리가 없었다.
       *
       * 아래 길로 흘려보내면 짚어줄 낱말이 없어 "아주 또박또박 잘 읽었어요!" 가
       * 뜬다 — 시를 읽지도 않은 아이에게. 따라 말하기에 있던 것과 같은 결함이라
       * 같이 고친다. 서버는 422 로 구분해서 알려주고 있었고 앱이 버리고 있었다
       * (2026-08-27 실측: 다른 말을 넣으면 422 "읽은 음성이 고른 문장과 다릅니다").
       *
       * 422 를 통째로 보는 이유는 DialoguePlay 의 retryable() 주석과 같다 —
       * 아이 입장에서는 전부 "네 말이 닿지 않았으니 다시 해보자" 하나다.
       */
      if (error instanceof ApiError && error.status === 422) {
        setOffScript((n) => n + 1);
        return; // POEM 에 그대로 머문다
      }
      /*
       * 여기서 notice 를 세우지 않는다 — 그릴 자리가 없다. notice 는 POEM 단계에만
       * 렌더되는데 바로 다음 줄에서 POEM_FEEDBACK 으로 넘어가므로 아무도 못 본다.
       * 대신 그 화면의 feedbackLine 이 "선생님이 잘 못 들었어" 로 정직하게 말한다 —
       * 화면에도 뜨고 소리로도 나간다.
       */
      // 그 밖의 실패는 아이가 할 수 있는 일이 없다. 붙잡아 두지 않고 넘어간다.
      setScore(null);
      setStep('POEM_FEEDBACK');
    } finally {
      if (alive.current && abort.current === controller) setBusy(false);
    }
  }, []);

  /*
   * 맞힌 문장을 소리 내어 읽는 자리.
   *
   * **채점이 아니라 인식이다.** 국어는 "이 문장을 얼마나 잘 읽었나" 라
   * /pronunciation 으로 채점하지만, 여기 문장("사과가 한 개 있어요")은 서버의
   * 채점 문장 목록에 있을 리가 없어 채점 자체가 불가능하다. /stt 로 글자를 받는다.
   *
   * **읽기로 다시 떨어뜨리지 않는다.** 개수는 이미 골라서 맞혔다. 여기서 또
   * 가르면 맞힌 아이가 두 번째 관문에서 틀린 아이가 된다 — 표현 퀴즈와 같은
   * 규칙으로, 말했으면 넘어간다. 다만 개수가 또렷하게 들렸으면 그 말을 얹어
   * 칭찬한다. 아이가 읽은 것을 **들었다는 표시**다.
   */
  const onReadAloud = useCallback(
    async (audio: RecordingFile) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setBusy(true);
      setReadFailed(false);
      try {
        if (scorable) {
          /*
           * 진짜 발음 채점이다. STT 를 거치지 않는다 — 발음은 글자로 알 수 없어서
           * 녹음을 그대로 보낸다. 아이가 고른 그 문장이 서버 목록에 있으므로
           * 국어 시간의 동시 낭독과 **같은 채점**을 받는다.
           */
          const result = await pronunciation(audio, answerSentenceId, controller.signal);
          if (!alive.current || stepRef.current !== 'COUNT_READ') return;
          setReadScore(result);
          // 잘함/못함 판정은 서버가 한다. 앱은 targetWord 가 null 인지만 본다 —
          // 등교하기의 따라 말하기와 같은 갈림길이다.
          setStep(result.targetWord === null ? 'COUNT_PRAISE' : 'COUNT_QUIZ');
        } else {
          // 서버가 아직 이 문장을 모른다. 무엇을 말했는지까지만 본다.
          const result = await stt(audio, controller.signal);
          if (!alive.current || stepRef.current !== 'COUNT_READ') return;
          /*
           * **아무 소리도 못 알아들은 것과 다른 말을 한 것은 다른 일이다.**
           *
           * 둘을 묶어 두었더니 마이크를 누르고 가만히 있어도 "그래도 끝까지
           * 읽었구나!" 가 화면에 뜨고 소리로도 나갔다 — 아이는 한 마디도 하지
           * 않았는데. 채점 경로에서는 422 로 걸러지는 자리가 이쪽에만 뚫려
           * 있었다. 아무것도 안 들렸으면 그때와 똑같이 다시 읽게 한다.
           */
          const said = (result.text ?? '').trim();
          if (!said) {
            setMisread((n) => n + 1);
            return; // COUNT_READ 에 그대로 머문다
          }
          setStep(heardCount(said) === quiz.count ? 'COUNT_PRAISE' : 'COUNT_FEEDBACK');
        }
      } catch (error) {
        if (error instanceof ApiError && error.code === 'CANCELLED') return;
        if (!alive.current || stepRef.current !== 'COUNT_READ') return;
        /*
         * 422 는 "네 말이 문장에 닿지 않았다" 다 — 아주 다른 말을 했거나,
         * 채점할 만한 말소리가 아예 없었거나.
         *
         * **여기가 예전에 뚫려 있던 구멍이다.** 옛 방식(STT + 숫자 뽑기)은
         * 마이크를 누르고 가만히 있어도 "끝까지 읽었어요" 로 통과시켰다.
         * 채점은 그걸 구분해서 알려주고 있었고, 이제 그 신호를 쓴다 —
         * 그냥 넘기지 않고 다시 읽게 한다.
         *
         * 코드를 갈라 보지 않고 422 를 통째로 보는 이유는 동시 낭독과 같다.
         * 아이 입장에서는 전부 "다시 해보자" 하나다. 문장을 모르는 경우는
         * 여기 오지 않는다 — 위에서 목록으로 미리 걸렀다.
         */
        if (error instanceof ApiError && error.status === 422) {
          setMisread((n) => n + 1);
          return; // COUNT_READ 에 그대로 머문다
        }
        // 서버가 안 되는 것은 아이 잘못이 아니다. 읽은 것은 읽은 것이다.
        setReadScore(null);
        setReadFailed(true);
        setStep('COUNT_FEEDBACK');
      } finally {
        if (alive.current && abort.current === controller) setBusy(false);
      }
    },
    [quiz.count, answerSentenceId, scorable],
  );

  const recorder = useRecorder(subject.id === 'MATH' ? onReadAloud : onRecorded);

  /**
   * 읽기 화면을 떠난다. 진행 중인 것을 **실제로 끊고** 나간다.
   *
   * 예전에는 setStep 만 했다. 그러면 채점 요청과 녹음이 그대로 살아 있어서,
   * 완료 화면에 가 있는 아이에게 수십 초 뒤 응답이 도착해 읽기 화면으로 도로
   * 끌어냈다. 녹음 쪽은 서버 타이밍과 무관하게 더 확실히 터진다 — 30초 제한에
   * 걸리면 녹음기가 스스로 채점을 부른다.
   */
  const leaveReading = useCallback(() => {
    abort.current?.abort();
    void recorder.stop();
    stopSpeaking();
    setStep('COMPLETE');
  }, [recorder]);

  /*
   * 아이가 실제로 소리를 냈는지 센다.
   *
   * 예전 표현 퀴즈는 녹음도 채점도 하지 않고 4.5초만 기다렸다가 무조건 정답
   * 화면으로 넘어갔다 — 아이가 배우는 것이 "가만히 있으면 통과한다" 가 됐다.
   * 여기도 같은 화면이므로 같은 장치를 둔다.
   */
  useEffect(() => {
    if (step !== 'COUNT_QUIZ_LISTENING') return;
    if (recorder.level >= QUIZ_VOICE_LEVEL) quizHeard.current += 1;
  }, [recorder.level, step]);

  /*
   * 칭찬·듣는 중 화면은 버튼이 없다 — 읽어주기가 끝나면 스스로 넘어간다.
   *
   * 낭독이 안 끝나도 8초면 넘어간다. 소리가 꺼진 기기에서는 끝나는 신호가 영영
   * 안 와서, 그것만 기다리면 화면이 멈춘다.
   */
  useEffect(() => {
    if (step !== 'COUNT_PRAISE' && step !== 'COUNT_QUIZ_LISTENING') return;
    const listening = step === 'COUNT_QUIZ_LISTENING';
    let cancelled = false;
    const after = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
    setMyTurn(false);
    quizHeard.current = 0;

    void Promise.race([
      Promise.all([whenNarrationDone(), after(1200)]).then(() => undefined),
      after(8000),
    ])
      .then(async () => {
        if (cancelled || !alive.current) return;
        if (!listening) return;
        // 물음을 다 읽어준 지금부터가 아이 시간이다.
        setMyTurn(true);
        // 낭독이 끝난 뒤에 연다. 열어둔 채 읽어주면 스피커 소리가 그대로 녹음된다.
        await recorder.start();
        await after(SPEAKING_WINDOW_MS);
        await recorder.stop(); // 파일은 쓰지 않는다. 크기만 보려고 연 것이다
      })
      .then(() => {
        if (cancelled || !alive.current) return;
        if (!listening) {
          setStep('COMPLETE');
          return;
        }
        /*
         * 마이크가 막힌 아이는 판정할 방법이 없다. 그때 되물으면 시키는 대로
         * 크게 말해도 계속 같은 화면을 보게 된다 — 자기가 무엇을 잘못하는지
         * 알 수 없는 채로. 들을 수 없으면 들은 것으로 친다.
         */
        const spoke = recorder.error !== null || quizHeard.current >= QUIZ_VOICE_FRAMES;
        if (spoke || quizRetry >= QUIZ_RETRY_MAX) {
          setStep('COUNT_ANSWER');
          return;
        }
        setQuizRetry((n) => n + 1);
        setStep('COUNT_QUIZ');
      });

    return () => {
      cancelled = true;
    };
    // recorder 는 매 렌더 새 객체라 의존성에 넣으면 이펙트가 계속 다시 돈다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, quizRetry]);


  useEffect(() => {
    if (step !== 'COMPLETE') return;
    /*
     * 동화에 남길 기록. 과목마다 한 일이 다르다.
     *
     * 수학 시간에 시를 읽었다고 적으면 동화가 거짓말을 한다 — 아이는 오늘
     * 과일을 셌지 시를 읽지 않았다.
     */
    completeCategory('CLASS', {
      category: 'class',
      // 동화가 무엇을 한 날인지 알아야 한다. 안 보내면 서버는 동시로 본다.
      classSubject: subject.id,
      poemText:
        subject.id === 'MATH'
          ? `${quiz.fruit.name} ${countLabel(quiz.count)}를 세었어요.`
          : poemText,
      practicedWord: subject.id === 'MATH' ? null : (score?.targetWord ?? null),
    });
  }, [step, completeCategory, poemText, score, subject, quiz]);

  /** 채점이 짚어준 낱말이 몇 번째 줄에 있는지 — 그 줄에만 형광펜을 긋는다. */
  const targetLine = useMemo(() => {
    if (!score?.targetWord) return -1;
    return poem.lines.findIndex((line) => line.includes(score.targetWord as string));
  }, [score, poem]);

  /**
   * 시 읽기 화면은 배경 그림을 깔지 않는다.
   *
   * 시 카드 자체가 이미 그림 한 장이다. 그 뒤에 흐린 교실까지 두면 그림 위에 그림이
   * 겹쳐 어디를 봐야 할지 알 수 없고, 정작 읽어야 할 시가 묻힌다.
   * 표현 고르기 화면과 같은 규칙이다 — 할 일이 하나뿐인 화면은 바탕을 비운다.
   */
  const plain = step === 'POEM' || step === 'POEM_FEEDBACK' || step === 'COUNT';

  /** 낭독 뒤에 짚어줄 말. 화면에도 뜨고 소리로도 나간다 — 같은 문장을 한 곳에서 만든다. */
  /*
   * score 가 null 인 것과 targetWord 가 null 인 것은 **다른 일**이다.
   * 앞은 "채점이 아예 안 됐다"(서버가 죽었거나 시간이 넘었다), 뒤는 "다 잘 읽었다".
   * 둘을 한 갈래로 묶어 둔 바람에, 채점이 안 된 날에도 "아주 또박또박 잘
   * 읽었어요!" 가 소리까지 나갔다 — 아이가 어떻게 읽었는지 아무도 모르는데.
   * 따라 말하기에서 고친 것과 같은 종류의 거짓 칭찬이다.
   */
  const graded = score !== null;
  const feedbackLine = !score
    ? '선생님이 잘 못 들었어.\n그래도 끝까지 읽었구나!'
    : score.targetWord
      ? `"${score.targetWord}" 부분을\n조금 더 천천히 읽어볼까요?`
      : '아주 또박또박 잘 읽었어요!';

  const background = plain
    ? undefined
    : step === 'COMPLETE'
      ? subject.complete
      : step === 'FIND_PAGE' || step === 'FIND_PAGE_DONE'
        ? subject.find
        : subject.scene;

  /*
   * 펼침면에 인쇄돼 보이는 쪽 번호.
   *
   * 다음 쪽으로 넘길 때는 **넘어가는 낱장이 옛 번호를 들고 가고**, 그 아래에서
   * 새 번호가 드러난다 — 실제 책이 그렇다. 그래서 base 는 미리 다음 번호를
   * 보여줘야 하고, 낱장 앞면이 옛 번호를 인쇄한다.
   * 앞 쪽으로 갈 때는 반대다. 넘어오는 낱장의 뒷면이 새 번호를 들고 내려앉고,
   * 그동안 아래에는 지금 번호가 그대로 있는다.
   */
  const baseNo = flip === 'next' ? page + 1 : page;

  // 어떤 이유로든 녹음이 안 되면 우회로를 연다 — DialoguePlay 와 같은 규칙이다.
  const micBlocked = recorder.error !== null;

  const softBackground: boolean | 'lite' =
    step === 'COMPLETE' ? false : step === 'INTRO' ? 'lite' : true;

  /**
   * 시 카드 — 그림 위에 시를 얹는다.
   *
   * 흰 카드에 글자만 있으면 국어책의 한 쪽이 아니라 안내문처럼 보인다. 시가 말하는
   * 풍경(햇살·바람·꽃) 위에 얹으면 아이가 낱말과 그림을 함께 읽는다.
   */
  const poemCard = (highlight: number) => (
    <button
      type="button"
      className="poem-card"
      style={{ backgroundImage: `url(${poem.scene})` }}
      onClick={() => void speakLines(poem.lines, setReadingLine)}
    >
      {/*
        줄이 다섯을 넘으면 글자를 줄인다. 카드가 정사각형(aspect-ratio 1/1)이라
        폭이 좁은 폰에서는 높이도 같이 줄어드는데, 여섯 줄을 기본 크기로 넣으면
        마지막 줄이 overflow:hidden 에 잘린다 — 시의 끝 행이 사라지는 셈이다.
      */}
      <span
        className="poem-card__text"
        data-long={poem.lines.length >= 5}
        // 그림마다 위쪽에 그려진 것이 달라, 시마다 시작 높이를 따로 준다
        style={poem.textOffset ? { paddingTop: 20 + poem.textOffset } : undefined}
      >
        <span className="poem-card__title">{poem.title}</span>
        {poem.lines.map((line, index) => (
          <span
            key={line}
            className="poem-card__line"
            data-active={readingLine === index}
            data-target={index === highlight}
          >
            {line}
          </span>
        ))}
      </span>
      <span className="poem-tap">
        <Icon name="sound" size={15} />
        눌러서 듣기
      </span>
    </button>
  );

  return (
    <Stage background={background} soft={softBackground} mood="paper">
      <div className="play-head">
        <TopBar
          title={CLASS.title}
          onBack={step === 'COMPLETE' ? undefined : () => navigate('/home')}
        />
        <ProgressDots total={4} index={DOT[step]} />
      </div>

      {/*
        맞게 골랐다는 신호를 글자로 하지 않는다.

        예전에는 이 자리에 "맞았어요!" 를 띄웠는데, 그러면 다음 화면이 시키는
        "이제 따라 말해볼까요?" 와 두 가지를 한꺼번에 말하게 된다. 색종이는
        읽지 않아도 알아보고, 화면의 말은 지금 할 일 하나만 남는다.
      */}
      {step === 'FIND_PAGE_DONE' ||
      step === 'COUNT_PRAISE' ||
      step === 'COUNT_ANSWER' ||
      (step === 'COUNT_READ' && justPicked) ? (
        /*
          key 가 없으면 COUNT_READ → COUNT_PRAISE 처럼 조건이 참인 채로 이어지는
          전이에서 리액트가 **같은 인스턴스를 그대로 둔다.** 조각은 useMemo 라
          다시 안 만들어지고 낙하 애니메이션은 일회성이라 이미 끝나 있어서,
          정작 축하할 칭찬 화면에서 한 조각도 안 떨어졌다.
        */
        <Confetti key={step} />
      ) : null}

      <div className="scene-body">
        {step === 'INTRO' && (
          <>
            <div className="stage-center">
              <div className="spacer" />
              {/*
                다른 시나리오 인트로와 같은 규칙 — 말을 거는 사람 하나만 가운데 세우고
                배경은 살짝 흐려 뒤로 민다. 교실 배경에도 선생님이 그려져 있지만,
                흐려진 배경 앞에 또렷하게 선 이쪽이 말하는 사람으로 읽힌다.
              */}
              <div className="talk-group">
                <SpeechBubble tone="teacher" speaker="토끼 선생님">
                  {subject.teacherLine.replace('{page}', String(target))}
                </SpeechBubble>
                <div className="actors actors--grounded">
                  <Character who="teacher" pose="hello" height={184} />
                </div>
              </div>
              <div className="card" style={{ width: '100%' }}>
                <p className="title">{subject.title}</p>
                <p className="lead" style={{ marginTop: 6 }}>
                  {subject.lead}
                </p>
              </div>
            </div>
            <div className="scene-footer">
              <BigButton icon="book" onClick={() => setStep('FIND_PAGE')}>
                {subject.openLabel}
              </BigButton>
            </div>
          </>
        )}

        {step === 'FIND_PAGE' && (
          <div className="stage-center">
            <span className="page-goal" data-close={Math.abs(baseNo - target) <= 1}>
              찾을 쪽 <b>{target}</b>
            </span>

            <div
              className="book-stage"
              // 넘김 길이의 단일 출처. CSS 키프레임이 이 값을 읽는다 —
              // 타이머와 키프레임이 따로 놀던 것이 이 화면의 제일 큰 버그였다.
              style={{ ['--flip-ms' as string]: `${flipDuration()}ms` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div
                className="book"
                style={{
                  // 낱장의 앞뒷면이 이 그림의 반쪽씩을 인쇄한다. 경로의 단일 출처.
                  ['--book-img' as string]: `url(${subject.book})`,
                  // 손끝을 따라 살짝 기운다. 놓으면 제자리로 돌아온다.
                  transform: `rotateY(${drag * 0.12}deg) translateX(${drag * 0.25}px)`,
                }}
              >
                <img src={subject.book} alt={subject.id === 'MATH' ? '수학책' : '국어책'} />

                {/* 펼침면에 인쇄된 쪽 번호. 낱장 아래에 깔린다 */}
                <span className="book__page-no">
                  <b key={baseNo}>{baseNo}</b>
                  <span>쪽</span>
                </span>

                {/* 들린 종이가 아래 쪽에 드리우는 그림자 — 종이에 붙어 돌지 않는다 */}
                {flip ? (
                  <span className={`book__flip-shade book__flip-shade--${flip}`} aria-hidden />
                ) : null}

                {/*
                  넘어가는 낱장. 예전에는 반투명 흰 사각형이라 종이에 아무것도
                  인쇄돼 있지 않았고, 그래서 "투명한 게 스쳐 지나간다" 로 보였다.
                  이제 앞뒤 두 면이 펼침 그림의 반쪽씩을 인쇄한다 — 90도를 지나며
                  앞면이 꺼지고 뒷면이 켜지는 교대가 '종이 한 장' 의 유일한 증거다.
                */}
                {flip ? (
                  <span className={`book__sheet book__sheet--${flip}`} aria-hidden>
                    <span className="book__face book__face--front">
                      {flip === 'next' ? (
                        <span className="book__page-no">
                          <b>{page}</b>
                          <span>쪽</span>
                        </span>
                      ) : null}
                    </span>
                    <span className="book__face book__face--back">
                      {flip === 'prev' ? (
                        <span className="book__page-no">
                          <b>{page - 1}</b>
                          <span>쪽</span>
                        </span>
                      ) : null}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>

            {/*
              화살표 버튼을 뒀었지만 걷어냈다. 두 갈래가 나란히 있으면 아이는 더
              쉬운 쪽(버튼)만 누르고, 정작 이 화면이 가르치려는 손동작을 배우지
              못한다. 미는 방법만 남기고 그것을 어떻게 하는지만 보여준다.
            */}
            <div className="book-hint">
              <img className="book-hint__hand" src={CLASS.props.swipeHint} alt="" aria-hidden />
              <span className="pill-note">손으로 밀어서 넘겨볼까요?</span>
            </div>
          </div>
        )}

        {step === 'FIND_PAGE_DONE' && (
          <>
            <div className="stage-center">
              <div className="talk-group">
                <SpeechBubble tone="teacher" speaker="토끼 선생님">
                  잘 찾았어요!
                </SpeechBubble>
                <div className="actors actors--grounded">
                  <Character who="teacher" pose="happy" height={148} />
                </div>
              </div>
              <div className="found">
                <div className="found__book">
                  <img src={CLASS.props.bookFound} alt="" aria-hidden />
                  {/* 번호는 펼쳐진 면 한가운데. 설명은 책 밖 아래에 둔다 */}
                  <span className="found__no">
                    <b>{target}</b>
                  </span>
                </div>
                <p className="found__label">{target}쪽을 폈어요!</p>
              </div>
            </div>
            <div className="scene-footer">
              {/* 여기서부터 과목이 갈린다. 앞은 두 과목이 완전히 같았다 */}
              <BigButton onClick={() => setStep(subject.id === 'MATH' ? 'COUNT' : 'POEM')}>
                {subject.id === 'MATH' ? '문제 풀러 가기' : '동시 읽으러 가기'}
              </BigButton>
            </div>
          </>
        )}

        {step === 'COUNT' && (
          <>
            <div className="stage-center">
              {/*
                말풍선과 선생님을 세우지 않는다.

                이 화면은 볼 것이 이미 많다 — 과일이 최대 다섯 개에 고를 보기가
                다섯 줄인데, 그 위에 말풍선과 토끼까지 서면 아이 눈이 갈 곳을
                잃는다. 게다가 여기서 물어보는 것은 누가 하는 말인지가 아니라
                **무엇을 세야 하는가** 하나다. 그래서 폭을 꽉 채운 띠로 둔다.
              */}
              <p className="quiz-band" key={`${questionLine}-${wrongPicks.length}`}>
                {questionLine}
              </p>

              {/*
                문제 그림. 과일은 그림에 굽지 않고 얹는다 — 종류 셋 × 개수 다섯이면
                열다섯 장이 되고, 그림 한 장을 고칠 때마다 열다섯 장을 다시 만들어야 한다.

                고르는 동안에는 낮춘다. 보기 다섯 줄이 아래에 서야 하는데 그림이
                390px 를 그대로 차지하면 작은 폰에서 마지막 보기가 화면 밖으로
                밀린다 — 아이는 다섯 중 넷만 있는 문제를 풀게 된다.
              */}
              <div
                className="math-card math-card--compact"
                style={{ backgroundImage: `url(${CLASS.mathScene})` }}
              >
                <FruitCount fruit={quiz.fruit} count={quiz.count} />
              </div>

              {/*
                  말하기가 아니라 고르기다.

                  세는 말을 **소리로** 요구하면 두 가지를 한꺼번에 시키는 셈이다 —
                  개수를 세는 일과, 한국어 수사를 발음하는 일. 이 앱을 쓰는 아이는
                  한국어가 아직 서툴러서, 다섯 개를 정확히 세고도 "다섯"이 입에서
                  안 나와 틀린 아이가 된다. 수학 문제는 수학으로 묻는다.

                  대신 보기를 **문장으로** 둔다. "5" 가 아니라 "사과가 다섯 개
                  있어요" 다. 고르는 동안 셀 말을 눈으로 읽게 되고, 고른 그 문장이
                  바로 다음 화면에서 소리 내어 읽을 문장이 된다.
              */}
              <div className="count-choices" role="group" aria-label="개수 고르기">
                {Array.from({ length: MAX_COUNT }, (_, i) => i + 1).map((n) => {
                  const wrong = wrongPicks.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      className="count-choice"
                      data-wrong={wrong || undefined}
                      /*
                          틀린 보기를 지우거나 못 누르게 막지 않는다. 흐리게 두고
                          그대로 남긴다 — 무엇을 이미 눌러 봤는지 보여야 같은 것을
                          또 누르지 않는다. 다섯 중에 고르는 일을 기억에만 맡기면
                          헛수고를 되풀이한다.
                        */
                      onClick={() => {
                        stopSpeaking();
                        if (n === quiz.count) {
                          setJustPicked(true);
                          setStep('COUNT_READ');
                          return;
                        }
                        setWrongPicks((prev) => (prev.includes(n) ? prev : [...prev, n]));
                      }}
                    >
                      {/*
                          숫자를 왼쪽에 따로 세운다.

                          장식이 아니다 — 한글을 아직 못 읽는 아이에게는 **이것이
                          답 자체다.** 과일을 세어 나온 수와 같은 칸을 누르면 된다.
                          문장은 그 옆에서 "그 수를 한국어로는 이렇게 말한다" 를
                          가르친다. 읽을 수 있는 아이에게는 문장이, 아직 못 읽는
                          아이에게는 숫자가 길이 된다.
                        */}
                      <span className="count-choice__num" aria-hidden>
                        {n}
                      </span>
                      <span className="count-choice__text">
                        {countSentence(quiz.fruit.name, n)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="scene-footer">
              {/*
                고르는 동안에는 아래에 아무것도 두지 않는다. 버튼이 하나라도 서면
                아이는 문제를 풀지 않고 그것부터 누른다. 나가는 길은 정답 하나다.
              */}
            </div>
          </>
        )}

        {/*
          따라 말하기 — 등교하기(DialoguePlay)의 REPEAT 과 같은 짜임이다.

          예전에는 문제 그림과 큰 민트 띠를 그대로 이고 "이제 따라 읽어볼까요?" 를
          띄웠는데, 그러면 **개수를 세는 화면과 소리 내어 말하는 화면이 구별되지
          않는다.** 아이는 방금 답을 골랐고 이제 할 일이 바뀌었는데 화면은 그대로다.
          그림을 뒤로 물리고(흐린 교실), 읽을 문장 하나와 나를 닮은 캐릭터만 남긴다 —
          앱의 다른 말하기 화면이 전부 이 모양이라 아이는 이미 무엇을 하는 자리인지 안다.
        */}
        {step === 'COUNT_READ' && (
          <>
            <div className="stage-center">
              <p className="subtitle on-scene">이제 따라 말해볼까요?</p>
              {misread > 0 ? (
                /*
                  말풍선이 아니라 가로 띠다. 누가 하는 말이 아니라 화면이 지금 어떤
                  상태인지를 알리는 것이라서다. key 에 횟수를 태워 매번 다시
                  나타나게 한다 — 두 번째에 아무 변화가 없으면 아이는 자기 말이
                  닿았는지조차 알 수 없다.
                */
                <p key={misread} className="retry-note">
                  {READ_RETRY_LINE}
                </p>
              ) : null}
              <SentenceBox text={answerSentence} />
              <Character who="me" pose={recorder.isRecording ? 'speak' : 'hello'} height={150} />
              {busy ? (
                <span className="pill-note">
                  잘 들었어요 <Thinking />
                </span>
              ) : (
                <span className="pill-note">
                  {scorable === null
                    ? // 채점을 받을 수 있는지 확인하는 동안. 여기서 마이크를 열면
                      // 어느 길로 보낼지 모르는 채로 녹음을 받게 된다.
                      '선생님을 부르는 중이에요'
                    : '문장을 눌러 먼저 들어봐도 좋아요'}
                </span>
              )}
            </div>
            <div className="scene-footer">
              <div style={{ display: 'grid', placeItems: 'center' }}>
                <MicButton
                  recording={recorder.isRecording}
                  level={recorder.level}
                  progress={recorder.progress}
                  disabled={busy || scorable === null}
                  hint={recorder.isRecording ? '다 말했으면 다시 눌러요' : '눌러서 따라 말하기'}
                  onClick={async () => {
                    if (recorder.isRecording) {
                      const audio = await recorder.stop();
                      if (audio) await onReadAloud(audio);
                    } else {
                      stopSpeaking();
                      await recorder.start();
                    }
                  }}
                />
              </div>
              {/*
                순서가 중요하다. 마이크 오류를 먼저 보면, 세 번 어긋난 아이가
                마이크까지 막혔을 때 탈출구가 바뀐다 — 등교하기에서 겪은 것과
                같은 함정이다. 어긋난 적이 있으면 그쪽이 먼저다.

                어느 쪽이든 칭찬 화면으로 보내지 않는다. 개수는 이미 맞힌 뒤라
                넘어가도 문제를 푼 것이지만, 읽지 않은 아이에게 잘 읽었다고
                말할 수는 없다.
              */}
              {misread >= 3 ? (
                <BigButton tone="ghost" onClick={leaveReading}>
                  괜찮아, 다음으로
                </BigButton>
              ) : micBlocked ? (
                <BigButton tone="ghost" onClick={leaveReading}>
                  마이크 없이 넘어가기
                </BigButton>
              ) : null}
            </div>
          </>
        )}

        {/*
          잘 읽었을 때. 등교하기의 칭찬 화면과 같은 모양이다 —
          짚어줄 것이 없는데 기린을 세워 카드를 내밀면, 아이는 무언가 틀린 줄 안다.
        */}
        {step === 'COUNT_PRAISE' && (
          <div className="stage-center">
            <SpeechBubble tone="teacher">{'훌륭해!\n너무 멋져'}</SpeechBubble>
            <Character who="me" pose="cheer" height={200} />
            <div className="card">
              <p className="subtitle">{praiseLine}</p>
            </div>
          </div>
        )}

        {/*
          빈칸 퀴즈 — 표현 퀴즈(등교하기)와 같은 짜임이다.

          채점이 약하다고 짚은 어절 하나를 비우고 문장을 다시 말하게 한다.
          그냥 "여기를 천천히 읽어보렴" 하고 넘기면 아이는 읽지 않고 넘어간다.
          비워 두면 그 자리를 채우려고 반드시 소리를 내야 한다.
        */}
        {(step === 'COUNT_QUIZ' || step === 'COUNT_QUIZ_LISTENING' || step === 'COUNT_ANSWER') &&
          readScore && (
            <>
              <div className="stage-center">
                <p className="subtitle on-scene">오늘의 숫자 퀴즈</p>
                <div className="talk-group">
                  <SpeechBubble key={`${step}-${quizRetry}`} tone="teacher">
                    {step === 'COUNT_QUIZ_LISTENING'
                      ? '듣고 있어!'
                      : step === 'COUNT_ANSWER'
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
                    sentence={readScore.sentence}
                    targetIndex={readScore.targetIndex ?? 0}
                    answer={step === 'COUNT_ANSWER' ? (readScore.targetWord ?? undefined) : undefined}
                  />
                  {hintText ? (
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
                          한국어 문장뿐이라, 모국어까지 읽어주면 지금 무엇을 말해야
                          하는지가 흐려진다.
                        */}
                        <span>{hintOpen ? '뜻 접기' : '무슨 뜻이야?'}</span>
                      </button>
                      {hintOpen ? (
                        <p className="hint__text">
                          {/*
                            짚어줄 자리를 아는 경우에만 밑줄을 긋는다. 대응표가 없는데
                            아무 데나 그으면 틀린 것을 가르치게 된다.
                          */}
                          {hintParts && readScore?.targetIndex !== null
                            ? hintParts.map((part, index) => (
                                <span
                                  key={`${part.t}-${index}`}
                                  className="hint__part"
                                  data-mark={part.k.includes(readScore?.targetIndex as number)}
                                >
                                  {part.t}
                                  {hintJoiner}
                                </span>
                              ))
                            : hintText}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {quizRetry > 0 && step === 'COUNT_QUIZ' ? (
                  // 말풍선이 이미 되묻고 있으므로 여기서는 무엇을 하면 되는지만 짚는다
                  <p className="retry-note">마이크에 대고 크게 말해요</p>
                ) : null}
                {step === 'COUNT_QUIZ_LISTENING' ? (
                  /*
                    5초 가까이 점 세 개만 깜빡이면 아이는 화면이 멈춘 줄 안다.
                    줄어드는 막대로 "지금이 네 차례고, 이만큼 남았다" 를 보여준다 —
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
                    onClick={() => void speak(readScore.sentence, 'KOREAN', 'TEACHER')}
                  >
                    다시 들어보기
                  </BigButton>
                  {step === 'COUNT_ANSWER' ? (
                    <BigButton onClick={() => setStep('COMPLETE')}>다음</BigButton>
                  ) : (
                    <BigButton
                      disabled={step === 'COUNT_QUIZ_LISTENING'}
                      icon="mic"
                      onClick={() => setStep('COUNT_QUIZ_LISTENING')}
                    >
                      말해보기
                    </BigButton>
                  )}
                </div>
              </div>
            </>
          )}

        {step === 'COUNT_FEEDBACK' && (
          <>
            <div className="stage-center">
              <div className="talk-group">
                {/*
                  칭찬만 읽어주고 아래를 놔두면 **무엇을 고쳐야 하는지**가 글자로만
                  남는다. 글자를 아직 못 읽는 아이에게는 없는 것과 같아 둘을 한
                  문장으로 이어 읽어준다 — 동시 낭독과 같은 규칙이다.
                */}
                <SpeechBubble tone="teacher" say={readScore ? `잘했어요! ${readLine}` : readLine}>
                  {readScore ? '잘했어요 :)' : '끝까지 읽었구나 :)'}
                </SpeechBubble>
                <div className="actors actors--grounded">
                  <PartnerActor
                    src="/scenes/pronunciation/img_pronunciation_giraffe.png"
                    height={112}
                  />
                </div>
              </div>
              {/*
                짚어준 어절에 형광펜을 긋는다. 상자를 누르면 다시 들려주므로,
                아이가 그 자리를 눈으로 보면서 소리로 확인할 수 있다.
              */}
              <SentenceBox
                text={answerSentence}
                highlight={readScore?.targetWord ? [readScore.targetWord] : []}
              />
              <div className="card" style={{ width: '100%' }}>
                <p className="subtitle">{readLine}</p>
              </div>
            </div>
            <div className="scene-footer">
              <div className="row">
                <BigButton
                  tone="ghost"
                  icon="replay"
                  onClick={() => {
                    setReadScore(null);
                    setReadFailed(false);
                    // 되묻기 횟수도 지운다. 안 지우면 아이가 아무 말도 안 한 상태에서
                    // "잘 못 들었어" 가 뜨고, 탈출 버튼도 3회가 아니라 그보다 일찍 열린다.
                    setMisread(0);
                    setJustPicked(false);
                    setStep('COUNT_READ');
                  }}
                >
                  다시 읽기
                </BigButton>
                <BigButton onClick={() => setStep('COMPLETE')}>다음</BigButton>
              </div>
            </div>
          </>
        )}

        {step === 'POEM' && (
          <>
            <div className="stage-center">
              <p className="subtitle">시를 누르면 들려줄게요</p>
              {offScript > 0 ? (
                /*
                  말풍선이 아니라 가로 띠다. 말풍선으로 두면 캐릭터가 하는 말처럼
                  읽혀서 아이가 말한 사람을 찾게 되는데, 이건 누가 하는 말이 아니라
                  화면이 지금 어떤 상태인지를 알리는 것이다.
                  소리는 아래 useEffect 가 따로 읽어준다.
                */
                <p key={offScript} className="retry-note">
                  {RETRY_LINE}
                </p>
              ) : null}
              {poemCard(-1)}
              {busy ? (
                <span className="pill-note">
                  잘 들었어요 <Thinking />
                </span>
              ) : (
                <span className="pill-note">같이 읽어볼까요?</span>
              )}
            </div>
            <div className="scene-footer">
              <div style={{ display: 'grid', placeItems: 'center' }}>
                <MicButton
                  recording={recorder.isRecording}
                  level={recorder.level}
                  progress={recorder.progress}
                  disabled={busy}
                  hint={recorder.isRecording ? '다 읽었으면 다시 눌러요' : '눌러서 같이 읽기'}
                  onClick={async () => {
                    if (recorder.isRecording) {
                      const audio = await recorder.stop();
                      if (audio) await onRecorded(audio);
                    } else {
                      stopSpeaking();
                      setReadingLine(-1);
                      await recorder.start();
                    }
                  }}
                />
              </div>
              {micBlocked ? (
                <BigButton tone="ghost" onClick={() => setStep('POEM_FEEDBACK')}>
                  마이크 없이 넘어가기
                </BigButton>
              ) : offScript >= 3 ? (
                // 세 번을 다시 읽어도 닿지 않으면 길을 열어준다. 다만 칭찬은 없다 —
                // score 가 null 이라 아래 화면은 짚어줄 낱말 없이 넘어가기만 한다.
                <BigButton tone="ghost" onClick={() => setStep('COMPLETE')}>
                  괜찮아, 다음으로
                </BigButton>
              ) : null}
            </div>
          </>
        )}

        {step === 'POEM_FEEDBACK' && (
          <>
            <div className="stage-center">
              {/* 기린도 흉상이다. 말풍선을 바로 위에 붙이고 시 카드에 살짝 파묻는다 */}
              <div className="talk-group">
                {/*
                  칭찬만 읽어주고 아래 카드를 놔두면, 정작 **무엇을 고쳐야 하는지**가
                  글자로만 남는다. 글자를 아직 못 읽는 아이에게는 없는 것과 같아
                  둘을 한 문장으로 이어 읽어준다.
                */}
                <SpeechBubble
                  tone="teacher"
                  say={graded ? `잘했어요! ${feedbackLine}` : feedbackLine}
                >
                  {graded ? '잘했어요 :)' : '끝까지 읽었구나 :)'}
                </SpeechBubble>
                <div className="actors actors--grounded">
                  <PartnerActor
                    src="/scenes/pronunciation/img_pronunciation_giraffe.png"
                    height={112}
                  />
                </div>
              </div>
              {poemCard(targetLine)}
              <div className="card" style={{ width: '100%' }}>
                <p className="subtitle">{feedbackLine}</p>
              </div>
            </div>
            <div className="scene-footer">
              <div className="row">
                <BigButton
                  tone="ghost"
                  icon="replay"
                  onClick={() => {
                    setScore(null);
                    // 되묻기 횟수도 지운다. 안 지우면 아이가 아무 말도 안 한
                    // 상태에서 "잘 못 들었어" 가 뜨고, 탈출 버튼도 3회가 아니라
                    // 2회 만에 열린다.
                    setOffScript(0);
                    setStep('POEM');
                  }}
                >
                  다시 읽기
                </BigButton>
                <BigButton onClick={() => setStep('COMPLETE')}>다음</BigButton>
              </div>
            </div>
          </>
        )}

        {step === 'COMPLETE' && (
          <>
            {/* 따라 말하기 세 화면과 같은 보상이다 — 하루 네 번이 다르면 안 된다 */}
            <GemReward category="CLASS" />
            <Confetti key="complete" pieces={16} startMs={120} />

            <div className="stage-center">
              <div className="spacer" />
              <div className="card gem-reward-card" style={{ width: '100%' }}>
                <p className="title">수업시간 완료!</p>
                <p className="lead" style={{ marginTop: 6 }}>
                  {subject.completeLine}
                </p>
                <GemKept category="CLASS" isCompleted={isCompleted} />
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
