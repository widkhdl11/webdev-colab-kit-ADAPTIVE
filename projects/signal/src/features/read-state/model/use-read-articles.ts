"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addReadIds, loadReadIds } from "../lib/storage";

export interface ReadArticles {
  isRead: (id: string) => boolean;
  markRead: (id: string) => void;
}

/**
 * 읽은 소식 목록.
 *
 * 첫 렌더는 항상 "아무것도 안 읽음"으로 시작하고, 저장된 값은 마운트 뒤에 불러온다.
 * 서버 렌더에는 localStorage 가 없으므로, 처음부터 읽어 들이면 서버와 브라우저의
 * 첫 렌더 결과가 어긋난다(hydration 불일치).
 */
export function useReadArticles(): ReadArticles {
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  // 실제로 뭔가를 읽기 전까지는 저장하지 않는다 — 마운트마다 불러온 값을 되쓰지 않기 위해.
  const touched = useRef(false);

  useEffect(() => {
    const stored = loadReadIds();
    if (stored.length > 0) setReadIds(new Set(stored));
  }, []);

  // 저장은 상태 계산 함수 밖에서 한다. 업데이터는 순수해야 하고(StrictMode 는 두 번 부른다),
  // 부수효과를 그 안에 두면 쓰기가 중복된다.
  // addReadIds 는 통째로 덮어쓰지 않고 저장소의 현재 값과 합친다 — 다른 탭이 그 사이
  // 기록한 읽음을 지우지 않기 위해서다.
  useEffect(() => {
    if (touched.current) addReadIds([...readIds]);
  }, [readIds]);

  const markRead = useCallback((id: string) => {
    touched.current = true;
    setReadIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const isRead = useCallback((id: string) => readIds.has(id), [readIds]);

  return { isRead, markRead };
}
