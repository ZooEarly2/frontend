import { useNavigate } from 'react-router-dom';
import { Character, TopBar } from '@/components';
import { Icon } from '@/components/Icon';
import { Gem } from '@/components/Gem';
import { Stage } from '@/components/Stage';
import { StoryUnlock } from './StoryUnlock';
import { CATEGORY_GEM, CATEGORY_META, CATEGORY_THUMB } from '@/scenarios/data';
import { CATEGORY_ORDER, type CategoryId } from '@/scenarios/types';
import { useAppState } from '@/store/appState';
import './screens.css';

/**
 * 홈 — 오늘의 학교생활.
 *
 * 네 카테고리를 **순서대로** 연다. 하루의 흐름(등교 → 수업 → 급식 → 하교)이 그대로
 * 동화의 장면 순서가 되기 때문에, 순서를 건너뛰면 동화를 만들 재료가 비게 된다.
 *
 * 마친 카테고리마다 색이 다른 보석이 하나씩 켜진다. 네 개를 다 모으면 동화가 열린다.
 *
 * 이 화면은 서버를 부르지 않는다. 진행 상태는 전부 기기에 있다.
 */
export function Home() {
  const navigate = useNavigate();
  const {
    profile,
    completed,
    storyScenes,
    isCompleted,
    isUnlocked,
    storyUnlockPending,
    markStoryUnlockSeen,
    resetAll,
  } = useAppState();
  const done = completed.length;
  const allDone = storyScenes !== null;

  const restart = () => {
    resetAll();
    navigate('/', { replace: true });
  };

  return (
    <Stage mood="sky">
      {/*
        보석 네 개를 다 모으고 홈으로 돌아온 그 한 번. 하루의 마지막 보상이라
        조용히 버튼만 켜지게 두지 않는다. 본 뒤에는 다시 뜨지 않는다.
      */}
      {storyUnlockPending ? (
        <StoryUnlock
          onGo={() => {
            markStoryUnlockSeen();
            navigate('/story');
          }}
          onClose={markStoryUnlockSeen}
        />
      ) : null}

      <TopBar
        title="오늘의 학교생활"
        right={
          <button
            type="button"
            className="topbar__btn"
            onClick={() => navigate('/menu')}
            aria-label="메뉴 열기"
          >
            <Icon name="menu" size={20} />
          </button>
        }
      />

      <div className="home">
        <div className="home__banner">
          <div className="home__banner-text">
            {/*
              "{이름}야" 처럼 조사를 붙이지 않는다. 이 앱을 쓰는 아이의 이름은 한국
              이름만이 아니다 — 경빈이면 "경빈아", Linh 면 조사 자체가 어색하다.
              부르는 말을 앞에 두면 어떤 이름에도 걸리지 않는다.
            */}
            <p className="home__hello">안녕, {profile?.nickname}!</p>
            <p className="home__sub">
              {allDone ? '보석을 모두 모았어요!' : `보석 ${done}개를 모았어요`}
            </p>
            {/* 빈 자리를 남겨 몇 개가 더 필요한지 세게 한다 */}
            <div className="gem-track" aria-label={`보석 ${done}개 / 4개`}>
              {CATEGORY_ORDER.map((category) => (
                <Gem
                  key={category}
                  colors={CATEGORY_GEM[category]}
                  size={26}
                  empty={!isCompleted(category)}
                />
              ))}
            </div>
          </div>
          <div className="home__banner-actor">
            <Character who="me" pose={allDone ? 'cheer' : 'hello'} height={104} />
          </div>
        </div>

        <div className="cards">
          {CATEGORY_ORDER.map((category) => (
            <ScenarioCard
              key={category}
              category={category}
              done={isCompleted(category)}
              locked={!isUnlocked(category)}
              onClick={() => navigate(`/play/${category}`)}
            />
          ))}
        </div>

        <button
          type="button"
          className="story-cta"
          data-unlocked={allDone}
          disabled={!allDone}
          onClick={() => navigate('/story')}
        >
          <img className="story-cta__book" src="/scenes/story/fairytale_pre.png" alt="" aria-hidden />
          <div style={{ flex: 1 }}>
            <p className="scenario-card__title">오늘의 동화 만들기</p>
            <p className="scenario-card__tag">
              {allDone ? '오늘 있었던 일로 동화를 써줄게요' : '보석 네 개를 모으면 열려요'}
            </p>
          </div>
          <span className="scenario-card__badge">
            <Icon name={allDone ? 'book' : 'lock'} size={22} />
          </span>
        </button>

        <div className="spacer" />

        {/*
          시연이나 다음 아이에게 넘길 때 쓴다. 저장한 것을 전부 지우고 세계관 소개부터
          다시 시작한다. 아이가 실수로 누르지 않게 작고 눈에 띄지 않는 자리에 둔다.
        */}
        <button type="button" className="text-link" onClick={restart}>
          처음부터 플레이하기
        </button>
      </div>
    </Stage>
  );
}

function ScenarioCard({
  category,
  done,
  locked,
  onClick,
}: {
  category: CategoryId;
  done: boolean;
  locked: boolean;
  onClick: () => void;
}) {
  const meta = CATEGORY_META[category];
  return (
    <button
      type="button"
      className="scenario-card"
      data-done={done}
      disabled={locked}
      onClick={onClick}
    >
      <span
        className="scenario-card__thumb"
        style={{ backgroundImage: `url(${CATEGORY_THUMB[category]})` }}
        aria-hidden
      />
      <span className="scenario-card__body">
        <span className="scenario-card__title">{meta.title}</span>
        <span className="scenario-card__tag">
          {locked ? '앞 단계를 먼저 해요' : done ? '보석을 받았어요' : meta.tagline}
        </span>
      </span>
      <span className="scenario-card__badge">
        {done ? (
          <span className="gem-badge">
            <Gem colors={CATEGORY_GEM[category]} size={26} />
          </span>
        ) : (
          <Icon name={locked ? 'lock' : 'play'} size={22} />
        )}
      </span>
    </button>
  );
}
