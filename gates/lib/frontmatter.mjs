// frontmatter 를 읽는 한 자리. 게이트 넷이 각자 들고 있던 정규식을 여기로 모았다.
//
// 왜 한 자리인가 (2026-08-31): 같은 frontmatter 를 test() 로 읽는 곳과 match() 로 읽는 곳이
// 달라서, 같은 키가 두 줄일 때 어느 줄이 이기는지가 키마다 달랐다. 복붙이라 한 곳을 고쳐도
// 나머지가 안 따라왔고, 그 차이를 한자리에서 볼 수 있는 곳이 없었다.

/** `---` 블록 안의 텍스트. 없으면 null. */
export function frontmatterText(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

/** `key: 값` 의 값. 값 뒤 주석(`# …`)은 잘라낸다. 필드가 없으면 null(빈 값과 구분한다). */
export function fmField(fmText, key) {
  const m = fmText.match(new RegExp(`^[ \\t]*${key}:[ \\t]*(.*)$`, "m"));
  if (!m) return null;
  return m[1].split("#")[0].trim();
}

/** 목록 필드. 인라인 `key: [a, b]` 와 블록 `key:` 다음 줄부터의 `- a` 둘 다 받는다. */
export function fmList(fmText, key) {
  const m = fmText.match(new RegExp(`^[ \\t]*${key}:[ \\t]*(.*)$`, "m"));
  if (!m) return null;
  const clean = (s) => s.split(",").map((x) => x.trim().replace(/['"]/g, "")).filter(Boolean);
  const inline = m[1].trim();
  const br = inline.match(/^\[([^\]]*)\]/);
  if (br) return clean(br[1]);
  if (inline && !inline.startsWith("#")) return clean(inline.split("#")[0]);
  const rest = fmText.slice(fmText.indexOf(m[0]) + m[0].length).split("\n").slice(1);
  const out = [];
  for (const line of rest) {
    const li = line.match(/^[ \t]*-[ \t]*([A-Za-z][\w-]*)/);
    if (!li) break;
    out.push(li[1]);
  }
  return out;
}

/** 같은 키가 두 번 이상 나오면 그 키 목록. 어느 줄을 읽었는지 모르는 상태를 잡는다. */
export function dupKeys(fmText) {
  const seen = new Map();
  for (const line of fmText.split("\n")) {
    const m = line.match(/^[ \t]*([A-Za-z_][\w-]*):/);
    if (m) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k);
}
