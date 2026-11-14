// 주소 끝 #이름을 칸 id 로 읽는다. 깨진 % 인코딩(#%E0 등)이면 decodeURIComponent 가 던져 화면이 오류로 넘어가므로 빈 값으로 돌려준다(2026-11-14 code-reviewer).

/** "#fandom" → "fandom", "#%EC%83%9D" → "생", 빈 해시·깨진 인코딩 → "". */
export function hashIdOf(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

/** 지금 화면 주소의 #이름. */
export function currentHashId(): string {
  return hashIdOf(window.location.hash);
}
