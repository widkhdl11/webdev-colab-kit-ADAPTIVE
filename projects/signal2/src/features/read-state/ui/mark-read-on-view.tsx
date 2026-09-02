"use client";

import { useEffect } from "react";

import { getStore, markRead } from "../model/storage";

/**
 * 상세 화면이 실제로 떴을 때 읽음으로 남긴다.
 *
 * **클릭 시점에 찍지 않는다.** 예전에 카드 클릭에서 기록했더니, 이동이 실패한 글까지
 * 읽음으로 굳었다 — 기록이 localStorage 에 있어서 새로고침해도 안 풀린다.
 * PRODUCT.md 의 "이미 **연** 소식" 정의와 코드가 같은 말을 하게 두는 자리다.
 */
export function MarkReadOnView({ id }: { id: string }) {
  useEffect(() => {
    markRead(getStore(), id);
  }, [id]);

  return null;
}
