/**
 * 한국어 조사.
 *
 * **되도록 쓰지 않는 것이 원칙이다.** 이 앱을 쓰는 아이의 이름은 한국 이름만이 아니다 —
 * Linh · Nguyen · 王小明 처럼 한글이 아닌 이름에는 받침이라는 개념 자체가 없어서,
 * 어떤 규칙을 넣어도 어색해진다. 그래서 화면 문구는 조사가 필요 없게 쓴다
 * (`{이름}야, 안녕!` 이 아니라 `안녕, {이름}!`).
 *
 * 그래도 조사를 피할 수 없는 자리가 있어 여기 규칙을 둔다.
 */

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/**
 * 마지막 글자에 받침이 있는가.
 *
 * 한글이면 정확히 판정한다. 한글이 아니면 `null` — "모른다"는 뜻이고, 부르는 쪽이
 * 조사를 아예 붙이지 않는 쪽을 고를 수 있게 한다.
 */
export function hasFinalConsonant(word: string): boolean | null {
  const trimmed = word.trim();
  if (!trimmed) return null;
  const code = trimmed.charCodeAt(trimmed.length - 1);
  if (code >= HANGUL_START && code <= HANGUL_END) {
    return (code - HANGUL_START) % 28 !== 0;
  }
  return null;
}

/**
 * 호격 — "민수야" / "경빈아".
 *
 * 한글이 아닌 이름이면 조사를 붙이지 않고 이름만 돌려준다. "Linh야" 보다
 * "Linh" 이 낫다.
 */
export function vocative(name: string): string {
  const final = hasFinalConsonant(name);
  if (final === null) return name;
  return name + (final ? '아' : '야');
}
