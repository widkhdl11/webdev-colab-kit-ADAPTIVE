// 링크 위에 마우스·손가락·키보드 초점이 올라왔을 때 미리 받을 주소를 고른다(DECISIONS 2026-10-18 「마우스 올리면 미리 받기」).
// 미리 받기는 서버에서 페이지를 실제로 그리므로, 이 사이트 안의 화면 주소만 고른다 — API·다른 사이트·새 창·내려받기 링크는 받지 않는다.

export type PrefetchAnchor = { href: string; target: string; download: boolean };
export type PrefetchLocation = { origin: string; pathname: string; search: string };

/** 미리 받을 경로(경로 + 검색어). 받지 않을 링크면 null. href 는 브라우저가 풀어 둔 전체 주소(a.href)다. */
export function prefetchPath(anchor: PrefetchAnchor, here: PrefetchLocation): string | null {
  if (anchor.download) return null;
  if (anchor.target !== "" && anchor.target !== "_self") return null;
  if (!URL.canParse(anchor.href)) return null;
  const url = new URL(anchor.href);
  if (url.origin !== here.origin) return null;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;
  // 같은 화면 안의 칸 이동(#목차)은 페이지를 옮기지 않는다
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return url.pathname + url.search;
}
