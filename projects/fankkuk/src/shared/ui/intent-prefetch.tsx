"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { prefetchPath } from "@/shared/lib/navigation/prefetch-path";

// 링크에 마우스를 올리거나(손가락이 닿거나, 키보드 초점이 가면) 그 페이지를 통째로 미리 받는다.
// 기본 미리 받기는 로딩 화면까지만 받아서, 누르면 뼈대가 뜨고 React 가 내용으로 바꾸기까지 약 0.3초를 채운다(2026-10-18 실측).
// 누르기 전에 내용이 와 있으면 뼈대 없이 바로 바뀐다. 미리 받은 화면은 next.config 의 staleTimes.static(30초) 동안 다시 쓰인다.
// 링크마다 부품을 바꾸지 않고 문서 전체에서 한 번 듣는다 — 사이트의 모든 <a> 에 같은 규칙이 걸린다.

const SAME_LINK_MS = 1000;

// 옵션 없이 부르면 Next 16 은 「auto」로 처리해 로딩 화면까지만 받는다(링크 기본 미리 받기와 같아 뼈대가 그대로 뜬다).
// 통째로 받으려면 kind 를 「full」로 줘야 한다. 그 값의 enum 은 공개 경로에 없어, 공개된 useRouter 의 옵션 타입에 같은 문자열을 맞춘다.
type PrefetchOptions = NonNullable<Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]>;
export const FULL_PREFETCH = { kind: "full" } as unknown as PrefetchOptions;

export function IntentPrefetch() {
  const router = useRouter();
  useEffect(() => {
    let last = "";
    let lastAt = 0;
    const onIntent = (event: Event) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const path = prefetchPath(
        { href: anchor.href, target: anchor.target, download: anchor.hasAttribute("download") },
        window.location,
      );
      if (!path) return;
      // 링크 안의 글자·아이콘을 지날 때마다 이벤트가 다시 오므로 같은 링크는 잠깐 건너뛴다
      const now = Date.now();
      if (path === last && now - lastAt < SAME_LINK_MS) return;
      last = path;
      lastAt = now;
      router.prefetch(path, FULL_PREFETCH);
    };
    document.addEventListener("pointerover", onIntent, { passive: true });
    document.addEventListener("focusin", onIntent);
    return () => {
      document.removeEventListener("pointerover", onIntent);
      document.removeEventListener("focusin", onIntent);
    };
  }, [router]);
  return null;
}
