import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, CHILD_FALLBACK } from '@/api/client';
import { pronunciation, type RecordingFile } from '@/api/endpoints';
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
/** 이만큼 밀어야 한 장이 넘어간다 */
const SWIPE_THRESHOLD = 44;

type Flip = 'next' | 'prev' | null;

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

  const alive = useRef(true);
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

  const poemText = CLASS.poem.lines.join(' ');

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
          window.setTimeout(() => alive.current && setStep('FIND_PAGE_DONE'), 640);
        }
      }, 300);
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
    setNotice(null);
    try {
      const result = await pronunciation(audio, CLASS.sentenceId, controller.signal);
      if (!alive.current) return;
      setScore(result);
      setStep('POEM_FEEDBACK');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CANCELLED') return;
      if (!alive.current) return;
      setNotice(CHILD_FALLBACK);
      // 채점이 안 돼도 아이를 붙잡아 두지 않는다. 짚어줄 낱말 없이 다음으로 간다.
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
                  // 손끝을 따라 살짝 기운다. 놓으면 제자리로 돌아온다.
                  transform: `rotateY(${drag * 0.12}deg) translateX(${drag * 0.25}px)`,
                }}
              >
                <img src={CLASS.props.book} alt="국어책" />
                {flip ? <span className={`book__sheet book__sheet--${flip}`} /> : null}
                <span className="book__page-no">
                  <b>{page}</b>
                  <span>쪽</span>
                </span>
              </div>
            </div>

            {/* 밀지 못하는 아이를 위한 두 번째 길 */}
            <div className="book-nav">
              <button
                type="button"
                className="book-nav__btn"
                onClick={() => turn(-1)}
                aria-label="앞 쪽으로"
              >
                <Icon name="back" size={22} />
              </button>
              <img className="book-nav__hint" src={CLASS.props.swipeHint} alt="" aria-hidden />
              <button
                type="button"
                className="book-nav__btn"
                onClick={() => turn(1)}
                aria-label="다음 쪽으로"
              >
                <Icon name="next" size={22} />
              </button>
            </div>

            <span className="pill-note">손으로 밀어서 넘겨볼까요?</span>
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
