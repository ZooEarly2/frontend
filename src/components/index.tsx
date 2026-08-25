import { isValidElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { announce, narrationText, speak, stopSpeaking, type Voice } from '@/audio/speaker';
import type { NativeLanguage } from '@/api/types';
import { Icon, type IconName } from './Icon';
import './ui.css';

/* ── 캐릭터 ──────────────────────────────────────── */

/**
 * 다섯 가지 표정.
 *
 * 원본 시트에 그려진 다섯 포즈를 그대로 쓴다. 상황마다 다른 표정을 띄우는 것이
 * 이 앱에서 "지금 어떤 상태인가"를 아이에게 알리는 가장 빠른 방법이다 —
 * 글자를 읽지 못해도 표정은 읽는다.
 */
export type Pose = 'hello' | 'speak' | 'happy' | 'sad' | 'cheer';
export type Who = 'me' | 'teacher';

type CharacterProps = {
  who: Who;
  pose: Pose;
  /** 화면에서 차지할 높이(px) */
  height?: number;
  flip?: boolean;
  still?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export function Character({
  who,
  pose,
  height = 200,
  flip = false,
  still = false,
  className = '',
  style,
}: CharacterProps) {
  return (
    <img
      key={`${who}-${pose}`}
      src={`/characters/${who}-${pose}.png`}
      alt=""
      aria-hidden
      className={`actor actor--enter ${still ? 'actor--still' : ''} ${className}`}
      style={{ height, transform: flip ? 'scaleX(-1)' : undefined, ...style }}
    />
  );
}

/**
 * 상대 캐릭터(호랑이 친구·코끼리 선생님·급식 선생님 …).
 *
 * 원본이 모두 가슴에서 잘린 흉상이라 아래 단면을 지워서 그린다(`actor--bust`).
 * 그래서 이 컴포넌트는 **바로 아래에 카드나 목록이 오는 자리**에 놓아야 한다.
 * 화면 한가운데 홀로 띄우면 지워진 자리가 배경 위에 뜬다.
 */
export function PartnerActor({
  src,
  height = 190,
  className = '',
}: {
  src: string;
  height?: number;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className={`actor actor--partner actor--bust actor--enter ${className}`}
      style={{ height }}
    />
  );
}

/* ── 말풍선 ──────────────────────────────────────── */

/**
 * 말풍선 안의 글자만 뽑아낸다.
 *
 * 읽어줄 것은 글자지 화면 구조가 아니다. 자식이 문자열이 아닐 수도 있어
 * (여러 줄을 배열로 넘기거나 강조 태그를 섞는 경우) 재귀로 훑는다.
 */
function plainText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plainText).join('');
  if (isValidElement(node)) {
    return plainText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

export function SpeechBubble({
  children,
  tone = 'teacher',
  speaker,
  voice = 'TEACHER',
  say,
  narrate = true,
  className = '',
}: {
  children: ReactNode;
  tone?: 'teacher' | 'partner' | 'plain';
  /**
   * 말하는 사람 이름.
   *
   * 배경 그림 안의 인물이 말하는 화면에서 쓴다 — 그때는 말하는 캐릭터를 따로
   * 세우지 않아서(이미 그림에 있다) 이름표가 없으면 누가 한 말인지 알 수 없다.
   */
  speaker?: string;
  /** 어른(선생님·안내) 목소리인가, 또래 친구 목소리인가. */
  voice?: Voice;
  /** 화면에 쓴 글자와 읽어줄 말이 달라야 할 때만 준다. */
  say?: string;
  /**
   * 저절로 읽어줄 것인가.
   *
   * 기본은 읽는다 — 이 앱을 쓰는 아이는 한국어를 아직 못 읽는다는 전제로 만든다.
   * 끄는 경우는 소리가 방해가 되는 자리뿐이다.
   */
  narrate?: boolean;
  className?: string;
}) {
  const toneClass = tone === 'plain' ? '' : `bubble--${tone}`;
  const line = narrationText(say ?? plainText(children));
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!narrate || !line) return undefined;
    let alive = true;
    void announce(line, 'KOREAN', voice, () => alive && setSpeaking(true)).then(
      () => alive && setSpeaking(false),
    );
    return () => {
      alive = false;
      setSpeaking(false);
      // 말이 바뀌었는데 앞말이 계속 들리면 화면과 소리가 어긋난다.
      stopSpeaking();
    };
  }, [line, voice, narrate]);

  return (
    <div className={`bubble ${toneClass} ${className}`} data-speaking={speaking || undefined}>
      {speaker ? <span className="bubble__speaker">{speaker}</span> : null}
      {children}
      {/* 지금 이 말풍선이 말하는 중이라는 표시. 누르는 것이 아니라 알리는 것이다 */}
      {narrate && line ? (
        <span className="bubble__sound" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      ) : null}
    </div>
  );
}

/* ── 버튼 ────────────────────────────────────────── */

export function BigButton({
  children,
  onClick,
  icon,
  tone = 'coral',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  /** 이모지가 아니라 아이콘 이름이다 — 기기마다 다르게 뜨는 그림을 버튼에 넣지 않는다 */
  icon?: IconName;
  tone?: 'coral' | 'mint' | 'sky' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const toneClass = tone === 'coral' ? '' : `btn--${tone}`;
  return (
    <button type={type} className={`btn ${toneClass}`} onClick={onClick} disabled={disabled}>
      {icon ? <Icon name={icon} size={21} className="btn__icon" /> : null}
      {children}
    </button>
  );
}

/* ── 선택지 ──────────────────────────────────────── */

export function ChoiceCard({
  index,
  text,
  selected,
  onClick,
}: {
  index: number;
  text: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="choice" data-selected={selected} onClick={onClick}>
      <span className="choice__num" aria-hidden>
        {index + 1}
      </span>
      <span className="choice__text">{text}</span>
    </button>
  );
}

/* ── 문장 상자 ───────────────────────────────────── */

/**
 * 탭하면 읽어주는 문장 상자.
 *
 * **화면에 들어왔다고 저절로 소리가 나지 않는다.** 탭한 그 순간에만 재생한다 —
 * 자동 재생은 아이가 놀라고, 여러 화면이 겹치면 소리가 포개진다.
 */
export function SentenceBox({
  text,
  language = 'KOREAN',
  voice = 'TEACHER',
  highlight = [],
}: {
  text: string;
  language?: NativeLanguage;
  voice?: 'TEACHER' | 'FRIEND';
  /** 형광펜으로 짚어줄 어절 */
  highlight?: string[];
}) {
  const [playing, setPlaying] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const parts = useMemo(() => {
    if (highlight.length === 0) return null;
    const marks = new Set(highlight);
    return text.split(' ').map((word, i) => ({ word, marked: marks.has(word), key: `${word}-${i}` }));
  }, [text, highlight]);

  const onTap = async () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    await speak(text, language, voice);
    if (alive.current) setPlaying(false);
  };

  return (
    <button type="button" className="sentence-box" data-playing={playing} onClick={onTap}>
      <span className="speaker-chip" data-playing={playing} aria-hidden>
        <Icon name={playing ? 'sound-on' : 'sound'} size={22} />
      </span>
      <span className="sentence-box__text">
        {parts
          ? parts.map((part, i) => (
              <span key={part.key}>
                {i > 0 ? ' ' : ''}
                <span className={part.marked ? 'sentence-box__mark' : undefined}>{part.word}</span>
              </span>
            ))
          : text}
      </span>
      <span className="sr-only">눌러서 듣기</span>
    </button>
  );
}

/* ── 마이크 ──────────────────────────────────────── */

/** 녹음 중 막대 다섯 개의 기본 높이(%). 가운데가 가장 크게 움직인다. */
const WAVE_SHAPE = [0.45, 0.75, 1, 0.75, 0.45];

/** 30초 한도를 둘레로 보여주는 원의 반지름·둘레 */
const RING_R = 56;
const RING_C = 2 * Math.PI * RING_R;

export function MicButton({
  recording,
  level = 0,
  progress = 0,
  hint,
  disabled,
  onClick,
}: {
  recording: boolean;
  /** 0~1. 지금 들어오는 소리 크기 */
  level?: number;
  /** 0~1. 30초 한도 대비 진행률 */
  progress?: number;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="mic-wrap">
      <div className="mic-shell">
        {recording ? (
          <>
            <span className="mic__pulse" aria-hidden />
            <span className="mic__pulse mic__pulse--delay" aria-hidden />
            <span
              className="mic__halo"
              aria-hidden
              style={{ transform: `scale(${1 + level * 0.35})` }}
            />
            {/* 남은 시간. 다 차면 스스로 멈추므로 미리 보여준다 */}
            <svg className="mic__ring-track" viewBox="0 0 124 124" aria-hidden>
              <circle cx="62" cy="62" r={RING_R} />
            </svg>
            <svg className="mic__ring-value" viewBox="0 0 124 124" aria-hidden>
              <circle
                cx="62"
                cy="62"
                r={RING_R}
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - Math.min(1, progress))}
              />
            </svg>
          </>
        ) : null}

        <button
          type="button"
          className="mic"
          data-recording={recording}
          disabled={disabled}
          onClick={onClick}
          aria-label={recording ? '녹음 멈추기' : '녹음 시작하기'}
        >
          {recording ? (
            <span className="mic__wave" aria-hidden>
              {WAVE_SHAPE.map((weight, i) => (
                <i
                  key={i}
                  // 가만히 있어도 최소 높이는 남긴다 — 0이 되면 멈춘 것처럼 보인다
                  style={{ height: `${(0.22 + level * 0.78) * weight * 40 + 6}px` }}
                />
              ))}
            </span>
          ) : (
            <Icon name="mic" size={40} />
          )}
        </button>
      </div>
      {hint ? <span className="mic-hint">{hint}</span> : null}
    </div>
  );
}

/* ── 진행 점 ─────────────────────────────────────── */

export function ProgressDots({ total, index }: { total: number; index: number }) {
  return (
    <div className="dots" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="dots__dot" data-active={i === index} data-done={i < index} />
      ))}
    </div>
  );
}

/* ── 상단바 ─────────────────────────────────────── */

export function TopBar({
  title,
  onBack,
  right,
}: {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <div className="topbar">
      {onBack ? (
        <button type="button" className="topbar__btn" onClick={onBack} aria-label="뒤로 가기">
          <Icon name="back" size={20} />
        </button>
      ) : (
        <span style={{ width: 40 }} />
      )}
      <span className="topbar__title">{title}</span>
      {right ?? <span style={{ width: 40 }} />}
    </div>
  );
}

/* ── 생각 중 ─────────────────────────────────────── */

export function Thinking() {
  return (
    <span className="thinking" aria-label="기다리는 중">
      <span />
      <span />
      <span />
    </span>
  );
}

/* ── 빈칸 문장 ───────────────────────────────────── */

/**
 * "안녕! 나도 ＿＿ 반가워!" — targetIndex 번째 어절만 비운다.
 *
 * 빈칸 문장은 서버가 주지 않는다. 문장을 공백으로 나눠 앱이 직접 만든다.
 * 빈칸은 **하나만** 만든다 — 여러 개를 비우면 무엇을 말해야 할지 알 수 없다.
 */
export function BlankSentence({
  sentence,
  targetIndex,
  answer,
}: {
  sentence: string;
  targetIndex: number;
  answer?: string;
}) {
  const words = sentence.split(' ');
  return (
    <p className="blank-line">
      {words.map((word, i) =>
        i === targetIndex ? (
          <span key={`slot-${i}`} className="blank-slot" data-filled={Boolean(answer)}>
            {answer ?? '?'}
          </span>
        ) : (
          <span key={`w-${i}`}>{word}</span>
        ),
      )}
    </p>
  );
}

/* ── 반짝이 ─────────────────────────────────────── */

const CONFETTI_COLORS = ['#F2A0A8', '#FFD36E', '#7FD1C1', '#A9D6F5', '#C3AEF0'];

/** 잘했을 때만 뿌린다. 자주 쓰면 특별하지 않게 된다. */
export function Confetti({ pieces = 26 }: { pieces?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        key: i,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 0.7}s`,
        duration: `${1.8 + Math.random() * 1.4}s`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [pieces],
  );
  return (
    <div className="confetti" aria-hidden>
      {bits.map((bit) => (
        <i
          key={bit.key}
          style={{
            left: bit.left,
            background: bit.color,
            animationDelay: bit.delay,
            animationDuration: bit.duration,
          }}
        />
      ))}
    </div>
  );
}
