import { useEffect } from 'react';
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
/**
 * 이번 세션에서 이미 축하한 연속 일수.
 *
 * 홈은 라우트라 시나리오에 다녀올 때마다 통째로 다시 만들어진다. 그래서 이 값을
 * 컴포넌트 안에 두면 홈에 올 때마다 배지가 튀고, 스토어에 두면 저장 파일이 는다.
 * 모듈에 두면 "오늘 하나를 마치고 돌아온 그 한 번" 만 잡히고 새로고침하면 잊는다 —
 * 잊어도 하루 한두 번이라 무한 반복이 아니다.
 */
let cheeredStreak = 0;

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
    streak,
  } = useAppState();
  const done = completed.length;
  const allDone = storyScenes !== null;

  /*
   * 숫자가 오른 그 한 번만 축하한다.
   *
   * `completed` 는 날짜가 바뀌면 비워지므로 `done > 0` 이 곧 "오늘 하나 이상
   * 마쳤다" 이고, 그 상태로 홈에 처음 돌아온 순간이 숫자가 오른 순간이다.
   * 스토어에 값을 더 넣지 않아도 된다.
   */
  const grew = streak > 0 && done > 0 && cheeredStreak !== streak;
  useEffect(() => {
    if (streak > 0 && done > 0) cheeredStreak = streak;
  }, [streak, done]);

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
            <p className="home__hello">
              {/*
                인사말과 이름을 한 덩어리로 감싼다. 안 감싸면 텍스트 노드가 익명
                flex 아이템이 돼 "안녕," 과 이름이 따로 놀 수 있다.
              */}
              <span className="home__hello-name">안녕, {profile?.nickname}!</span>
              {/*
                며칠째 이어서 하고 있나. 0 이면 아무것도 그리지 않는다 —
                "0일째" 는 실패를 적는 것이고, 끊겼다는 문구도 두지 않는다.
                다음에 하나를 마치면 조용히 1일째로 다시 나타난다.
              */}
              {streak > 0 ? (
                <span className="streak-chip" data-grew={grew}>
                  {/*
                    span 은 role=generic 이라 aria-label 을 읽어 줄지가 브라우저마다
                    다르다. 눈에 안 보이는 글로 따로 적어 준다.
                  */}
                  <span className="sr-only">{streak}일째 이어서 하고 있어요</span>
                  <span aria-hidden>
                    <span className="streak-chip__num">{streak}</span>일째
                  </span>
                </span>
              ) : null}
            </p>
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
