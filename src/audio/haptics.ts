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
 * 브라우저는 사용자가 한 번이라도 화면을 만진 뒤에만 진동을 허용한다. **transient 가
 * 아니라 sticky 라** 문서가 살아 있는 동안 계속 유효하고 만료 시간이 없다(크롬
 * vibration_controller.cc 의 HasStickyUserActivation). 그래서 저절로 뜨는 축하
 * 화면에서도 아이가 그 세션에 한 번만 탭했으면 울린다. 막히면 false 를 돌려주고
 * 콘솔에 "Blocked call to navigator.vibrate…" 를 찍는다.
 *
 * ## 울려도 안 느껴지는 경우 — 기기 설정
 *
 * **여기가 실제 신고의 대부분이다.** 셋 다 navigator.vibrate 는 true 를 돌려주므로
 * 자바스크립트로는 구분할 방법이 전혀 없다.
 *
 *  1. **벨소리가 무음(SILENT)** — 크롬이 안드로이드 vibrator 를 아예 안 부른다
 *     (VibrationManagerAndroid.java 의 getRingerMode() != RINGER_MODE_SILENT 조건).
 *     "진동" 모드는 통과한다 — 무음과 진동은 다른 상태다.
 *  2. **절전 모드** — 안드로이드가 웹 진동을 무조건 버린다(IGNORED_FOR_POWER).
 *  3. **터치 피드백 끔** — 우리 펄스는 전부 5초 미만이라 안드로이드가 통째로
 *     USAGE_TOUCH 로 분류하고, 그러면 설정 > 소리와 진동 > 진동 세기 >
 *     터치 피드백을 읽는다. 꺼져 있으면 버린다(IGNORED_FOR_SETTINGS).
 *
 * 확인은 브라우저가 아니라 `adb shell dumpsys vibrator_manager` 로 한다 —
 * previous vibrations 의 status 가 FINISHED 인지 IGNORED_* 인지 그대로 나온다.
 *
 * 그래서 **진동을 "소리를 껐을 때 대신 알려주는 통로" 로 설계하면 안 된다.**
 * 교실 기기는 무음이 기본이고, 무음이면 진동도 없다.
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
export function haptic(pattern: number | number[]): boolean {
  if (!enabled || reducedMotion() || !supported()) return false;
  try {
    /*
     * 반환값은 **탭이 한 번도 없었던 문서인지** 만 알려준다(새로고침 직후처럼).
     * 기기가 무음이거나 절전이거나 터치 피드백이 꺼져 있으면 여기서는 true 가
     * 돌아오고 실제로는 안 울린다 — 그건 자바스크립트가 알 수 없는 일이다.
     */
    return navigator.vibrate(pattern);
  } catch {
    // 기기가 거절했다. 화면은 그대로 간다.
    return false;
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
 * 네 번을 따로 부르면 안 된다. 새 vibrate() 호출은 **진행 중이던 패턴을 무조건
 * 중단**시키므로 타이머 넷이 서로를 지운다. 게다가 느린 기기에서는 JS 타이머가
 * CSS 타임라인과 어긋나 진동과 화면이 따로 논다.
 *
 * 다만 "배열을 넘기면 운영체제가 리듬을 돌린다" 는 **사실이 아니다**(전에 여기
 * 그렇게 적어 뒀다). 크롬은 pattern[0] 만 OS 로 보내고 나머지는 블링크 타이머로
 * 스스로 다시 건다(vibration_controller.cc 의 DoVibrate/DidVibrate). 그래도 한 번
 * 부르는 편이 맞다 — 우리가 타이머 넷을 돌리는 것보다 브라우저 하나가 도는 편이
 * 정확하고, 서로를 지울 일도 없다.
 *
 * [진동, 멈춤, 진동, 멈춤, …] 순서이고, **첫 착지(265ms)를 0 으로 잡은 상대 시각**이다.
 * StoryUnlock 의 타임라인과 짝이므로 한쪽을 옮기면 여기도 옮겨야 한다.
 *
 *   20 → 착지①(265)   170 쉼
 *   20 → 착지②(455)   170 쉼
 *   20 → 착지③(645)   240 쉼   ← 마지막 앞의 한 박자
 *   34 → 착지④(905)   611 쉼   ← 넷이 가운데로 빨려드는 구간
 *   70 → 폭발(1550)
 *
 * 네 번째가 길고(34) 폭발이 제일 길다(70). 웹에서는 세기를 못 고르니 **강약을
 * 길이로만** 만든다. (전에 "명세가 10개에서 잘라낸다" 고 적어 뒀는데 사실이
 * 아니다 — 크롬의 상한은 99개다. 9개는 아무 문제 없다.)
 */
export const GEM_MERGE = [20, 170, 20, 170, 20, 240, 34, 611, 70];
