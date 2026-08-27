import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, CHILD_FALLBACK } from '@/api/client';
import { getAlbum, listAlbums } from '@/api/endpoints';
import type { AlbumDetail, AlbumSummary, StorySceneCategory } from '@/api/types';
import { BigButton, Character, Thinking, TopBar } from '@/components';
import { Gem } from '@/components/Gem';
import { Stage } from '@/components/Stage';
import { CATEGORY_GEM } from '@/scenarios/data';
import type { CategoryId } from '@/scenarios/types';
import { getChildId } from '@/store/childId';
import { StoryBook } from './StoryBook';
import './screens.css';

/**
 * 내 동화 앨범.
 *
 * 하루를 마칠 때마다 동화가 한 편씩 쌓인다. 아이에게 이 화면은 "내가 해낸 날들"의
 * 목록이라, 날짜보다 **표지와 보석**이 먼저 눈에 들어오게 짠다 — 글자를 아직 못
 * 읽어도 색이 다른 보석 네 개를 보고 그날을 알아본다.
 *
 * 동화를 읽는 화면은 오늘 만든 것과 **똑같아야 한다.** 그래서 여기서 따로 그리지
 * 않고 StoryBook 을 그대로 쓴다.
 */

/** 동화 장면 종류를 홈·보석과 같은 색으로 잇는다. */
const GEM_OF: Record<StorySceneCategory, CategoryId> = {
  school_arrival: 'ARRIVAL',
  class: 'CLASS',
  lunch: 'LUNCH',
  school_departure: 'DISMISSAL',
};

/** 2026-08-27T... → 8월 27일 */
function korDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function AlbumList() {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<AlbumSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setFailed(false);
    setAlbums(null);
    listAlbums(getChildId(), controller.signal)
      .then((result) => alive.current && setAlbums(result))
      .catch((error) => {
        if (error instanceof ApiError && error.code === 'CANCELLED') return;
        if (alive.current) setFailed(true);
      });
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, [load]);

  return (
    <Stage mood="paper">
      <TopBar title="내 동화 앨범" onBack={() => navigate('/menu')} />
      <div className="scene-body">
        <div className="scroll">
          {albums === null && !failed ? (
            <div className="stage-center">
              <Character who="teacher" pose="hello" height={150} />
              <span className="pill-note">
                앨범을 펼치는 중 <Thinking />
              </span>
            </div>
          ) : failed ? (
            <div className="stage-center">
              <Character who="teacher" pose="sad" height={160} />
              <p className="subtitle">{CHILD_FALLBACK}</p>
              <BigButton icon="replay" onClick={load}>
                다시 열어볼까요?
              </BigButton>
            </div>
          ) : albums!.length === 0 ? (
            <div className="stage-center">
              <Character who="me" pose="hello" height={170} />
              <p className="subtitle">{'아직 동화가 없어요.\n오늘 네 가지를 다 해내면\n한 편이 만들어져요!'}</p>
              <BigButton icon="backpack" onClick={() => navigate('/home')}>
                학교 가볼래요
              </BigButton>
            </div>
          ) : (
            <div className="album-list">
              {albums!.map((album) => (
                <button
                  type="button"
                  key={album.id}
                  className="album-card"
                  onClick={() => navigate(`/menu/album/${album.id}`)}
                >
                  <span className="album-card__cover" aria-hidden />
                  <span className="album-card__text">
                    <span className="album-card__date">{korDate(album.createdAt)}</span>
                    <span className="album-card__title">{album.title}</span>
                    <span className="album-card__gems">
                      {album.categories.map((category, index) => (
                        <Gem
                          key={`${category}-${index}`}
                          colors={CATEGORY_GEM[GEM_OF[category]]}
                          size={16}
                        />
                      ))}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Stage>
  );
}

/** 앨범에서 꺼낸 동화 한 편. 오늘 만든 동화와 같은 화면으로 읽힌다. */
export function AlbumStory() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    const albumId = Number(id);
    if (!Number.isFinite(albumId)) {
      setFailed(true);
    } else {
      getAlbum(albumId, getChildId(), controller.signal)
        .then((result) => alive.current && setAlbum(result))
        .catch((error) => {
          if (error instanceof ApiError && error.code === 'CANCELLED') return;
          if (alive.current) setFailed(true);
        });
    }
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [id]);

  if (failed) {
    return (
      <Stage mood="paper">
        <TopBar title="내 동화 앨범" onBack={() => navigate('/menu/album')} />
        <div className="scene-body">
          <div className="stage-center">
            <Character who="teacher" pose="sad" height={170} />
            <p className="subtitle">{'이 동화를 찾지 못했어요.'}</p>
            <BigButton onClick={() => navigate('/menu/album')}>앨범으로 돌아가기</BigButton>
          </div>
        </div>
      </Stage>
    );
  }

  if (!album) {
    return (
      <Stage mood="paper">
        <TopBar title="내 동화 앨범" onBack={() => navigate('/menu/album')} />
        <div className="scene-body">
          <div className="stage-center">
            <Character who="teacher" pose="hello" height={150} />
            <span className="pill-note">
              동화를 꺼내는 중 <Thinking />
            </span>
          </div>
        </div>
      </Stage>
    );
  }

  return (
    <StoryBook
      title={album.title}
      scenes={album.scenes}
      /* 그때 그 이름으로 읽어준다 — 이름을 바꿨어도 옛 동화의 표지는 그대로다 */
      nickname={album.nickname}
      coverLine={`${korDate(album.createdAt)}의 이야기예요.`}
      onLeave={() => navigate('/menu/album')}
      leaveLabel="앨범으로 돌아가기"
    />
  );
}
