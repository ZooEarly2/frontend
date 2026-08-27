import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, CHILD_FALLBACK } from '@/api/client';
import { pronunciation, warmUpScoring, type RecordingFile } from '@/api/endpoints';
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
import { Gem } from '@/components/Gem';
import { Icon } from '@/components/Icon';
import { Stage } from '@/components/Stage';
import { speakLines, stopSpeaking } from '@/audio/speaker';
import { useRecorder } from '@/audio/useRecorder';
import { CATEGORY_GEM, CLASS, randomPage } from '@/scenarios/data';
import { useAppState } from '@/store/appState';
import './screens.css';

/**
 * 수업시간 — 국어책을 펴고 동시를 같이 읽는다.
 *
 * 다른 시나리오와 달리 **고를 것이 없다.** 문장 목록의 study 항목이 하나뿐이라
 * "표현 고르기" 화면 자체가 없고, 시 전체가 한 문장으로 채점된다.
 * 그 밖에는 따라 말하기와 완전히 같은 호출을 쓴다 — 별도 낭독 API 가 필요 없다.
 */

type Step = 'INTRO' | 'FIND_PAGE' | 'FIND_PAGE_DONE' | 'POEM' | 'POEM_FEEDBACK' | 'COMPLETE';

/** 진행 점 4개 — 다른 시나리오와 같은 눈금을 쓴다 */
const DOT: Record<Step, number> = {
  INTRO: 0,
  FIND_PAGE: 1,
  FIND_PAGE_DONE: 1,
  POEM: 2,
  POEM_FEEDBACK: 2,
  COMPLETE: 3,
};

/** 목표 쪽에서 이만큼 떨어진 곳에서 시작한다 — 두 번은 넘겨야 닿는다 */
const START_OFFSET = 2;
/** 넘길 수 있는 범위. 너무 멀리 가면 아이가 길을 잃는다 */
const RANGE = 4;
/** 이만큼 밀어야 한 장이 넘어간다 — 만 5세 손 기준으로 낮춰 잡았다 */
const SWIPE_THRESHOLD = 40;
/**
 * 짧게 밀어도 이 속도(px/ms)를 넘으면 넘긴다.
 * 아이는 거리로 밀지 않고 세기로 민다 — 거리만 보면 짧고 빠른 플릭이
 * 통째로 무시돼서 "밀었는데 안 넘어간다"가 된다.
 */
const FLING_VELOCITY = 0.35;
/** 손끝을 따라 기울 수 있는 최대 거리와, 그때 종이가 들리는 각도 */
const DRAG_MAX = 90;
const DRAG_ANGLE_MAX = 74;
/** 한 장이 넘어가는 시간. 살살 밀면 900, 세게 밀면 520 */
const PAGE_TURN_MS = 900;
const PAGE_TURN_MIN_MS = 520;
/** 키프레임에서 종이가 수직에 닿는 지점 — CSS 의 45% 와 같은 값이어야 한다 */
const VERTICAL_AT = 0.45;

/** 넘어가는 종이 한 장. 길이와 시작 지점을 미는 세기에서 뽑아 함께 들고 다닌다 */
type Flip = { dir: 'next' | 'prev'; ms: number; delay: number } | null;

export function ClassPlay() {
  const navigate = useNavigate();
  const { completeCategory } = useAppState();

  const [step, setStep] = useState<Step>('INTRO');
  // 회차마다 다른 쪽 번호를 한 번만 뽑아 끝까지 같은 값을 쓴다.
  const target = useMemo(() => randomPage(), []);
  // 앞뒤 어느 쪽으로도 가야 하도록, 시작 위치를 목표의 앞이나 뒤에 둔다.
  const [page, setPage] = useState(() => target + (Math.random() < 0.5 ? -1 : 1) * START_OFFSET);
  const [flip, setFlip] = useState<Flip>(null);
  const [drag, setDrag] = useState(0);
  const [readingLine, setReadingLine] = useState(-1);
  const [score, setScore] = useState<PronunciationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 시가 아니라 아주 다른 말을 읽은 횟수 */
  const [offScript, setOffScript] = useState(0);

  const alive = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const dragStart = useRef<number | null>(null);
  /** 손끝 궤적. 놓는 순간의 속도를 여기서 뽑는다 */
  const samples = useRef<{ x: number; t: number }[]>([]);

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

  const poemText = CLASS.poem.lines.join(' ');

  // ── 책 넘기기 ───────────────────────────────────

  /**
   * 한 장 넘긴다.
   *
   * 앞뒤 양쪽으로 간다. 한 방향으로만 넘어가면 지나친 쪽으로 되돌아갈 수 없어
   * "찾는다"는 행동 자체가 성립하지 않는다.
   */
  const turn = useCallback(
    (direction: 1 | -1, lifted: number, velocity: number) => {
      if (flip) return; // 넘어가는 중에는 겹쳐 넘기지 않는다
      const next = page + direction;
      if (next < target - RANGE || next > target + RANGE) return;

      /*
       * 고정 길이는 어느 쪽에도 안 맞는다. 살살 민 아이는 900ms 꽉 찬 넘김을,
       * 세게 민 아이는 520ms 를 봐야 자기가 민 세기와 화면이 이어진다.
       * 전자책 특허(US 9046957)가 기술하는 "느린 제스처 → 느린 넘김" 이다.
       */
      const speedCut = Math.min(velocity / 1.2, 1) * 0.25;
      const ms = Math.max(PAGE_TURN_MIN_MS, Math.round(PAGE_TURN_MS * (1 - speedCut)));
      /*
       * 손으로 이미 들어올린 만큼은 건너뛴다 — 음수 delay 로 키프레임 중간부터
       * 재생한다. 이게 없으면 놓는 순간 종이가 0도로 튀어 돌아갔다가 다시
       * 넘어가서, 미는 동작과 넘어가는 동작이 서로 다른 두 장면이 된다.
       */
      const delay = Math.round((Math.min(lifted, DRAG_ANGLE_MAX) / DRAG_ANGLE_MAX) * VERTICAL_AT * ms);

      setFlip({ dir: direction > 0 ? 'next' : 'prev', ms, delay });

      /*
       * 쪽 번호는 애니메이션이 끝난 뒤가 아니라 종이가 수직을 막 넘은 순간에
       * 간다. 끝나고 갈면 종이가 사라진 자리에 번호가 팝인돼서, 넘어오는
       * 종이가 새 번호를 "드러낸" 게 아니라 몰래 갈아끼운 것으로 보인다.
       */
      window.setTimeout(
        () => alive.current && setPage(next),
        Math.max(0, Math.round(ms * 0.55) - delay),
      );

      window.setTimeout(() => {
        if (!alive.current) return;
        setFlip(null);
        // 찾았으면 잠깐 보여주고 넘어간다 — 바로 화면이 바뀌면 찾은 줄 모른다
        if (next === target) {
          window.setTimeout(() => alive.current && setStep('FIND_PAGE_DONE'), 900);
        }
      }, ms - delay);
    },
    [flip, page, target],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    dragStart.current = event.clientX;
    samples.current = [{ x: event.clientX, t: event.timeStamp }];
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (dragStart.current === null) return;
    /*
     * 손끝을 따라 책이 기운다. 90px 에서 딱 잘라 멈추면 손가락은 계속
     * 움직이는데 화면이 서서 고장난 것으로 느낀다 — tanh 로 고무줄처럼
     * 완만해지게 해서 끝이 없게 만든다.
     */
    setDrag(DRAG_MAX * Math.tanh((event.clientX - dragStart.current) / DRAG_MAX));
    samples.current.push({ x: event.clientX, t: event.timeStamp });
    if (samples.current.length > 6) samples.current.shift();
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const dx = drag;
    // 놓기 직전 140ms 만 본다. 미는 도중 멈칫한 것까지 평균 내면 플릭이 죽는다.
    const recent = samples.current.filter((s) => event.timeStamp - s.t < 140);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const velocity = first && last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;

    dragStart.current = null;
    samples.current = [];
    setDrag(0);

    // 멀리 밀었거나, 짧아도 세게 밀었으면 넘긴다
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(velocity) < FLING_VELOCITY) return;
    // 왼쪽으로 밀면 다음 쪽 — 종이책과 같은 방향이다
    const forward = dx === 0 ? velocity < 0 : dx < 0;
    turn(forward ? 1 : -1, (Math.abs(dx) / DRAG_MAX) * DRAG_ANGLE_MAX, Math.abs(velocity));
  };

  // ── 낭독 채점 ───────────────────────────────────

  const onRecorded = useCallback(async (audio: RecordingFile) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setNotice(null);
    try {
      const result = await pronunciation(audio, CLASS.sentenceId, controller.signal);
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
      setNotice(CHILD_FALLBACK);
      // 그 밖의 실패는 아이가 할 수 있는 일이 없다. 붙잡아 두지 않고 넘어간다.
      setScore(null);
      setStep('POEM_FEEDBACK');
    } finally {
      if (alive.current && abort.current === controller) setBusy(false);
    }
  }, []);

  const recorder = useRecorder(onRecorded);

  useEffect(() => {
    if (step !== 'COMPLETE') return;
    completeCategory('CLASS', {
      category: 'class',
      poemText,
      practicedWord: score?.targetWord ?? null,
    });
  }, [step, completeCategory, poemText, score]);

  /** 채점이 짚어준 낱말이 몇 번째 줄에 있는지 — 그 줄에만 형광펜을 긋는다. */
  const targetLine = useMemo(() => {
    if (!score?.targetWord) return -1;
    return CLASS.poem.lines.findIndex((line) => line.includes(score.targetWord as string));
  }, [score]);

  /**
   * 시 읽기 화면은 배경 그림을 깔지 않는다.
   *
   * 시 카드 자체가 이미 그림 한 장이다. 그 뒤에 흐린 교실까지 두면 그림 위에 그림이
   * 겹쳐 어디를 봐야 할지 알 수 없고, 정작 읽어야 할 시가 묻힌다.
   * 표현 고르기 화면과 같은 규칙이다 — 할 일이 하나뿐인 화면은 바탕을 비운다.
   */
  const plain = step === 'POEM' || step === 'POEM_FEEDBACK';

  /** 낭독 뒤에 짚어줄 말. 화면에도 뜨고 소리로도 나간다 — 같은 문장을 한 곳에서 만든다. */
  const feedbackLine = score?.targetWord
    ? `"${score.targetWord}" 부분을\n조금 더 천천히 읽어볼까요?`
    : '아주 또박또박 잘 읽었어요!';

  const background = plain
    ? undefined
    : step === 'COMPLETE'
      ? CLASS.scenes.complete
      : step === 'FIND_PAGE' || step === 'FIND_PAGE_DONE'
        ? CLASS.scenes.find
        : CLASS.scenes.intro;

  /*
   * 미는 동안 종이가 손끝을 따라온다.
   *
   * 원래는 손을 뗀 뒤에야 종이가 나타났다. 그래서 미는 동안은 "책이 기우는
   * 것", 뗀 뒤에야 "넘어가는 것" 이라 한 동작이 두 장면으로 끊겼다. 미리
   * 띄워 두면 놓는 순간 그 각도에서 이어받아 172도까지 마저 도는 하나의
   * 동작이 된다 — turn.js 의 peel, StPageFlip 의 드래그 추종과 같은 구조다.
   */
  const dragAngle = (drag / DRAG_MAX) * DRAG_ANGLE_MAX;
  const sheet: 'next' | 'prev' | null =
    flip?.dir ?? (Math.abs(drag) > 6 ? (drag < 0 ? 'next' : 'prev') : null);

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
      style={{ backgroundImage: `url(${CLASS.props.poemScene})` }}
      onClick={() => void speakLines(CLASS.poem.lines, setReadingLine)}
    >
      <span className="poem-card__text">
        <span className="poem-card__title">{CLASS.poem.title}</span>
        {CLASS.poem.lines.map((line, index) => (
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

      {step === 'COMPLETE' || step === 'FIND_PAGE_DONE' ? <Confetti /> : null}

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
                  {CLASS.teacherLine.replace('{page}', String(target))}
                </SpeechBubble>
                <div className="actors actors--grounded">
                  <Character who="teacher" pose="hello" height={184} />
                </div>
              </div>
              <div className="card" style={{ width: '100%' }}>
                <p className="title">국어 시간이에요</p>
                <p className="lead" style={{ marginTop: 6 }}>
                  책을 펴고 동시를 읽어볼까요?
                </p>
              </div>
            </div>
            <div className="scene-footer">
              <BigButton icon="book" onClick={() => setStep('FIND_PAGE')}>
                국어책 펴기
              </BigButton>
            </div>
          </>
        )}

        {step === 'FIND_PAGE' && (
          <div className="stage-center">
            <span className="page-goal" data-close={Math.abs(page - target) <= 1}>
              찾을 쪽 <b>{target}</b>
            </span>

            <div
              className="book-stage"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div
                className="book"
                style={{
                  // 손끝을 따라 기운다. 놓으면 제자리로 돌아온다.
                  transform: `rotateY(${drag * 0.18}deg) translateX(${drag * 0.24}px)`,
                }}
              >
                <img src={CLASS.props.book} alt="국어책" />
                {sheet ? (
                  <span
                    key={flip ? 'flip' : 'drag'}
                    className={`book__sheet book__sheet--${sheet}${flip ? '' : ' book__sheet--drag'}`}
                    style={
                      flip
                        ? { animationDuration: `${flip.ms}ms`, animationDelay: `-${flip.delay}ms` }
                        : {
                            transform: `rotateY(${dragAngle}deg)`,
                            opacity: 0.12 + (Math.abs(dragAngle) / DRAG_ANGLE_MAX) * 0.4,
                          }
                    }
                  />
                ) : null}
                <span className="book__page-no">
                  <b>{page}</b>
                  <span>쪽</span>
                </span>
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
              <BigButton onClick={() => setStep('POEM')}>동시 읽으러 가기</BigButton>
            </div>
          </>
        )}

        {step === 'POEM' && (
          <>
            <div className="stage-center">
              <p className="subtitle">시를 누르면 들려줄게요</p>
              {offScript > 0 ? (
                // 말풍선이라 스스로 읽어준다. key 에 횟수를 태워 매번 다시 읽어준다.
                <SpeechBubble key={offScript} tone="teacher">
                  {'잘 못 들었어.\n다시 읽어줄래?'}
                </SpeechBubble>
              ) : null}
              {poemCard(-1)}
              {busy ? (
                <span className="pill-note">
                  잘 들었어요 <Thinking />
                </span>
              ) : (
                <span className="pill-note">같이 읽어볼까요?</span>
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
                <SpeechBubble tone="teacher" say={`잘했어요! ${feedbackLine}`}>
                  잘했어요 :)
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
                    setNotice(null);
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
            <div className="stage-center">
              <div className="spacer" />
              <div className="gem-reward">
                <Gem colors={CATEGORY_GEM.CLASS} size={56} />
              </div>
              <div className="card" style={{ width: '100%' }}>
                <p className="title">수업시간 완료!</p>
                <p className="lead" style={{ marginTop: 6 }}>
                  보석을 하나 받았어요! 동시를 멋지게 읽었어요.
                </p>
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
