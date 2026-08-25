import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { getSentences } from '@/api/endpoints';
import type { NativeLanguage, PronunciationSentence, SentenceCategory } from '@/api/types';
import { BigButton, Character, SentenceBox, Thinking, TopBar } from '@/components';
import { Flag, Icon } from '@/components/Icon';
import { Gem } from '@/components/Gem';
import { Stage } from '@/components/Stage';
import { CATEGORY_GEM, CATEGORY_META } from '@/scenarios/data';
import { CATEGORY_ORDER, type CategoryId } from '@/scenarios/types';
import { useAppState } from '@/store/appState';
import { LANGUAGES } from './Onboarding';
import './screens.css';

/** 메뉴 — 서버를 부르지 않는다. 기기에 저장된 값만 보여준다. */
export function Menu() {
  const navigate = useNavigate();
  const { profile, completed, soundOn, setSoundOn, resetAll } = useAppState();

  return (
    <Stage mood="meadow">
      <TopBar title="메뉴" onBack={() => navigate('/home')} />
      <div className="scene-body">
        <div className="scroll">
          <div className="home__banner">
            <div className="home__banner-text">
              <p className="home__hello">{profile?.nickname}</p>
              <p className="home__sub">오늘 {completed.length}가지를 해냈어요</p>
            </div>
            <Character who="me" pose="happy" height={92} />
          </div>

          <div className="menu-list">
            <button type="button" className="menu-item" onClick={() => navigate('/menu/profile')}>
              <span className="menu-item__icon">
                <Icon name="person" size={22} />
              </span>
              <span style={{ flex: 1 }}>
                <span className="menu-item__title">내 정보 수정하기</span>
                <span className="menu-item__sub">이름과 집에서 쓰는 말을 바꿔요</span>
              </span>
              <Icon name="next" size={18} className="menu-item__chevron" />
            </button>

            <button type="button" className="menu-item" onClick={() => navigate('/menu/review')}>
              <span className="menu-item__icon">
                <Icon name="books" size={22} />
              </span>
              <span style={{ flex: 1 }}>
                <span className="menu-item__title">배운 문장 복습하기</span>
                <span className="menu-item__sub">연습한 문장을 다시 들어봐요</span>
              </span>
              <Icon name="next" size={18} className="menu-item__chevron" />
            </button>

            {/*
              읽어주기는 기본이 켜짐이다. 끄는 자리는 교실처럼 여럿이 한 화면을
              볼 때다 — 소리가 방해가 되는 상황을 위해 두는 것이지, 아이가 굳이
              찾아 켤 기능이 아니다.
            */}
            <button
              type="button"
              className="menu-item"
              aria-pressed={soundOn}
              onClick={() => setSoundOn(!soundOn)}
            >
              <span className="menu-item__icon">
                <Icon name={soundOn ? 'sound-on' : 'sound'} size={22} />
              </span>
              <span style={{ flex: 1 }}>
                <span className="menu-item__title">말풍선 읽어주기</span>
                <span className="menu-item__sub">
                  {soundOn ? '캐릭터가 하는 말을 소리로 들려줘요' : '지금은 글자로만 보여줘요'}
                </span>
              </span>
              <span className="switch" data-on={soundOn} aria-hidden>
                <span className="switch__knob" />
              </span>
            </button>
          </div>

          {/* 목록 두 줄뿐이라 아래가 휑하다. 선생님이 기다리는 그림으로 채운다 */}
          <div className="spacer" />
          <div style={{ display: 'grid', placeItems: 'center', paddingBottom: 4 }}>
            <Character who="teacher" pose="hello" height={150} />
          </div>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              resetAll();
              navigate('/', { replace: true });
            }}
          >
            처음부터 플레이하기
          </button>
        </div>
      </div>
    </Stage>
  );
}

/** 내 정보 수정 — 온보딩과 같은 값을 고치는 것뿐이다. */
export function ProfileEdit() {
  const navigate = useNavigate();
  const { profile, saveProfile } = useAppState();
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [language, setLanguage] = useState<NativeLanguage | null>(profile?.nativeLanguage ?? null);

  const trimmed = nickname.trim();
  const ready = trimmed.length > 0 && language !== null;

  return (
    <Stage mood="meadow">
      <TopBar title="내 정보 수정하기" onBack={() => navigate('/menu')} />
      <div className="scene-body">
        <div className="scroll">
          <div className="field">
            <label className="field__label" htmlFor="edit-nickname">
              뭐라고 부를까요?
            </label>
            <input
              id="edit-nickname"
              className="text-input"
              value={nickname}
              maxLength={20}
              onChange={(event) => setNickname(event.target.value.slice(0, 20))}
            />
          </div>

          <div className="field">
            <span className="field__label">집에서 쓰는 말은요?</span>
            <div className="lang-grid">
              {LANGUAGES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="lang-card"
                  data-selected={language === item.id}
                  onClick={() => setLanguage(item.id)}
                >
                  <Flag lang={item.id} />
                  <span className="lang-card__name">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="scene-footer">
          <BigButton
            disabled={!ready}
            onClick={() => {
              if (!ready || !language) return;
              saveProfile({ nickname: trimmed, nativeLanguage: language });
              navigate('/menu');
            }}
          >
            완료
          </BigButton>
        </div>
      </div>
    </Stage>
  );
}

/** 복습할 카테고리 고르기. */
export function ReviewList() {
  const navigate = useNavigate();
  return (
    <Stage mood="meadow">
      <TopBar title="배운 문장 복습하기" onBack={() => navigate('/menu')} />
      <div className="scene-body">
        <div className="scroll">
          {CATEGORY_ORDER.map((category) => (
            <button
              type="button"
              key={category}
              className="menu-item"
              onClick={() => navigate(`/menu/review/${category}`)}
            >
              {/* 카테고리 아이콘은 그 카테고리의 보석이다 — 홈에서 모으는 것과 같은 색 */}
              <span className="menu-item__icon">
                <Gem colors={CATEGORY_GEM[category]} size={24} />
              </span>
              <span style={{ flex: 1 }}>
                <span className="menu-item__title">{CATEGORY_META[category].title}</span>
                <span className="menu-item__sub">{CATEGORY_META[category].tagline}</span>
              </span>
              <Icon name="next" size={18} className="menu-item__chevron" />
            </button>
          ))}
        </div>
      </div>
    </Stage>
  );
}

const REVIEW_CATEGORY: Record<CategoryId, SentenceCategory> = {
  ARRIVAL: 'arrival',
  CLASS: 'study',
  LUNCH: 'lunch',
  DISMISSAL: 'departure',
};

/**
 * 카테고리별 문장 목록.
 *
 * 새 API 가 필요 없다 — 연습에 쓰는 문장 목록과 같은 것을 카테고리로 걸러 보여준다.
 * 시안에서는 읽기 전용이었지만, 여기서는 눌러 들을 수 있게 했다. 복습의 목적이
 * 소리를 다시 익히는 것이라 눌러서 들리는 편이 낫다고 봤다.
 */
export function ReviewCategory() {
  const navigate = useNavigate();
  const { category } = useParams<{ category: string }>();
  const [sentences, setSentences] = useState<PronunciationSentence[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getSentences(controller.signal)
      .then(setSentences)
      .catch((error) => {
        // StrictMode 가 이펙트를 두 번 돌리며 첫 요청을 끊는다. 그 취소를 실패로
        // 받으면 문장이 정상적으로 떠 있는데도 "불러오지 못했어요" 가 같이 남는다.
        if (error instanceof ApiError && error.code === 'CANCELLED') return;
        setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const meta = CATEGORY_META[category as CategoryId];
  const wanted = REVIEW_CATEGORY[category as CategoryId];
  const items = (sentences ?? []).filter((item) => item.category === wanted);

  return (
    <Stage mood="meadow">
      <TopBar title={meta?.title ?? '배운 문장'} onBack={() => navigate('/menu/review')} />
      <div className="scene-body">
        <div className="scroll">
          {!sentences && !failed ? (
            <div className="stage-center">
              <Thinking />
            </div>
          ) : null}
          {failed ? <p className="error-note">문장을 불러오지 못했어요.</p> : null}
          {items.map((item) => (
            <SentenceBox key={item.sentenceId} text={item.text} />
          ))}
        </div>
      </div>
    </Stage>
  );
}
