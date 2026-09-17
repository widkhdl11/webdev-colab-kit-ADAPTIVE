"use server";

// 조회 집계의 서버 액션 자리. 근거 스펙: docs/specs/post-view-count.md (INV-V1)
//
// `"use server"` 파일의 내보내기는 전부 클라이언트가 부를 수 있는 자리가 된다. 여기서
// 내보내는 것은 하나뿐이고, 그것이 하는 일은 「그 글의 조회수를 1 올린다」뿐이다 —
// 세션도 안 보고 값도 안 돌려준다.
//
// **누가 부르는지는 판정하지 않는다.** 조회수는 비로그인도 올리는 숫자이고, 같은 방문에서
// 두 번 세지 않는 것은 부르는 쪽의 가드가 한다(INV-V1 의 신뢰 경계 — 브라우저 쪽이고
// 믿는 값이 아니다).

import { countPostView } from "@/entities/post";

export async function countPostViewAction(postId: string): Promise<void> {
  if (!postId) return;
  await countPostView(postId);
}
