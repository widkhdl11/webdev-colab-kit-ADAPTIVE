"use client";

import { useEffect } from "react";
import { countPostViewAction } from "../api/count-view";
import { 처음인가 } from "../model/visit-guard";

/**
 * 조회수를 올리는 자리. 근거 스펙: docs/specs/post-view-count.md (INV-V1)
 *
 * **아무것도 안 그린다.** 화면에 나오는 숫자는 서버가 이미 준 값이고, 이 컴포넌트가 하는
 * 일은 「사람이 이 글을 열었다」를 한 번 알리는 것뿐이다.
 *
 * **왜 페이지 본문이 아니라 여기인가**: 본문에 두면 화면을 다시 그릴 때마다 또 세어진다.
 * 좋아요를 한 번 누를 때마다 조회수가 1 오르던 것이 그 때문이었다(2026-09-16 실측 38→40).
 * 그리는 일과 숫자를 올리는 일은 같은 자리에 있으면 안 된다.
 */
export function ViewCounter({ postId }: { postId: string }) {
  useEffect(() => {
    if (!처음인가(postId)) return;
    // 결과를 안 기다린다 — 실패해도 화면은 그대로다(스펙 S5).
    void countPostViewAction(postId);
  }, [postId]);

  return null;
}
