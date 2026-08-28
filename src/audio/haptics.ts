/**
 * 짧은 진동 — 보상의 순간에 손끝으로도 알린다.
 *
 * 글자를 아직 못 읽는 아이가 대부분이라 이 앱은 같은 것을 눈·소리로 두 번 말한다.
 * 진동은 세 번째 통로다. 특히 교실처럼 소리를 끄고 쓰는 자리에서, 해냈다는 신호가
 * 화면 안에만 남지 않게 한다.
 *
 * ## 되는 기기와 안 되는 기기
 *
 * **안드로이드 크롬은 되고, 아이폰 사파리는 안 된다.** 애플이 Vibration API 를
 * 구현하지 않았고, 표준으로 우회할 방법도 없다. 그래서 이 파일의 규칙은 하나다 —
 * **없으면 조용히 아무 일도 하지 않는다.** 진동은 보상을 더하는 것이지 보상 그
 * 자체가 아니므로, 안 되는 기기에서 화면이 달라지거나 오류가 뜨면 안 된다.
 *
 * 브라우저는 사용자가 한 번이라도 화면을 만진 뒤에만 진동을 허용한다(user
 * activation). 이 앱에서 진동이 울리는 자리는 전부 아이가 무언가를 누른 다음이라
 * 문제가 없다 — 다만 그래서 실패가 정상이기도 하다. 조용히 넘어간다.
 *
 * ## 끄는 스위치
 *
 * 소리 스위치를 같이 따른다. 별도 설정을 만들지 않은 이유는, 교실에서 소리를 끄는
 * 사람이 바라는 것은 "조용해지는 것" 이고 책상 위에서 붕붕대는 기기는 그 바람을
 * 정면으로 어기기 때문이다. 끌 곳이 하나여야 실제로 꺼진다.
 *
 * `prefers-reduced-motion: reduce` 도 따른다. 그 설정을 켠 아이에게 화면 흔들림을
 * 걷어내고 손에 충격을 주는 것은 앞문으로 막고 뒷문으로 들이는 것이다.
 */

let enabled = true;

/** 소리 스위치가 이 값을 같이 옮긴다(store/appState). */
export function setHaptics(on: boolean) {
  enabled = on;
  if (!on) stopHaptics();
}

function supported(): boolean {
  // iOS 에서는 vibrate 가 아예 undefined 라 이 검사만으로 충분하다.
  // **UA 를 보지 않는다** — 기능이 있는지만 묻는다.
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** 움직임을 줄여 달라고 한 사람에게는 촉각 충격도 주지 않는다 */
function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * 진동 한 번.
 *
 * `pattern` 은 밀리초, 또는 [진동, 멈춤, 진동, …] 배열이다.
 * 실패는 삼킨다 — 진동이 안 되는 것은 아이가 알아야 할 일이 아니다.
 */
export function haptic(pattern: number | number[]): void {
  if (!enabled || reducedMotion() || !supported()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // 기기가 거절했다. 화면은 그대로 간다.
  }
}

/** 울리고 있는 진동을 끊는다. 화면을 떠날 때 쓴다 */
export function stopHaptics(): void {
  if (!supported()) return;
  try {
    navigator.vibrate(0);
  } catch {
    // 위와 같다
  }
}

/*
 * 쓰는 자리마다 세기를 정해 둔다. 부르는 곳에서 숫자를 직접 쓰면 화면마다 조금씩
 * 달라지고, 아이는 그 차이를 "다른 일이 일어났다" 로 읽는다.
 *
 * **웹에서는 세기를 못 고른다.** navigator.vibrate 는 켜고 끄는 것뿐이라, 강약은
 * 오직 길이로 만든다. 그리고 처음에 12~18ms 로 잡았던 것은 너무 약했다 — 값싼
 * 안드로이드 태블릿(우리 타깃)에서 그 길이는 감지 임계 아래라 **아무것도 안
 * 느껴진다.** 20ms 아래로는 내리지 않는다.
 */

/** 보석 하나를 받았다 — 시나리오 하나를 마친 순간 */
export const GEM_EARNED = 25;

/**
 * 보석 넷이 하나씩 박히고 마지막에 합쳐져 터진다. **한 번에 다 넘긴다.**
 *
 * 네 번을 따로 부르면 안 된다. 명세상 새 vibrate() 호출은 **진행 중이던 패턴을
 * 무조건 중단**시키므로 타이머 넷이 서로를 지운다. 게다가 느린 기기에서는 JS
 * 타이머가 CSS 타임라인과 어긋나 진동과 화면이 따로 논다. 배열 하나를 넘기면
 * 운영체제가 리듬을 돌려주므로 둘 다 생기지 않는다.
 *
 * [진동, 멈춤, 진동, 멈춤, …] 순서다. 아래 값은 보석이 박히는 간격과 폭발 시각에
 * 맞춘 것이고, 실제 숫자는 연출 타임라인이 정해지면 그것과 함께 맞춘다.
 */
export const GEM_MERGE = [22, 138, 22, 138, 22, 138, 22, 300, 60];
