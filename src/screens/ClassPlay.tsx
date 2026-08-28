import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { pronunciation, stt, warmUpScoring, type RecordingFile } from '@/api/endpoints';
import type { PronunciationResult } from '@/api/types';
import {
  BigButton,
  Character,
  Confetti,
  MicButton,
  PartnerActor,
  ProgressDots,
  SpeechBubble,
  Thinking,
  TopBar,
} from '@/components';
import { GemKept, GemReward } from '@/components/GemReward';
import { Icon } from '@/components/Icon';
import { Stage } from '@/components/Stage';
import { announce, speakLines, stopSpeaking } from '@/audio/speaker';
import { useRecorder } from '@/audio/useRecorder';
import { CLASS, randomFruitCount, randomPage, randomPoem, randomSubject } from '@/scenarios/data';
import { countLabel, heardCount } from '@/scenarios/counting';
import { FruitCount } from '@/components/FruitCount';
import { useAppState } from '@/store/appState';
import './screens.css';

/**
 * 수업시간 — 국어책을 펴고 동시를 같이 읽는다.
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
  | 'COUNT_ANSWER'
  | 'COMPLETE';

/** 진행 점 4개 — 다른 시나리오와 같은 눈금을 쓴다 */
const DOT: Record<Step, number> = {
  INTRO: 0,
  FIND_PAGE: 1,
  FIND_PAGE_DONE: 1,
  POEM: 2,
  POEM_FEEDBACK: 2,
  COUNT: 2,
  COUNT_ANSWER: 2,
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
  const { completeCategory, isCompleted } = useAppState();

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
  /** 아이가 말한 개수. 못 알아들었으면 null */
  const [heard, setHeard] = useState<number | null>(null);
  /** 답을 못 맞힌 채 되물은 횟수 */
  const [missed, setMissed] = useState(0);
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
  useEffect(() => {
    if (step !== 'INTRO' && step !== 'POEM') return;
    void warmUpScoring();
  }, [step]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

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
   * 수학은 채점이 아니라 **인식**이다.
   *
   * 국어는 "이 문장을 얼마나 잘 읽었나" 라 /pronunciation 으로 채점하지만,
   * 수학은 "무엇을 말했나" 를 알아야 한다. 서버의 채점 문장 목록에 "세 개" 같은
   * 답이 있을 리 없으니 채점으로는 답을 맞힐 수가 없다. /stt 로 글자를 받아
   * 그 안에서 수를 뽑는다.
   */
  const onCounted = useCallback(
    async (audio: RecordingFile) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setBusy(true);
      try {
        const result = await stt(audio, controller.signal);
        if (!alive.current) return;
        const said = heardCount(result.text);
        setHeard(said);
        if (said === quiz.count) {
          setMissed(0);
          setStep('COUNT_ANSWER'); // 맞았으니 칭찬으로 간다
          return;
        }
        /*
         * 못 알아들었으면 한 번 더 묻는다. 아이가 답을 몰라서가 아니라 소리가
         * 안 닿은 경우가 많고, 그때 답부터 알려주면 생각할 기회를 뺏는다.
         * 두 번까지만 되묻고 그 뒤에는 답을 보여준다 — 여기 가둬둘 수는 없다.
         */
        if (said === null && missed < 1) {
          setMissed((n) => n + 1);
          return; // COUNT 에 그대로 머문다
        }
        setMissed((n) => n + 1);
        setStep('COUNT_ANSWER');
      } catch (error) {
        if (error instanceof ApiError && error.code === 'CANCELLED') return;
        if (!alive.current) return;
        // 서버가 안 되는 것은 아이 잘못이 아니다. 답을 보여주고 따라 말하게 한다.
        setHeard(null);
        setStep('COUNT_ANSWER');
      } finally {
        if (alive.current && abort.current === controller) setBusy(false);
      }
    },
    [quiz.count, missed],
  );

  const recorder = useRecorder(subject.id === 'MATH' ? onCounted : onRecorded);

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
  const plain =
    step === 'POEM' || step === 'POEM_FEEDBACK' || step === 'COUNT' || step === 'COUNT_ANSWER';

  /** 낭독 뒤에 짚어줄 말. 화면에도 뜨고 소리로도 나간다 — 같은 문장을 한 곳에서 만든다. */
  /*
   * score 가 null 인 것과 targetWord 가 null 인 것은 **다른 일**이다.
   * 앞은 "채점이 아예 안 됐다"(서버가 죽었거나 시간이 넘었다), 뒤는 "다 잘 읽었다".
   * 둘을 한 갈래로 묶어 둔 바람에, 채점이 안 된 날에도 "아주 또박또박 잘
   * 읽었어요!" 가 소리까지 나갔다 — 아이가 어떻게 읽었는지 아무도 모르는데.
   * 따라 말하기에서 고친 것과 같은 종류의 거짓 칭찬이다.
   */
  /**
   * 아이가 맞혔나.
   *
   * 맞힌 것과 "답을 보여준 것" 은 화면이 달라야 한다 — 둘 다 답이 뜨지만,
   * 맞힌 아이에게 "따라 말해볼까요?" 라고 하면 자기가 틀린 줄 안다.
   */
  const correct = heard === quiz.count;

  const graded = score !== null;
  const feedbackLine = !score
    ? '선생님이 잘 못 들었어.\n그래도 끝까지 읽었구나!'
    : score.targetWord
      ? `"${score.targetWord}" 부분을\n조금 더 천천히 읽어볼까요?`
      : '아주 또박또박 잘 읽었어요!';

  const background = plain
    ? undefined
    : step === 'COMPLETE'
      ? CLASS.scenes.complete
      : step === 'FIND_PAGE' || step === 'FIND_PAGE_DONE'
        ? CLASS.scenes.find
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

      {step === 'FIND_PAGE_DONE' ? <Confetti /> : null}

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

        {(step === 'COUNT' || step === 'COUNT_ANSWER') && (
          <>
            <div className="stage-center">
              <div className="talk-group">
                {/*
                  key 에 되물은 횟수를 태워 매번 다시 읽어준다. 문구가 같으면
                  두 번째에는 아무 소리도 안 나서, 아이는 자기 말이 닿았는지를
                  알 수 없다.
                */}
                <SpeechBubble key={`${step}-${missed}`} tone="teacher" speaker="토끼 선생님">
                  {step === 'COUNT_ANSWER'
                    ? correct
                      ? '잘했어요! 정확히 세었어요.'
                      : `${quiz.fruit.name}가 ${countLabel(quiz.count)} 있어요.
따라 말해볼까요?`
                    : missed > 0
                      ? '잘 못 들었어. 다시 말해줄래?'
                      : '그림에 있는 과일의 개수는 몇 개인가요?'}
                </SpeechBubble>
                <div className="actors actors--grounded">
                  <Character who="teacher" pose={correct ? 'happy' : 'hello'} height={132} />
                </div>
              </div>

              {/*
                문제 그림. 과일은 그림에 굽지 않고 얹는다 — 종류 셋 × 개수 다섯이면
                열다섯 장이 되고, 그림 한 장을 고칠 때마다 열다섯 장을 다시 만들어야 한다.
              */}
              <div className="math-card" style={{ backgroundImage: `url(${CLASS.mathScene})` }}>
                <FruitCount fruit={quiz.fruit} count={quiz.count} />
                {step === 'COUNT_ANSWER' ? (
                  <span className="math-card__answer">{countLabel(quiz.count)}</span>
                ) : null}
              </div>

              {busy ? (
                <span className="pill-note">
                  잘 들었어요 <Thinking />
                </span>
              ) : (
                <span className="pill-note">
                  {step === 'COUNT_ANSWER' && !correct
                    ? `"${quiz.fruit.name} ${countLabel(quiz.count)}" 라고 말해보세요`
                    : '마이크를 누르고 몇 개인지 말해보세요'}
                </span>
              )}
            </div>

            <div className="scene-footer">
              {step === 'COUNT' ? (
                <div style={{ display: 'grid', placeItems: 'center' }}>
                  <MicButton
                    recording={recorder.isRecording}
                    level={recorder.level}
                    progress={recorder.progress}
                    disabled={busy}
                    hint={recorder.isRecording ? '다 말했으면 다시 눌러요' : '눌러서 말하기'}
                    onClick={async () => {
                      if (recorder.isRecording) {
                        const audio = await recorder.stop();
                        if (audio) await onCounted(audio);
                      } else {
                        stopSpeaking();
                        await recorder.start();
                      }
                    }}
                  />
                </div>
              ) : (
                <BigButton icon="home" onClick={() => setStep('COMPLETE')}>
                  다 했어요
                </BigButton>
              )}
              {micBlocked && step === 'COUNT' ? (
                <BigButton tone="ghost" onClick={() => setStep('COUNT_ANSWER')}>
                  마이크 없이 넘어가기
                </BigButton>
              ) : null}
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
                  보석을 하나 받았어요! 동시를 멋지게 읽었어요.
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
