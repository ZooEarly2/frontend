/**
 * 빌드된 그림 파일 이름에 내용 해시를 붙인다.
 *
 * **왜 필요한가.** `public/` 의 그림은 이름이 그대로 나간다. 그림을 갈아끼워도
 * 이름이 같으면 이미 앱을 써 본 브라우저는 다시 받지 않는다 — 실제로 동화
 * 삽화를 토끼에서 고양이로 바꿔 배포했는데 화면에는 계속 토끼가 나왔다.
 * JS·CSS 는 Vite 가 이름에 해시를 붙여 주므로(`index-Fd82og5L.js`) 이 문제가
 * 없는데, 그림만 빠져 있었다.
 *
 * **왜 소스를 안 고치나.** 그림 경로는 앱 곳곳에 문자열로 흩어져 있다.
 * 그걸 전부 import 로 바꾸면 고칠 자리가 많아 그만큼 틀릴 자리도 많아진다.
 * 대신 빌드가 끝난 결과물에서만 파일 이름을 바꾸고 번들 안의 문자열을 같이
 * 바꾼다. 개발 서버는 원본을 그대로 쓰므로 아무 영향이 없다.
 *
 * **문자열로 박혀 있는 그림만 건드린다.** 이게 이 스크립트의 유일한 규칙이다.
 * 경로를 런타임에 조합하는 곳이 있다 — 캐릭터가 `/characters/${who}-${pose}.png`
 * 로 만들어진다. 그런 파일의 이름을 바꾸면 번들에는 고칠 문자열이 없으므로
 * **그림이 통째로 깨진다.** 그래서 번들 안에 그 경로가 글자 그대로 있는 것만
 * 이름을 바꾸고, 나머지는 건드리지 않고 아래에 이름을 적어 알린다.
 * 그 파일들은 캐시가 안 깨지지만, 깨지는 것보다 낫다.
 *
 * **안전장치.** 바꾼 뒤 번들을 다시 훑어서 남아 있는 그림 경로가 전부 실제
 * 파일을 가리키는지 확인한다. 하나라도 어긋나면 빌드를 실패시킨다 — 그림이
 * 깨진 채로 배포되는 것보다 배포가 멈추는 편이 낫다.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
/** 이름을 바꿀 대상. public/ 에서 그대로 복사돼 나오는 그림들이다 */
const ASSET_DIRS = ['scenes', 'characters'];
const IMAGE = /\.(png|webp|jpe?g|gif)$/i;
/** 번들 안의 문자열을 고칠 대상 */
const TEXT = /\.(js|css|html)$/i;

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** dist 기준 절대 URL 로. 윈도우 역슬래시를 슬래시로 바꾼다 */
const toUrl = (p) => '/' + relative(DIST, p).split('\\').join('/');

const textFiles = walk(DIST).filter((f) => TEXT.test(f));
const bundles = new Map(textFiles.map((f) => [f, readFileSync(f, 'utf8')]));

// ── 1. 문자열로 박혀 있는 그림만 골라 이름을 바꾼다 ──────────

const renames = new Map(); // 옛 URL -> 새 URL
const skipped = [];

for (const dir of ASSET_DIRS) {
  for (const file of walk(join(DIST, dir))) {
    if (!IMAGE.test(file)) continue;
    const url = toUrl(file);

    const literal = [...bundles.values()].some((text) => text.includes(url));
    if (!literal) {
      // 번들이 이 경로를 글자 그대로 갖고 있지 않다 — 런타임에 조합하거나
      // 아무 데서도 안 쓴다. 이름을 바꾸면 고칠 데가 없어 깨진다.
      skipped.push(url);
      continue;
    }

    const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8);
    const next = file.replace(IMAGE, (ext) => `.${hash}${ext}`);
    renameSync(file, next);
    renames.set(url, toUrl(next));
  }
}

// ── 2. 번들 안의 문자열을 같이 바꾼다 ────────────────────────

// 긴 경로부터 바꾼다 — 짧은 것이 긴 것의 일부일 때 잘못 잘리는 것을 막는다
const ordered = [...renames.entries()].sort((a, b) => b[0].length - a[0].length);

let touched = 0;
for (const [file, before] of bundles) {
  let after = before;
  for (const [from, to] of ordered) {
    if (after.includes(from)) after = after.split(from).join(to);
  }
  if (after !== before) {
    writeFileSync(file, after);
    bundles.set(file, after);
    touched += 1;
  }
}

// ── 3. 남은 참조가 전부 실제 파일인지 확인한다 ───────────────

const present = new Set(walk(DIST).map(toUrl));
const missing = new Set();
const referenced = new RegExp(
  `/(?:${ASSET_DIRS.join('|')})/[A-Za-z0-9._/-]+\\.(?:png|webp|jpe?g|gif)`,
  'g',
);

for (const text of bundles.values()) {
  for (const url of text.match(referenced) ?? []) {
    if (!present.has(url)) missing.add(url);
  }
}

console.log(`  그림 ${renames.size}개에 해시를 붙였다 (파일 ${touched}곳 갱신)`);

if (skipped.length > 0) {
  /*
   * 이름을 안 바꾼 것들. 둘 중 하나다.
   *  - 아무 데서도 안 쓴다 → 그냥 실려 나가는 짐이다. 지우면 된다.
   *  - 경로를 런타임에 조합한다 → 이름을 바꾸면 깨지므로 그대로 둔다.
   *    (그런 자리는 문자열 표로 펴는 편이 낫다. components/index.tsx 의
   *     CHARACTER 표가 그렇게 고친 예다.)
   * 어느 쪽인지 여기서 갈라 준다 — 안 그러면 "왜 이건 안 됐지" 를 매번 다시 찾는다.
   */
  const bytes = (n) => (n / 1024).toFixed(0).padStart(5) + 'KB';
  const dead = [];
  const dynamic = [];
  for (const url of skipped) {
    const stem = url.replace(IMAGE, '');
    const anywhere = [...bundles.values()].some((t) => t.includes(stem));
    (anywhere ? dynamic : dead).push(url);
  }

  if (dynamic.length > 0) {
    console.log(`  경로를 런타임에 만들어 그대로 둔 그림 ${dynamic.length}개:`);
    for (const url of dynamic) console.log(`    ${url}`);
    console.log('    (캐시가 안 깨진다. 갈아끼우면 파일 이름을 함께 바꿔야 한다)');
  }

  if (dead.length > 0) {
    let total = 0;
    for (const url of dead) total += statSync(join(DIST, url.slice(1))).size;
    console.log(`  아무 데서도 안 쓰는 그림 ${dead.length}개 (${(total / 1024 / 1024).toFixed(1)}MB):`);
    for (const url of dead) {
      console.log(`    ${bytes(statSync(join(DIST, url.slice(1))).size)}  ${url}`);
    }
    console.log('    (public/ 에서 지우면 그만큼 덜 실려 나간다)');
  }
}

if (missing.size > 0) {
  console.error('\n  번들이 없는 그림을 가리킨다:');
  for (const url of missing) console.error('   ', url);
  console.error('\n  그림이 깨진 채 배포되는 것보다 여기서 멈추는 편이 낫다.');
  process.exit(1);
}

console.log('  번들이 가리키는 그림이 전부 실제로 있다');
