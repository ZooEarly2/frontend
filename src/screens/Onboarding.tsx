import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NativeLanguage } from '@/api/types';
import { BigButton, Character, SpeechBubble } from '@/components';
import { Flag } from '@/components/Icon';
import { Stage } from '@/components/Stage';
import { useAppState } from '@/store/appState';
import { speak } from '@/audio/speaker';
import './screens.css';

/**
 * 고를 수 있는 모국어.
 *
 * 각 언어의 **자기 이름**(Tiếng Việt·中文)을 함께 적는다 — 한국어를 아직 못 읽는
 * 아이가 자기 언어를 찾을 수 있어야 하기 때문이다. 깃발은 이모지가 아니라 그림이다:
 * 윈도우는 국기 이모지를 그리지 않고 "KR" 같은 글자로 떨어뜨린다.
 */
export const LANGUAGES: { id: NativeLanguage; name: string; native: string }[] = [
  { id: 'KOREAN', name: '한국어', native: '한국어' },
  { id: 'VIETNAMESE', name: '베트남어', native: 'Tiếng Việt' },
  { id: 'CHINESE', name: '중국어', native: '中文' },
];

const MAX_NICKNAME = 20;

/**
 * 온보딩 — 닉네임과 모국어를 받는다.
 *
 * 이 두 값은 서버로 바로 가지 않는다. 서버는 사용자를 저장하지 않으므로(무상태·DB 없음)
 * 앱이 갖고 있다가 요청할 때마다 실어 보낸다.
 *
 * 모국어 선택지에 각 언어의 **자기 이름**(Tiếng Việt·中文)을 함께 적는다 —
 * 한국어를 아직 못 읽는 아이가 자기 언어를 찾을 수 있어야 하기 때문이다.
 */
export function Onboarding() {
  const navigate = useNavigate();
  const { profile, saveProfile } = useAppState();
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [language, setLanguage] = useState<NativeLanguage | null>(profile?.nativeLanguage ?? null);

  const trimmed = nickname.trim();
  const ready = trimmed.length > 0 && trimmed.length <= MAX_NICKNAME && language !== null;

  const submit = () => {
    if (!ready || !language) return;
    saveProfile({ nickname: trimmed, nativeLanguage: language });
    navigate('/home', { replace: true });
  };

  /*
    인사말은 들어온 순간에 정하고 그대로 둔다.

    `profile ? ... : ...` 로 매 렌더 계산하면, 시작하기를 눌러 프로필이 저장되는
    순간 문구가 "다시 만나서 반가워!" 로 바뀐다. 말풍선은 글이 바뀌면 다시 읽으므로
    화면을 떠나는 찰나에 새 인사가 시작된다 — 듣는 쪽에서는 말이 끊긴 것으로 들린다.
  */
  const greeting = useRef(
    profile ? '다시 만나서 반가워!' : '안녕! 나는 토끼 선생님이야.',
  ).current;

  return (
    <Stage mood="sky">
      <div className="onboard">
        <div className="onboard__hero">
          <SpeechBubble tone="teacher">{`${greeting}\n네 이름을 알려줄래?`}</SpeechBubble>
          <Character who="teacher" pose="hello" height={168} />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="nickname">
            뭐라고 부를까요?
          </label>
          <input
            id="nickname"
            className="text-input"
            value={nickname}
            onChange={(event) => setNickname(event.target.value.slice(0, MAX_NICKNAME))}
            placeholder="예) 지우"
            maxLength={MAX_NICKNAME}
            autoComplete="off"
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
                onClick={() => {
                  setLanguage(item.id);
                  // 고른 언어로 한마디 들려준다 — 글자를 못 읽어도 제대로 골랐는지 안다.
                  void speak(GREETING[item.id], item.id, 'FRIEND');
                }}
              >
                <Flag lang={item.id} />
                <span className="lang-card__name">{item.name}</span>
                <span className="caption">{item.native}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="spacer" />

        <BigButton onClick={submit} disabled={!ready} icon="backpack">
          시작하기
        </BigButton>
      </div>
    </Stage>
  );
}

/** 언어를 고른 순간 들려주는 인사 한마디. */
const GREETING: Record<NativeLanguage, string> = {
  KOREAN: '안녕! 반가워요.',
  VIETNAMESE: 'Chào bạn! Rất vui được gặp bạn.',
  CHINESE: '你好！很高兴见到你。',
};
