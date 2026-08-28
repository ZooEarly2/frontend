/**
 * 아이가 말한 개수를 알아듣는다.
 *
 * **발음 채점이 아니라 인식이다.** 국어 시간은 "이 문장을 얼마나 잘 읽었나" 라
 * `/pronunciation` 으로 채점하지만, 수학 시간은 "무엇을 말했나" 를 알아야 해서
 * `/stt` 로 글자를 받아 여기서 수를 뽑는다.
 *
 * 한국어는 수를 세는 말이 두 벌이다. 고유어(하나·둘·셋)와 한자어(일·이·삼)가
 * 있고, 세는 말 앞에서는 꼴이 또 바뀐다(하나→한 개, 둘→두 개). 아이는 이 중
 * 아무거나 말한다. 셋 다 받아야 한다.
 */

/** 이 화면이 다루는 범위. 그림에 놓이는 과일이 1~5개다 */
export const MAX_COUNT = 5;

/**
 * 수를 말하는 여러 꼴.
 *
 * 긴 것부터 본다 — "하나" 를 먼저 지우지 않으면 "한" 이 걸려 같은 말을 두 번 센다.
 * 각 줄의 순서가 그래서 중요하다.
 */
const SPOKEN: Record<number, string[]> = {
  1: ['하나', '한개', '한', '일개', '일'],
  2: ['두개', '둘', '두', '이개'],
  3: ['세개', '셋', '세', '삼개', '삼'],
  4: ['네개', '넷', '네', '사개'],
  5: ['다섯개', '다섯', '오개'],
};

/**
 * 과일 이름은 먼저 지운다.
 *
 * **"사과" 에는 "사"(4)가, "바나나" 에는 아무것도 없지만 "수박" 에는 "박" 이 있다.**
 * 아이가 "사과 세 개" 라고 하면 "사" 를 4로 읽어 버린다. 물어본 것이 개수라
 * 과일 이름은 답에 필요 없으니 통째로 걷어낸다.
 */
const FRUIT_WORDS = ['사과', '수박', '바나나'];

function normalize(text: string): string {
  let out = text.replace(/[\s.,!?~"'·]/g, '');
  for (const word of FRUIT_WORDS) out = out.split(word).join('');
  return out;
}

/**
 * 말한 글자에서 개수를 뽑는다. 못 알아들으면 `null`.
 *
 * 아라비아 숫자를 먼저 본다 — STT 가 "3개" 로 적어 주는 일이 흔하고, 그건
 * 애매할 데가 없다. 그 다음에 말로 센 것을 본다.
 *
 * 한자어 낱자(일·이·사)는 **`개` 가 붙었을 때만** 센다. 그것들은 다른 말에도
 * 흔히 들어 있어서(이거·사자·일곱) 홀로 두면 엉뚱한 답을 맞다고 하게 된다.
 * 대신 고유어(하나·둘·셋)는 홀로 나와도 센다 — 아이가 제일 많이 쓰는 말이고
 * 다른 말에 섞일 일이 거의 없다.
 */
export function heardCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = normalize(text);
  if (!cleaned) return null;

  const digit = cleaned.match(/[1-9]/);
  if (digit) {
    const n = Number(digit[0]);
    return n >= 1 && n <= MAX_COUNT ? n : null;
  }

  // 긴 꼴부터 맞춰 본다. "다섯개" 를 "다섯" 보다 먼저 봐야 한다.
  const table = Object.entries(SPOKEN)
    .flatMap(([n, forms]) => forms.map((form) => [Number(n), form] as const))
    .sort((a, b) => b[1].length - a[1].length);

  for (const [n, form] of table) {
    if (cleaned.includes(form)) return n;
  }
  return null;
}

/** 화면과 소리에 쓰는 말. "3" 이 아니라 "세 개" 라고 말해야 아이가 따라 한다 */
const COUNTER = ['', '한', '두', '세', '네', '다섯'];

export function countLabel(n: number): string {
  return `${COUNTER[n] ?? n} 개`;
}
