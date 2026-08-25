import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, CHILD_FALLBACK } from '@/api/client';
import { getSentences, pronunciation, type RecordingFile } from '@/api/endpoints';
import type { PronunciationResult, PronunciationSentence } from '@/api/types';
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
import { Gem } from '@/components/Gem';
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
import { CATEGORY_GEM, DIALOGUE_SCENARIOS } from '@/scenarios/data';
import type { CategoryId } from '@/scenarios/types';
import { useAppState } from '@/store/appState';
import './screens.css';

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
  const { completeCategory } = useAppState();

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

  const alive = useRef(true);
  const abort = useRef<AbortController | null>(null);

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

  const choices = useMemo(() => {
    if (!scenario) return [];
    const fromServer = (sentences ?? []).filter((s) => s.category === scenario.sentenceCategory);
    if (fromServer.length > 0) return fromServer;
    return scenario.fallbackChoices.map((text, i) => ({
      sentenceId: '',
      category: scenario.sentenceCategory,
      text,
      // 목록을 못 받은 경우다. id 가 없으므로 채점 단계에서 걸러진다.
      __fallback: i,
    })) as PronunciationSentence[];
  }, [scenario, sentences]);

  const run = useCallback(async <T,>(task: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setNotice(null);
    try {
      return await task(controller.signal);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CANCELLED') return null;
      // 아이에게는 항상 같은 말만 한다. 코드도, "오류"도 보여주지 않는다.
      if (alive.current) setNotice(CHILD_FALLBACK);
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
        setStep('PRAISE');
        return;
      }
      setScore(result);
      // 잘함/못함 판정은 서버가 한다. 앱은 targetWord 가 null 인지만 본다.
      setStep(result.targetWord === null ? 'PRAISE' : 'QUIZ');
    },
    [chosen, run],
  );

  const recorder = useRecorder(onRepeatRecorded);

  // 칭찬·듣는 중 화면은 버튼이 없다 — 읽어주기가 끝나면 스스로 넘어간다.
  useEffect(() => {
    if (step !== 'PRAISE' && step !== 'QUIZ_LISTENING') return;
    const next: Step = step === 'QUIZ_LISTENING' ? 'ANSWER' : 'COMPLETE';
    // 칭찬은 다 들려주면 끝이지만, "듣고 있어!" 는 그 뒤가 아이 차례다.
    const speakingTime = step === 'QUIZ_LISTENING' ? SPEAKING_WINDOW_MS : 0;
    let cancelled = false;
    setMyTurn(false);

    void holdUntilSpoken()
      .then(() => {
        if (cancelled || !alive.current) return undefined;
        // 물음을 다 읽어준 지금부터가 아이 시간이다. 그때 남은 시간을 보여준다.
        if (speakingTime) setMyTurn(true);
        return new Promise<void>((resolve) => window.setTimeout(resolve, speakingTime));
      })
      .then(() => {
        if (!cancelled && alive.current) setStep(next);
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
      // 아이가 실제로 고른 문장만 담는다. 목표 문장으로 대신 채우지 않는다.
      childSaid: chosen?.text ?? null,
      practicedWord: score?.targetWord ?? null,
    });
  }, [step, scenario, chosen, score, completeCategory]);

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

      {step === 'PRAISE' || step === 'ANSWER' || step === 'COMPLETE' ? <Confetti /> : null}

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
              {micBlocked ? (
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
                <SpeechBubble tone="teacher">
                  {step === 'QUIZ_LISTENING'
                    ? '듣고 있어!'
                    : step === 'ANSWER'
                      ? '잘했어!'
                      : '빈칸에 들어갈 말을 말해줄래?'}
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
              </div>
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
            <div className="stage-center">
              {/* 완료 배경은 아이가 해낸 장면을 그린 축하 그림이다. 그 위에 글자만
                  얹으면 밝은 부분에서 안 읽혀, 카드에 담아 아래쪽에 놓는다 */}
              <div className="spacer" />
              <div className="gem-reward">
                <Gem colors={CATEGORY_GEM[scenario.id]} size={56} />
              </div>
              <div className="card" style={{ width: '100%' }}>
                <p className="title">{scenario.completeTitle}</p>
                <p className="lead" style={{ marginTop: 6 }}>
                  보석을 하나 받았어요! {scenario.completeHint}
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
