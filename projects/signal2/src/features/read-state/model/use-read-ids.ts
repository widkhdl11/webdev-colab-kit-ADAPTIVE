"use client";

import { useEffect, useState } from "react";

import { getStore, loadReadIds, READ_IDS_KEY } from "./storage";

/**
 * 읽은 소식의 id 집합.
 *
 * **첫 렌더는 항상 빈 집합이다.** 읽음 기록이 브라우저에만 있어서 서버는 그 값을 모른다 —
 * 첫 렌더에서 읽으면 서버가 그린 화면과 달라져 하이드레이션에서 한 번 뒤집힌다.
 * 마운트 뒤에 채우므로 "잠깐 안 읽음으로 보였다가 흐려지는" 것이 정상 동작이다.
 */
export function useReadIds(): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set<string>());

  useEffect(() => {
    setIds(loadReadIds(getStore()));

    // 다른 탭에서 글을 읽으면 이 탭도 따라 흐려진다. key 가 null 인 경우는 clear() 다.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === READ_IDS_KEY) {
        setIds(loadReadIds(getStore()));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return ids;
}
