import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { narrationText, prefetch } from '@/audio/speaker';
import { BigButton, PartnerActor, SpeechBubble } from '@/components';
import { Gem } from '@/components/Gem';
import { Stage } from '@/components/Stage';
import { CATEGORY_GEM } from '@/scenarios/data';
import { CATEGORY_ORDER } from '@/scenarios/types';
import './screens.css';

/**
 * 세계관 소개 — 첫 로딩 뒤, 이름을 묻기 전에 한 번 나온다.
 *
 * 아이는 이 앱이 무엇을 하는 곳인지 모른 채 들어온다. 바로 "이름이 뭐야?" 부터
 * 물으면 왜 묻는지 알 수 없다. 안내 캐릭터가 먼저 나와 "여기는 학교를 미리 가보는
 * 곳이고, 나와 함께 해보자" 를 말해주고 시작한다.
 *
 * 한 화면에 다 적지 않고 세 마디로 나눠 눌러 넘긴다 — 글이 길면 아직 읽지 못하는
 * 아이가 통째로 건너뛴다. 짧은 말풍선은 한 번에 하나씩 읽힌다.
 *
 * 안내는 부엉이가 맡는다. 토끼 선생님은 학교 안에서 만나는 인물이라,
 * "이 앱을 소개하는" 바깥의 목소리는 따로 두는 편이 역할이 섞이지 않는다.
 */

const GUIDE = '/scenes/lunch/img_lunch_owl_choicepractice.png';

type Beat = { line: string; showGems?: boolean };

const BEATS: Beat[] = [
  { line: '안녕!\n나는 부엉이야.' },
  { line: '여기는 학교를\n미리 가보는 곳이야.' },
  { line: '등교하고, 수업 듣고,\n급식 먹고, 하교까지!' },
  { line: '하나씩 해내면\n보석을 모을 수 있어.', showGems: true },
  { line: '나와 함께\n학교생활을 미리 체험해보자!' },
];

export function WorldIntro() {
  const navigate = useNavigate();
  const [beat, setBeat] = useState(0);
  const last = beat === BEATS.length - 1;
  const current = BEATS[beat];

  /*
    다음 마디의 소리를 미리 받아둔다.

    말풍선은 뜨는 순간 저절로 읽힌다. 그때 서버에 물으면 한 박자(1초쯤) 조용한
    채로 글자만 떠 있는데, 글자를 못 읽는 아이에게 그 1초는 빈 화면과 같다.
  */
  useEffect(() => {
    const upcoming = BEATS[beat + 1];
    if (upcoming) prefetch(narrationText(upcoming.line), 'KOREAN', 'TEACHER');
  }, [beat]);

  const next = () => {
    if (last) navigate('/onboarding');
    else setBeat((b) => b + 1);
  };

  return (
    <Stage mood="meadow">
      {/*
        화면 아무 곳이나 눌러도 넘어간다. 아래 버튼을 정확히 누르지 못하는 아이가
        많아서, 넘기는 방법을 버튼 하나로만 두지 않는다.
      */}
      <button type="button" className="tap-layer" onClick={next} aria-label="다음 이야기">
        <span className="sr-only">눌러서 다음</span>
      </button>

      <div className="scene-body">
        <div className="stage-center">
          <div className="talk-group">
            {/* key 를 바꿔 말풍선이 매번 새로 튀어오르게 한다 — 말이 바뀐 걸 알린다 */}
            <SpeechBubble key={beat} tone="teacher" speaker="안내 부엉이">
              {current.line}
            </SpeechBubble>
            <div className="actors actors--grounded">
              <PartnerActor src={GUIDE} height={190} />
            </div>
          </div>

          <div className="card" style={{ width: '100%' }}>
            {current.showGems ? (
              <div className="gem-track" style={{ justifyContent: 'center', marginTop: 0 }}>
                {CATEGORY_ORDER.map((category) => (
                  <Gem key={category} colors={CATEGORY_GEM[category]} size={34} />
                ))}
              </div>
            ) : (
              <p className="lead">화면을 누르면 다음 이야기가 나와요</p>
            )}
          </div>
        </div>

        <div className="scene-footer">
          <BigButton icon={last ? 'backpack' : undefined} onClick={next}>
            {last ? '학교 가볼래!' : '다음'}
          </BigButton>
          {!last ? (
            <button type="button" className="text-link" onClick={() => navigate('/onboarding')}>
              건너뛰기
            </button>
          ) : null}
        </div>
      </div>
    </Stage>
  );
}
