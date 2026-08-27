/**
 * 이 기기의 아이를 가리키는 값.
 *
 * <h2>왜 닉네임이 아닌가</h2>
 * 닉네임은 **겹치고 바뀐다.** 같은 반에 "지우"가 둘이면 앨범이 섞이고, 메뉴에서
 * 이름을 바꾸는 순간 과거 앨범을 잃는다. 게다가 아이 이름이 모든 조회 주소에
 * 실려 다니게 된다.
 *
 * 그래서 처음 켤 때 UUID 를 하나 만들어 두고 그것으로 묶는다. 겹치지 않고,
 * 바뀌지 않고, 그 자체로는 아무것도 알려주지 않는다. 닉네임은 화면에 보여줄
 * 이름으로만 함께 보낸다.
 *
 * <h2>한계 — 이것은 기기의 신원이다</h2>
 * 로그인이 없으므로 "누구인가"는 결국 기기가 정한다. 브라우저 저장소를 지우거나
 * 다른 기기에서 열면 다른 아이가 된다. 그 대신 아이에게 계정과 비밀번호를
 * 요구하지 않는다 — 만 5~8세에게는 그 편이 맞다.
 */

const KEY = 'zooearly.childId';

function makeUuid(): string {
  // 브라우저가 주는 것을 먼저 쓴다. 안전한 난수를 우리가 다시 만들 이유가 없다.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // randomUUID 가 없는 환경(구형·비보안 컨텍스트)을 위한 대비.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // 버전 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 메모리 대비책. 저장소를 못 쓰는 브라우저에서도 이번 세션 동안은 같은 값을 쓴다. */
let inMemory: string | null = null;

/**
 * 이 기기의 childId. 없으면 만들어 저장한다.
 *
 * 프로필(`zooearly.v1`)과 **따로 저장한다.** 프로필은 하루가 지나면 진행도가
 * 비워지고 "처음부터 플레이하기"로 통째로 지워지기도 하는데, 그때 앨범까지
 * 잃으면 안 된다.
 */
export function getChildId(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
    const made = makeUuid();
    localStorage.setItem(KEY, made);
    return made;
  } catch {
    // 시크릿 창이나 저장을 막은 브라우저 — 앱이 멈추면 안 되므로 메모리로 버틴다.
    if (!inMemory) inMemory = makeUuid();
    return inMemory;
  }
}

/**
 * 새 아이로 바꾼다.
 *
 * "처음부터 플레이하기"는 기기를 **다음 아이에게 넘길 때** 쓴다. 그때 childId 를
 * 그대로 두면 다음 아이가 앞 아이의 동화 앨범을 열어보게 된다 — 이름을 지우는
 * 것만으로는 부족하고, 신원 자체를 새로 만들어야 한다.
 *
 * 앞 아이의 동화는 서버에 남지만 아무도 그 childId 를 모르므로 닿을 수 없다.
 */
export function resetChildId(): string {
  const made = makeUuid();
  inMemory = made;
  try {
    localStorage.setItem(KEY, made);
  } catch {
    // 저장을 못 해도 이번 세션은 새 신원으로 간다
  }
  return made;
}
