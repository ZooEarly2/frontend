import { useCallback, useEffect, useRef, useState } from 'react';
import { StoryBook } from './StoryBook';
import { useNavigate } from 'react-router-dom';
import { ApiError, CHILD_FALLBACK } from '@/api/client';
import { saveAlbum, story as requestStory } from '@/api/endpoints';
import type { Story } from '@/api/types';
import {
  BigButton,
  Character,
  SpeechBubble,
  Thinking,
  TopBar,
} from '@/components';
import { Stage } from '@/components/Stage';
import { stopSpeaking } from '@/audio/speaker';
import { getChildId } from '@/store/childId';
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

export function StoryScreen() {
  const navigate = useNavigate();
  const { profile, storyScenes } = useAppState();

  const [story, setStory] = useState<Story | null>(null);
  const [failed, setFailed] = useState(false);
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
        if (!alive.current) return;
        setStory(result);
        /*
          앨범에 남긴다. **화면을 먼저 띄우고 나서** 부른다.

          저장을 기다렸다가 보여주면, 저장이 늦거나 실패하는 날 아이가 동화를
          아예 못 본다. 읽는 일과 남기는 일이 서로를 붙잡지 않게 떼어 놓는다 —
          실패해도 조용히 넘어가고, 아이 화면에는 아무 일도 일어나지 않는다.
        */
        void saveAlbum(getChildId(), profile.nickname, result).catch(() => undefined);
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

  // 그리는 일은 StoryBook 한 곳에 있다 — 앨범에서 꺼낸 동화와 같은 화면으로 읽혀야 한다.
  return (
    <StoryBook
      title={story.title}
      scenes={story.scenes}
      nickname={profile?.nickname ?? ''}
      onLeave={() => navigate('/home')}
    />
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
