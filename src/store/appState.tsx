import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { NativeLanguage, StorySceneRecord } from '@/api/types';
import { setHaptics } from '@/audio/haptics';
import { setNarration } from '@/audio/speaker';
import { forgetLastPoem } from '@/scenarios/data';
import { resetChildId } from '@/store/childId';
import { CATEGORY_ORDER, type CategoryId } from '@/scenarios/types';

/**
 * 앱이 기억하는 것 전부.
 *
 * 서버는 사용자를 저장하지 않는다 — DB 가 없고 무상태다. 닉네임·모국어·진행도·
 * 오늘의 기록은 전부 기기에 남고, 요청할 때마다 실어 보낸다.
 *
 * 저장은 localStorage 다. 시크릿 창이나 저장을 막은 브라우저에서는 읽기·쓰기가
 * 던질 수 있으므로 전부 try/catch 로 감싸고, 실패하면 "아직 아무것도 안 했다"와
 * 같게 다룬다 — 저장이 안 된다고 앱이 멈추면 안 된다.
 */

const KEY = 'zooearly.v1';

export type Profile = { nickname: string; nativeLanguage: NativeLanguage };

type Persisted = {
  profile: Profile | null;
  /** 오늘 마친 시나리오. 날짜가 바뀌면 비운다 — "오늘의" 학교생활이기 때문이다. */
  dateKey: string;
  completed: CategoryId[];
  scenes: Partial<Record<CategoryId, StorySceneRecord>>;
  /**
   * 보석 네 개를 다 모은 연출을 봤는가.
   *
   * 홈에 돌아올 때마다 다시 터지면 축하가 아니라 방해가 된다. 하루에 한 번만
   * 보여주고, 날짜가 바뀌면 진행도와 함께 비워진다.
   */
  unlockSeen: boolean;
  /**
   * 말풍선을 저절로 읽어줄 것인가.
   *
   * 기본은 켜짐 — 이 앱을 쓰는 아이는 한국어를 아직 못 읽는다는 전제로 만든다.
   * 끄는 자리는 교실처럼 여럿이 한 화면을 볼 때다. 하루가 지나도 남는다(취향이라서).
   */
  soundOn: boolean;
  /**
   * 며칠째 이어서 하고 있나.
   *
   * 세는 것은 **접속이 아니라 학교생활**이다. 앱을 열기만 한 날은 안 센다 —
   * 그러면 숫자가 "왔다" 를 세게 되고, 열었다 바로 끄는 날도 쌓인다.
   * 시나리오를 **하나라도** 마치면 그날은 한 일이 있는 것으로 본다.
   * 넷을 다 하라고 하면 문턱이 너무 높다.
   */
  streak: number;
  /** 마지막으로 하나라도 마친 날. 이 값과 오늘을 견줘 이어졌는지 본다 */
  streakDate: string | null;
};

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/** 그 날짜 키의 어제 */
function yesterdayOf(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const day = new Date(y, m - 1, d - 1);
  return `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
}

const EMPTY: Persisted = {
  profile: null,
  dateKey: todayKey(),
  completed: [],
  scenes: {},
  unlockSeen: false,
  soundOn: true,
  streak: 0,
  streakDate: null,
};

function read(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Persisted;
    // 날짜가 지났으면 진행도와 기록만 비운다. 프로필과 소리 설정은 취향이라 남긴다.
    if (parsed.dateKey !== todayKey()) {
      // 진행도만 비운다. 연속 기록은 **날짜가 바뀌어도 남아야** 한다 —
      // 여기서 같이 지우면 매일 아침 0이 되어 셀 수가 없다.
      return {
        ...EMPTY,
        profile: parsed.profile ?? null,
        soundOn: parsed.soundOn !== false,
        streak: typeof parsed.streak === 'number' ? parsed.streak : 0,
        streakDate: parsed.streakDate ?? null,
      };
    }
    return {
      profile: parsed.profile ?? null,
      dateKey: parsed.dateKey,
      completed: Array.isArray(parsed.completed) ? parsed.completed : [],
      scenes: parsed.scenes ?? {},
      unlockSeen: parsed.unlockSeen === true,
      // 저장된 적 없는(=예전 버전에서 온) 값은 켜짐으로 본다
      soundOn: parsed.soundOn !== false,
      streak: typeof parsed.streak === 'number' ? parsed.streak : 0,
      streakDate: parsed.streakDate ?? null,
    };
  } catch {
    return EMPTY;
  }
}

function write(state: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장 실패로 화면을 막지 않는다. 이번 세션 동안은 메모리에 그대로 남아 있다.
  }
}

type AppStateValue = {
  profile: Profile | null;
  completed: CategoryId[];
  /**
   * 며칠째 이어서 하고 있나. 아직 한 번도 안 했거나 끊겼으면 0 이다.
   *
   * 저장된 숫자를 그대로 주지 않는다 — 닷새 쉰 아이의 저장값에는 아직 예전
   * 숫자가 들어 있고, 그건 다음에 하나를 마칠 때 1로 되돌아간다. 그 사이에
   * 옛 숫자를 화면에 띄우면 이미 끊긴 기록을 살아 있는 것처럼 보여주게 된다.
   */
  streak: number;
  storyScenes: StorySceneRecord[] | null;
  saveProfile: (profile: Profile) => void;
  /** 시나리오를 마쳤을 때 진행도와 동화 기록을 함께 남긴다. */
  completeCategory: (category: CategoryId, scene: StorySceneRecord) => void;
  isCompleted: (category: CategoryId) => boolean;
  /** 앞 카테고리를 모두 마쳤는가. 등교하기는 언제나 열려 있다. */
  isUnlocked: (category: CategoryId) => boolean;
  /** 보석을 다 모은 연출을 아직 안 봤는가. 홈이 이 값으로 축하를 띄운다. */
  storyUnlockPending: boolean;
  markStoryUnlockSeen: () => void;
  /** 말풍선 자동 낭독. 끄면 말풍선은 조용히 뜨기만 한다. */
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
  resetDay: () => void;
  /**
   * 기기에 저장한 것을 전부 지운다 — 프로필까지.
   *
   * 시연이나 다음 아이에게 넘길 때 쓴다. 하루 기록만 지우는 resetDay 와 달리
   * 이름·모국어도 지워서 세계관 소개부터 다시 시작한다.
   */
  resetAll: () => void;
};

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(() => {
    const initial = read();
    // 첫 렌더 **전에** 맞춰둔다. 이 효과를 useEffect 로 미루면 자식(말풍선)의 효과가
    // 먼저 돌아, 소리를 꺼둔 사람이 첫 한마디를 듣게 된다.
    setNarration(initial.soundOn);
    setHaptics(initial.soundOn);
    return initial;
  });

  useEffect(() => {
    write(state);
  }, [state]);

  const saveProfile = useCallback((profile: Profile) => {
    setState((prev) => ({ ...prev, profile }));
  }, []);

  const completeCategory = useCallback((category: CategoryId, scene: StorySceneRecord) => {
    setState((prev) => {
      const today = todayKey();
      /*
       * 연속 기록은 **여기서** 올린다. 앱을 열 때가 아니라 하나를 마쳤을 때다.
       *
       * 하루에 여러 개를 마쳐도 한 번만 올라간다(streakDate 가 이미 오늘이면
       * 그대로 둔다). 어제 했으면 이어지고, 그보다 오래 쉬었으면 1일차로
       * 되돌아간다 — 주말을 건너뛰거나 하루를 봐주지 않는다.
       *
       * 그래서 월요일에는 대부분 1일차가 된다. 그렇게 하기로 정한 것이다.
       * 학교 가는 날만 세게 하려면 yesterdayOf 자리를 평일 계산으로 바꾸면 된다.
       */
      const streak =
        prev.streakDate === today
          ? prev.streak
          : prev.streakDate === yesterdayOf(today)
            ? prev.streak + 1
            : 1;

      return {
        ...prev,
        dateKey: today,
        completed: prev.completed.includes(category)
          ? prev.completed
          : [...prev.completed, category],
        scenes: { ...prev.scenes, [category]: scene },
        streak,
        streakDate: today,
      };
    });
  }, []);

  const markStoryUnlockSeen = useCallback(() => {
    setState((prev) => (prev.unlockSeen ? prev : { ...prev, unlockSeen: true }));
  }, []);

  const setSoundOn = useCallback((on: boolean) => {
    setState((prev) => (prev.soundOn === on ? prev : { ...prev, soundOn: on }));
  }, []);

  // 그 뒤의 변경을 따라간다. 소리 모듈은 리액트 밖에 있다 — 재생은 렌더와 무관하다.
  //
  // 진동도 같은 스위치를 따른다. 교실에서 소리를 끄는 사람이 바라는 것은
  // "조용해지는 것" 인데, 책상 위에서 붕붕대는 기기는 그 바람을 정면으로 어긴다.
  useEffect(() => {
    setNarration(state.soundOn);
    setHaptics(state.soundOn);
  }, [state.soundOn]);

  const resetDay = useCallback(() => {
    setState((prev) => ({
      ...EMPTY,
      dateKey: todayKey(),
      profile: prev.profile,
      soundOn: prev.soundOn,
    }));
  }, []);

  const resetAll = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // 저장소를 못 건드려도 아래 setState 로 이번 세션은 초기화된다
    }
    // 신원도 새로 만든다. 이걸 안 하면 다음 아이가 앞 아이의 동화 앨범을 열어보게 된다.
    resetChildId();
    // 앞 아이가 읽은 시 때문에 다음 아이의 첫 시가 좁혀질 이유는 없다.
    forgetLastPoem();
    setState({ ...EMPTY, dateKey: todayKey() });
  }, []);

  const value = useMemo<AppStateValue>(() => {
    const isCompleted = (category: CategoryId) => state.completed.includes(category);
    const allDone = CATEGORY_ORDER.every((c) => state.scenes[c]);
    /*
     * 오늘 했으면 살아 있고, 어제 했으면 오늘 이어갈 수 있으니 아직 살아 있다.
     * 그보다 오래됐으면 끊긴 것이라 0 으로 본다.
     */
    const today = todayKey();
    const alive = state.streakDate === today || state.streakDate === yesterdayOf(today);

    return {
      profile: state.profile,
      completed: state.completed,
      streak: alive ? state.streak : 0,
      // 4장면이 다 모여야 동화를 만들 수 있다. 하나라도 없으면 null 이다.
      storyScenes: allDone ? CATEGORY_ORDER.map((c) => state.scenes[c] as StorySceneRecord) : null,
      storyUnlockPending: allDone && !state.unlockSeen,
      markStoryUnlockSeen,
      soundOn: state.soundOn,
      setSoundOn,
      saveProfile,
      completeCategory,
      isCompleted,
      isUnlocked: (category) => {
        const index = CATEGORY_ORDER.indexOf(category);
        return index <= 0 || CATEGORY_ORDER.slice(0, index).every(isCompleted);
      },
      resetDay,
      resetAll,
    };
  }, [state, saveProfile, completeCategory, markStoryUnlockSeen, setSoundOn, resetDay, resetAll]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState 는 AppStateProvider 안에서만 쓴다.');
  return value;
}
