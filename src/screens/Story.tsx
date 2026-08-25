import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, CHILD_FALLBACK } from '@/api/client';
import { story as requestStory } from '@/api/endpoints';
import type { Story, StorySceneCategory } from '@/api/types';
import {
  BigButton,
  Character,
  Confetti,
  ProgressDots,
  SpeechBubble,
  Thinking,
  TopBar,
} from '@/components';
import { Icon } from '@/components/Icon';
import { Stage } from '@/components/Stage';
import { announce, speak, stopSpeaking } from '@/audio/speaker';
import { useAppState } from '@/store/appState';
import './screens.css';

/**
 * 동화 — 오늘 한 일 전부를 한 번에 보내 이야기로 받는다.
 *
 * 다른 화면과 결정적으로 다르다. 서버는 아무것도 기억하지 않으므로(무상태),
 * 등교에서 무슨 말을 골랐는지 서버는 모른다. 앱이 하루를 진행하며 4장면을 쌓아뒀다가
 * 여기서 한 번에 보낸다.
 *
 * 4장면을 한 번에 생성해 **최대 60초**까지 걸린다. 그래서 로딩 화면이 필수다 —
 * 아이가 아무것도 없는 화면을 보고 기다리게 두면 안 된다.
 *
 * 화면은 그림책 한 쪽처럼 짠다. 바탕은 종이로 비우고 삽화는 카드 안에서 한 번만
 * 보여준다 — 배경에도 같은 그림을 깔면 두 겹이 되어 글자를 읽기 어렵다.
 */

const ILLUSTRATION: Record<StorySceneCategory, string> = {
  school_arrival: '/scenes/story/fairytale_1.png',
  class: '/scenes/story/fairytale_2.png',
  lunch: '/scenes/story/fairytale_3.png',
  school_departure: '/scenes/story/fairytale_4.png',
};

const COVER = '/scenes/story/fairytale_pre.png';
const ENDING = '/scenes/story/fairytale_epi.png';

/**
 * 그 쪽에서 읽어줄 말.
 *
 * 화면에 보이는 글을 **빠짐없이** 읽는다 — 소제목도, 아이가 오늘 실제로 한 말
 * (`quote`)도. 눌러서 듣던 때는 줄거리만 읽어도 됐지만, 저절로 읽어주는 지금은
 * 화면에 떠 있는데 소리로 나오지 않는 줄이 있으면 그게 곧 빠뜨린 것이 된다.
 */
function narrationFor(story: Story, page: number, nickname: string): string {
  const total = story.scenes.length + 2;
  if (page === 0) {
    return `${story.title}. ${nickname}의 오늘 하루를 동화로 만들었어요. 한 장씩 넘겨볼까요?`;
  }
  if (page === total - 1) {
    return '오늘 이야기 끝! 내일은 또 어떤 이야기가 생길까요? 오늘도 정말 잘했어요.';
  }
  const scene = story.scenes[page - 1];
  const body = [scene.subtitle, scene.opening, scene.narration].filter(Boolean).join(' ');

  // 인용은 대개 내레이션 안에 이미 들어 있다("지우가 …라고 말했어요"). 그때 또 읽으면
  // 같은 말을 두 번 하는 셈이라, 안 들어 있을 때만 뒤에 붙인다.
  const quote = scene.quote?.trim();
  return quote && !bare(body).includes(bare(quote)) ? `${body} ${quote}` : body;
}

/** 견줘보기 위해 문장부호와 공백을 걷어낸다 — 같은 말인데 따옴표만 다를 수 있다. */
function bare(text: string): string {
  return text.replace(/[\s\u0022\u0027\u201C\u201D\u2018\u2019!?.,~\u2026]/g, '');
}

export function StoryScreen() {
  const navigate = useNavigate();
  const { profile, storyScenes } = useAppState();

  const [story, setStory] = useState<Story | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(0); // 0 = 표지, 1..n = 장면, n+1 = 끝
  const alive = useRef(true);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    if (!profile || !storyScenes) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setFailed(false);
    setStory(null);
    requestStory(profile.nickname, storyScenes, controller.signal)
      .then((result) => {
        if (alive.current) setStory(result);
      })
      .catch((error) => {
        if (error instanceof ApiError && error.code === 'CANCELLED') return;
        if (alive.current) setFailed(true);
      });
  }, [profile, storyScenes]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      abort.current?.abort();
      stopSpeaking();
    };
  }, [load]);

  /** 이 쪽에서 읽어줄 말. 화면에 떠 있는 글을 그대로 읽는다. */
  const narration = story ? narrationFor(story, page, profile?.nickname ?? '') : null;

  /*
    동화는 **만들어지는 즉시, 쪽을 넘길 때마다 저절로** 읽어준다.

    글자를 아직 못 읽는 아이에게 동화책은 "읽어주는 것"이지 "읽는 것"이 아니다.
    눌러야 소리가 나면 하루를 마친 이야기를 끝내 못 듣고 넘긴다.

    쪽이 바뀌면 앞 장 내레이션은 멈춘다 — 겹쳐 들리면 둘 다 못 알아듣는다.
  */
  useEffect(() => {
    if (!narration) return undefined;
    void announce(narration, 'KOREAN', 'TEACHER');
    return () => stopSpeaking();
  }, [narration]);

  if (!storyScenes) {
    // 홈에서 잠가두지만 주소로 바로 들어올 수 있다.
    return (
      <Stage mood="paper">
        <TopBar title="오늘의 동화" onBack={() => navigate('/home')} />
        <div className="scene-body">
          <div className="stage-center">
            <Character who="teacher" pose="sad" height={180} />
            <p className="subtitle">{'아직 오늘 이야기가 모자라요.\n네 가지를 모두 해볼까요?'}</p>
          </div>
          <div className="scene-footer">
            <BigButton onClick={() => navigate('/home')}>홈으로 돌아가기</BigButton>
          </div>
        </div>
      </Stage>
    );
  }

  if (failed) {
    return (
      <Stage mood="paper">
        <TopBar title="오늘의 동화" onBack={() => navigate('/home')} />
        <div className="scene-body">
          <div className="stage-center">
            <Character who="teacher" pose="sad" height={180} />
            <p className="subtitle">{CHILD_FALLBACK}</p>
          </div>
          <div className="scene-footer">
            <BigButton icon="replay" onClick={load}>
              다시 만들어 볼까요?
            </BigButton>
            <BigButton tone="ghost" onClick={() => navigate('/home')}>
              홈으로 돌아가기
            </BigButton>
          </div>
        </div>
      </Stage>
    );
  }

  if (!story) return <StoryLoading />;

  const totalPages = story.scenes.length + 2;
  const isCover = page === 0;
  const isEnding = page === totalPages - 1;
  const scene = isCover || isEnding ? null : story.scenes[page - 1];
  const illustration = isCover ? COVER : isEnding ? ENDING : ILLUSTRATION[scene!.category];

  return (
    <Stage mood="paper">
      <TopBar
        title={story.title}
        onBack={() => (page === 0 ? navigate('/home') : setPage((p) => p - 1))}
        right={
          <button
            type="button"
            className="topbar__btn"
            onClick={() => narration && void speak(narration, 'KOREAN', 'TEACHER')}
            aria-label="읽어주기"
          >
            <Icon name="sound" size={20} />
          </button>
        }
      />

      {isEnding ? <Confetti pieces={34} /> : null}

      <div className="scene-body">
        <div className="story-page">
          {/* 삽화는 여기 한 곳에만 있다. 배경은 종이로 비워 뒀다 */}
          <div
            className="story-illust"
            style={{ backgroundImage: `url(${illustration})` }}
            aria-hidden
          />

          {isCover ? (
            <div className="story-text story-text--center">
              <p className="story-text__subtitle">{story.title}</p>
              <p className="story-text__body">
                {profile?.nickname}의 오늘 하루를 동화로 만들었어요.
                <br />한 장씩 넘겨볼까요?
              </p>
            </div>
          ) : isEnding ? (
            <div className="story-text story-text--center">
              <p className="story-text__subtitle">오늘 이야기 끝!</p>
              <p className="story-text__body">
                내일은 또 어떤 이야기가 생길까요?
                <br />
                오늘도 정말 잘했어요.
              </p>
            </div>
          ) : (
            <div className="story-text">
              <p className="story-text__subtitle">
                <span className="story-text__no" aria-hidden>
                  {page}
                </span>
                {scene!.subtitle}
              </p>
              <p className="story-text__body">
                {scene!.opening} {scene!.narration}
              </p>
              {scene!.quote ? <p className="story-text__quote">“{scene!.quote}”</p> : null}
            </div>
          )}

          <ProgressDots total={totalPages} index={page} />

          {isEnding ? (
            <BigButton icon="home" onClick={() => navigate('/home')}>
              홈으로 돌아가기
            </BigButton>
          ) : (
            <BigButton onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
              다음 장
            </BigButton>
          )}
        </div>
      </div>
    </Stage>
  );
}

/** 최대 60초를 기다린다 — 기다리는 동안 무엇이 일어나는지 보여준다. */
function StoryLoading() {
  return (
    <Stage mood="paper">
      <TopBar title="오늘의 동화" />
      <div className="scene-body">
        <div className="stage-center">
          <SpeechBubble tone="teacher">{'오늘 이야기를\n동화로 쓰고 있어요!'}</SpeechBubble>
          <Character who="teacher" pose="speak" height={200} />
          <Thinking />
          <p className="caption">조금만 기다려 주세요</p>
        </div>
      </div>
    </Stage>
  );
}
