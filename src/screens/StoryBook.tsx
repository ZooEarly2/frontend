import { useEffect, useState } from 'react';
import type { Story, StoryScene, StorySceneCategory } from '@/api/types';
import { BigButton, Confetti, ProgressDots, TopBar } from '@/components';
import { Icon } from '@/components/Icon';
import { Stage } from '@/components/Stage';
import { announce, speak, stopSpeaking } from '@/audio/speaker';

/**
 * 동화책 한 권을 넘겨 읽는 화면.
 *
 * 오늘 막 만든 동화(`Story`)와 앨범에서 꺼낸 동화(`Album`)가 **같은 화면**으로
 * 읽혀야 한다. 두 곳에 따로 그리면 한쪽만 고쳐지고 아이는 두 개의 다른 동화책을
 * 보게 된다 — 그래서 그리는 일은 여기 한 곳에만 둔다.
 *
 * 삽화는 여기서 고른다. **번들 정적 그림**이라 앨범에는 그림을 저장하지 않고
 * 장면 정보만 남긴다.
 */

const ILLUSTRATION: Record<StorySceneCategory, string> = {
  school_arrival: '/scenes/story/fairytale_1.png',
  class: '/scenes/story/fairytale_2.png',
  lunch: '/scenes/story/fairytale_3.png',
  school_departure: '/scenes/story/fairytale_4.png',
};

/**
 * 수업시간은 과목까지 봐야 한다.
 *
 * **그림 안에 글자가 그려져 있다.** 국어 삽화의 칠판에는 "국어시간 / 동시
 * 읽어보기" 가, 수학 삽화에는 "수학시간 / 과일 개수 세기" 가 적혀 있다. 그래서
 * category 하나로 고르면 과일을 센 아이가 동시를 읽은 그림을 받는다 —
 * 동화가 글로는 바로잡혀도 그림이 계속 거짓말을 하고 있었다.
 *
 * 과목을 모르는 장면(수학이 생기기 전에 만든 동화)은 국어로 본다. 그때는 수업시간이
 * 동시 읽기 하나뿐이었으므로 그게 사실이다.
 */
const CLASS_MATH = '/scenes/story/fairytale_2_math.png';

function illustrationFor(scene: StoryScene): string {
  if (scene.category === 'class' && scene.classSubject === 'MATH') return CLASS_MATH;
  return ILLUSTRATION[scene.category];
}

const COVER = '/scenes/story/fairytale_pre.png';
const ENDING = '/scenes/story/fairytale_epi.png';

/**
 * 그 쪽에서 읽어줄 말.
 *
 * 아이가 오늘 실제로 한 말(`quote`)까지 읽는다. 저절로 읽어주는 화면에서
 * 화면에 떠 있는데 소리로 나오지 않는 줄이 있으면 그게 곧 빠뜨린 것이 된다.
 *
 * **소제목(`subtitle`)만 읽지 않는다.** "문앞에서" · "교실시간" 같은 말은 이야기의
 * 일부가 아니라 쪽 번호 옆에 붙은 이정표다. 읽어주면 매 쪽이 제목 낭독으로
 * 시작해서, 이어지던 이야기가 네 번 끊긴다 — 동화를 듣는 것이 아니라 목차를
 * 듣는 것이 된다. 눈으로는 보이는 편이 어디쯤 왔는지 알려주므로 화면에는 남긴다.
 */
export function narrationFor(story: Story, page: number, nickname: string): string {
  const total = story.scenes.length + 2;
  if (page === 0) {
    return `${story.title}. ${nickname}의 오늘 하루를 동화로 만들었어요. 한 장씩 넘겨볼까요?`;
  }
  if (page === total - 1) {
    return '오늘 이야기 끝! 내일은 또 어떤 이야기가 생길까요? 오늘도 정말 잘했어요.';
  }
  const scene = story.scenes[page - 1];
  const body = [scene.opening, scene.narration].filter(Boolean).join(' ');

  // 인용은 대개 내레이션 안에 이미 들어 있다("지우가 …라고 말했어요"). 그때 또 읽으면
  // 같은 말을 두 번 하는 셈이라, 안 들어 있을 때만 뒤에 붙인다.
  const quote = scene.quote?.trim();
  return quote && !bare(body).includes(bare(quote)) ? `${body} ${quote}` : body;
}

/** 견줘보기 위해 문장부호와 공백을 걷어낸다 — 같은 말인데 따옴표만 다를 수 있다. */
function bare(text: string): string {
  return text.replace(/[\s"'“”‘’!?.,~…]/g, '');
}

export function StoryBook({
  title,
  scenes,
  nickname,
  coverLine,
  onLeave,
  leaveLabel = '홈으로 돌아가기',
}: {
  title: string;
  scenes: StoryScene[];
  /** 표지에 넣을 이름. 앨범에서는 **그때 그 이름**이라 지금 프로필과 다를 수 있다. */
  nickname: string;
  /** 표지 둘째 줄. 앨범은 만든 날짜를 대신 보여준다. */
  coverLine?: string;
  onLeave: () => void;
  leaveLabel?: string;
}) {
  const [page, setPage] = useState(0); // 0 = 표지, 1..n = 장면, n+1 = 끝
  const story: Story = { title, scenes };

  const totalPages = scenes.length + 2;
  const isCover = page === 0;
  const isEnding = page === totalPages - 1;
  const scene = isCover || isEnding ? null : scenes[page - 1];
  const illustration = isCover ? COVER : isEnding ? ENDING : illustrationFor(scene!);
  const narration = narrationFor(story, page, nickname);

  /*
    쪽이 뜨면 저절로 읽어준다.

    글자를 아직 못 읽는 아이에게 동화책은 "읽어주는 것"이지 "읽는 것"이 아니다.
    쪽이 바뀌면 앞 장 내레이션은 멈춘다 — 겹쳐 들리면 둘 다 못 알아듣는다.
  */
  useEffect(() => {
    if (!narration) return undefined;
    void announce(narration, 'KOREAN', 'TEACHER');
    return () => stopSpeaking();
  }, [narration]);

  return (
    <Stage mood="paper">
      <TopBar
        title={title}
        onBack={() => (page === 0 ? onLeave() : setPage((p) => p - 1))}
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
              <p className="story-text__subtitle">{title}</p>
              <p className="story-text__body">
                {nickname}의 오늘 하루를 동화로 만들었어요.
                <br />
                {coverLine ?? '한 장씩 넘겨볼까요?'}
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
            <BigButton icon="home" onClick={onLeave}>
              {leaveLabel}
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
