import "server-only";

import { headers } from "next/headers";
import { isLocalDevRequest } from "@/shared/lib/local-dev";

/** 지금 요청이 개발자 화면을 열어도 되는가 — 판단은 shared/lib/local-dev.ts. 페이지와 서버 액션이 같이 쓴다. */
export async function localDevOnly(): Promise<boolean> {
  const h = await headers();
  return isLocalDevRequest(h.get("host"), { nodeEnv: process.env.NODE_ENV, vercel: process.env.VERCEL });
}
