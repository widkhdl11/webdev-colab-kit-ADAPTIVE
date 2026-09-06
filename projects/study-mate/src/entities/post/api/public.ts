// 슬라이스 밖으로 나가는 시그니처 — 근거는 `entities/study/api/public.ts` 와 같다.

import { readMyPosts as readMyPostsImpl, type MyPost } from "./read-my-posts";

export function readMyPosts(userId: string): Promise<readonly MyPost[]> {
  return readMyPostsImpl(userId);
}
