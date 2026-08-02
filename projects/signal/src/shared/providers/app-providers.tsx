"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * 앱 전역 클라이언트 프로바이더. app 레이어(layout)에서 내려 쓴다.
 * 게이트가 app 루트 파일을 각각 슬라이스로 보므로, 프로바이더는 shared에 둔다.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
