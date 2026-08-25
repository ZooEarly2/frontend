import { tts } from '@/api/endpoints';
import type { NativeLanguage } from '@/api/types';

/**
 * 문장 읽어주기.
 *
 * 기기 내장 TTS 만 쓰면 안 되는 이유가 있다 — 이 앱은 **모국어도 읽어줘야 한다.**
 * 베트남어·중국어 음성이 기기에 없으면 두 상자 중 모국어 쪽만 무음이 되고, 아이는
 * 설정에 들어가 언어팩을 받을 수도 없다. 그래서 소리는 서버에서 받는다.
 *
 * 다만 로컬 개발은 목(mock) 서버라 실제 음성 대신 차임이 온다. 그때만 브라우저
 * 음성합성으로 대신 읽어준다 — 화면을 눌러 확인할 때 실제로 말이 들려야 하기 때문이다.
 * 어느 쪽을 쓸지는 VITE_TTS_MODE 로 정한다.
 */

type Mode = 'auto' | 'server' | 'browser';
const MODE = ((import.meta.env.VITE_TTS_MODE as Mode) ?? 'auto') satisfies Mode;

const BCP47: Record<NativeLanguage, string> = {
  KOREAN: 'ko-KR',
  CHINESE: 'zh-CN',
  VIETNAMESE: 'vi-VN',
};

export type Voice = 'TEACHER' | 'FRIEND';

/**
 * 화면에 쓴 글자를 읽어줄 말로 다듬는다.
 *
 * 줄바꿈은 말풍선 모양을 위한 것이라 그대로 읽히면 문장 중간이 끊긴다.
 * 미리받기와 재생이 **같은 문자열**을 써야 캐시가 맞아떨어지므로 한 곳에 둔다.
 */
export function narrationText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 같은 문장을 두 번 이상 재생할 때 서버에 다시 묻지 않는다.
 * 스텝 문장은 고정 텍스트라 적중률이 높다 — ④에서 미리 받아두면 ⑤에서는 기다림이 없다.
 */
type Entry = { url: string | null; useBrowser: boolean };

/**
 * 결과가 아니라 **진행 중인 요청**을 담는다.
 *
 * 미리 받기(prefetch)와 탭이 겹치면 같은 문장을 두 번 부르게 된다 — 결과만 캐시하면
 * 첫 요청이 끝나기 전의 두 번째 호출이 캐시를 못 보기 때문이다. 요청 자체를 담아두면
 * 두 번째는 같은 약속을 기다린다.
 */
const cache = new Map<string, Promise<Entry>>();
const key = (text: string, language: NativeLanguage, voice: Voice) =>
  `${language}|${voice}|${text}`;

let current: HTMLAudioElement | null = null;

/**
 * 몇 번째 말인가.
 *
 * 멈추는 것만으로는 부족하다 — 소리를 **받아오는 중**인 요청은 아직 재생 중이
 * 아니라서 stopSpeaking 이 건드릴 것이 없고, 잠시 뒤 태연히 재생을 시작한다.
 * 그러면 두 목소리가 겹쳐 들린다. 새 말이 시작될 때마다 이 번호를 올려, 받아오던
 * 요청이 자기 차례가 지났는지 스스로 알 수 있게 한다.
 */
let generation = 0;

export function stopSpeaking() {
  generation += 1;
  if (current) {
    current.pause();
    current.currentTime = 0;
    current = null;
  }
  window.speechSynthesis?.cancel();
}

function browserVoiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const prefix = lang.split('-')[0];
  return (
    voices.find((v) => v.lang.replace('_', '-') === lang) ??
    voices.find((v) => v.lang.replace('_', '-').startsWith(prefix))
  );
}

function speakWithBrowser(text: string, language: NativeLanguage): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = BCP47[language];
    const voice = browserVoiceFor(utterance.lang);
    if (voice) utterance.voice = voice;
    // 만 5~8세가 따라 말할 수 있는 속도. 기본 속도로 읽으면 따라 하지 못한다.
    utterance.rate = 0.82;
    utterance.pitch = 1.15;
    utterance.addEventListener('end', () => resolve(), { once: true });
    utterance.addEventListener('error', () => resolve(), { once: true });
    synth.cancel();
    synth.speak(utterance);
  });
}

function load(text: string, language: NativeLanguage, voice: Voice): Promise<Entry> {
  const cacheKey = key(text, language, voice);
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  if (MODE === 'browser') {
    const entry = Promise.resolve<Entry>({ url: null, useBrowser: true });
    cache.set(cacheKey, entry);
    return entry;
  }

  const pending = tts(text, language, voice).then((result) => {
    const useBrowser = MODE === 'auto' && result.mock === true;
    return {
      url: useBrowser ? null : `data:audio/${result.audio.format};base64,${result.audio.data}`,
      useBrowser,
    } satisfies Entry;
  });
  // 실패한 요청을 캐시에 남겨두면 다시 눌러도 영영 실패한다. 실패하면 지운다.
  pending.catch(() => cache.delete(cacheKey));
  cache.set(cacheKey, pending);
  return pending;
}

/**
 * 미리 받아만 둔다. **재생하지 않는다.**
 *
 * 화면에 들어왔다고 소리가 저절로 나면 안 된다 — 목적은 탭한 뒤의 기다림을 없애는
 * 것이다. 실패해도 무시한다. 아이가 탭하는 순간 어차피 다시 시도한다.
 */
export function prefetch(text: string, language: NativeLanguage, voice: Voice = 'TEACHER') {
  if (!text.trim()) return;
  void load(text, language, voice).catch(() => undefined);
}

/**
 * 읽어준다. 아이가 🔊 를 탭했거나, 말풍선이 새로 떴을 때 부른다.
 *
 * ``'blocked'`` 은 브라우저가 자동재생을 막았다는 뜻이다 — 실패가 아니라
 * "아직 아무도 화면을 안 건드렸다"는 신호다. 부른 쪽이 첫 터치를 기다릴 수 있게
 * 구분해서 알려준다.
 */
export async function speak(
  text: string,
  language: NativeLanguage = 'KOREAN',
  voice: Voice = 'TEACHER',
): Promise<'ok' | 'blocked'> {
  if (!text.trim()) return 'ok';
  stopSpeaking();
  const mine = generation;

  let entry: Entry;
  try {
    entry = await load(text, language, voice);
  } catch {
    // 서버가 안 되면 브라우저 음성이라도 들려준다. 소리가 아예 안 나는 것보다 낫다.
    entry = { url: null, useBrowser: true };
  }

  // 받아오는 동안 다른 말이 시작됐다면 조용히 물러난다.
  if (mine !== generation) return 'ok';

  if (entry.useBrowser || !entry.url) {
    await speakWithBrowser(text, language);
    return 'ok';
  }

  return new Promise<'ok' | 'blocked'>((resolve) => {
    const audio = new Audio(entry.url as string);
    current = audio;
    audio.addEventListener('ended', () => resolve('ok'), { once: true });
    audio.addEventListener('error', () => resolve('ok'), { once: true });
    void audio.play().catch((error: unknown) => {
      const blocked = error instanceof DOMException && error.name === 'NotAllowedError';
      resolve(blocked ? 'blocked' : 'ok');
    });
  });
}

/** 여러 줄을 순서대로 읽는다. 시 낭독에서 지금 읽는 줄을 알려주는 데 쓴다. */
export async function speakLines(
  lines: string[],
  onLine: (index: number) => void,
  language: NativeLanguage = 'KOREAN',
): Promise<void> {
  for (let i = 0; i < lines.length; i += 1) {
    onLine(i);
    await speak(lines[i], language, 'TEACHER');
  }
  onLine(-1);
}

/* ── 자동 낭독 ───────────────────────────────────────
 *
 * 동물 캐릭터가 말풍선으로 하는 안내와 질문은 아이가 누르지 않아도 저절로 들린다.
 * **이 앱을 쓰는 아이는 한국어를 읽지 못한다는 전제로 만든다** — 글자만 띄우면
 * 안내가 전달되지 않는다. 말풍선이 뜨면 그 말이 그대로 소리로도 나가야 한다.
 */

/** 아이(혹은 선생님)가 소리를 꺼두었는가. 교실에서 여럿이 볼 때 쓴다. */
let narrationOn = true;

/** 지금 마이크가 열려 있는가. */
let micOpen = false;

/** 스플래시가 걷혔는가. */
let appReady = false;
const readyWaiters: Array<() => void> = [];

/**
 * 첫 화면이 아이에게 보이기 시작했다고 알린다.
 *
 * 스플래시는 첫 화면을 **덮고만** 있다(흰 화면이 끼지 않게 아래에 미리 그려둔다).
 * 그래서 말풍선도 스플래시 뒤에서 먼저 뜨는데, 그때 바로 읽어버리면 아이는
 * 아무것도 안 보이는 로딩 화면에서 목소리를 듣고, 화면이 열렸을 때는 말이
 * 이미 끝나 있다. 첫 한마디는 화면이 열린 뒤에 시작해야 한다.
 */
export function setAppReady() {
  appReady = true;
  while (readyWaiters.length) readyWaiters.shift()?.();
}

function whenReady(): Promise<void> {
  if (appReady) return Promise.resolve();
  return new Promise((resolve) => readyWaiters.push(resolve));
}

/**
 * 자동 낭독을 켜고 끈다.
 *
 * 끄면 말풍선은 조용히 뜨기만 한다. 🔊 를 직접 누른 것은 여전히 들린다 —
 * 끈 것은 "저절로 나는 소리"지 "소리" 자체가 아니다.
 */
export function setNarration(on: boolean) {
  narrationOn = on;
  if (!on) stopSpeaking();
}

/**
 * 마이크가 열린 동안에는 읽어주지 않는다.
 *
 * **스피커 소리가 그대로 녹음에 섞여 들어가기 때문이다.** 아이가 말하는 동안
 * "듣고 있어!" 를 읽어주면 그 목소리까지 채점 서버로 올라가 점수가 엉뚱해진다.
 * 화면마다 조심하는 대신 여기 한 곳에서 막는다.
 */
export function setMicOpen(open: boolean) {
  micOpen = open;
  if (open) stopSpeaking();
}

/**
 * 지금 읽어주기로 되어 있는 말. 자동재생이 막혔을 때 이 값이 그대로인지로
 * "아직 그 말풍선이 화면에 있는지"를 판단한다.
 */
let pendingLine: string | null = null;

/**
 * 말풍선이 새로 떴을 때 부른다. 탭한 게 아니므로 조건이 붙는다.
 *
 * 브라우저는 아이가 화면을 한 번 건드리기 전에는 소리를 내지 못하게 막는다.
 * 그때 그냥 넘기지 않고 **첫 터치가 오면 그 시점의 말풍선을 읽어준다.** 다만 그
 * 사이에 다음 말풍선으로 넘어갔다면 버린다 — 지난 말을 뒤늦게 읽으면 화면과
 * 소리가 어긋나 더 헷갈린다.
 */
export function announce(
  text: string,
  language: NativeLanguage = 'KOREAN',
  voice: Voice = 'TEACHER',
  /** 실제로 읽기 시작할 때. 말풍선의 "말하는 중" 표시가 이걸 기다린다. */
  onStart?: () => void,
): Promise<void> {
  const run = readAloud(text, language, voice, onStart);
  narrating = run.catch(() => undefined);
  return run;
}

/**
 * 읽어주기가 **잠잠해질 때까지.** 아무것도 안 읽고 있으면 곧 끝난다.
 *
 * 스스로 넘어가는 화면(칭찬·듣는 중)이 이걸 기다린다 — 칭찬을 반만 듣고 다음
 * 화면으로 넘어가면 아이는 무슨 말이었는지 모른 채 지나간다.
 *
 * 약속 하나를 붙잡아 기다리면 안 된다. 화면과 말풍선은 같은 갱신에서 함께 살아나고
 * 둘 중 누가 먼저 도는지는 리액트가 정하는데, 말풍선이 같은 갱신에서 읽기를 다시
 * 걸면(리액트는 효과를 두 번 돌릴 수 있다) 처음 잡아둔 약속은 밀려나 그 자리에서
 * 끝나버린다 — 기다린 것 같지만 실제로는 아무것도 안 기다린 셈이 된다.
 * 그래서 (1) 읽기가 걸릴 틈을 한 박자 주고 (2) 그 뒤로 바뀐 것까지 따라간다.
 */
export async function whenNarrationDone(graceMs = 150): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, graceMs));
  // 말이 꼬리를 물어도 끝나도록 횟수를 묶어둔다.
  for (let i = 0; i < 8; i += 1) {
    const current = narrating;
    await current;
    if (current === narrating) return;
  }
}

/** 읽고 있는 말. 끝나면 resolve 된다 — 실패해도 resolve 한다(기다리는 쪽을 가두지 않는다). */
let narrating: Promise<void> = Promise.resolve();

async function readAloud(
  text: string,
  language: NativeLanguage,
  voice: Voice,
  onStart?: () => void,
): Promise<void> {
  if (!narrationOn || micOpen || !text.trim()) return;
  const mine = text;
  pendingLine = mine;

  if (!appReady) {
    // 기다리는 동안 소리를 받아둔다 — 화면이 열리는 순간 바로 말이 나오게.
    prefetch(text, language, voice);
    await whenReady();
    // 그새 다른 말풍선으로 넘어갔으면 이 말은 흘려보낸다.
    if (pendingLine !== mine || !narrationOn || micOpen) return;
  }

  onStart?.();
  const result = await speak(text, language, voice);
  if (result !== 'blocked' || pendingLine !== mine) return;

  document.addEventListener(
    'click',
    () => {
      // 그 터치가 "다음"이었을 수 있다. 화면이 정리되고 나서 판단한다 —
      // 이 자리에서 바로 재생하면 이미 지나간 말풍선을 읽게 된다.
      setTimeout(() => {
        if (pendingLine === mine && narrationOn && !micOpen) void speak(text, language, voice);
      }, 60);
    },
    { once: true },
  );
}
