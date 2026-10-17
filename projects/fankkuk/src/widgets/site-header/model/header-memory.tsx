"use client";

import { createContext, useContext, useLayoutEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { SiteHeaderProps } from "../ui/site-header";

// 마지막으로 그린 상단 바(사이드바)의 값을 기억한다 — 페이지를 옮기는 동안 로딩 화면이 같은 상단 바를 보여 주게.
// 숫자(처리할 일·선물)는 여기서 읽지 않는다. 각 페이지가 본문과 같은 읽기 결과로 그린 값을 그대로 기억할 뿐이다(action-center INV-J2·J6).
// 새 페이지가 도착하면 그 페이지의 상단 바가 새 값으로 다시 그려진다.
// 값과 기억하는 함수를 따로 둔다 — 함수(setState)는 바뀌지 않으므로 기억하는 쪽은 값이 바뀌어도 다시 돌지 않는다.

const LastHeader = createContext<SiteHeaderProps | null>(null);
const RememberHeader = createContext<Dispatch<SetStateAction<SiteHeaderProps | null>> | null>(null);

export function HeaderMemoryProvider({ children }: { children: ReactNode }) {
  const [last, setLast] = useState<SiteHeaderProps | null>(null);
  return (
    <RememberHeader.Provider value={setLast}>
      <LastHeader.Provider value={last}>{children}</LastHeader.Provider>
    </RememberHeader.Provider>
  );
}

/** 상단 바가 그려질 때마다 그 값을 기억한다. 화면 그리기 전에 기억해야 바로 다음 로딩 화면이 같은 값을 쓴다. */
export function useRememberHeader(props: SiteHeaderProps): void {
  const remember = useContext(RememberHeader);
  const key = JSON.stringify(props);
  useLayoutEffect(() => {
    remember?.(JSON.parse(key) as SiteHeaderProps);
  }, [remember, key]);
}

/** 마지막으로 기억한 상단 바 값. 처음 들어온 직후처럼 기억이 없으면 null. */
export function useLastHeader(): SiteHeaderProps | null {
  return useContext(LastHeader);
}
