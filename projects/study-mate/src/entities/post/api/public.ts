// 슬라이스 밖으로 나가는 시그니처 — 근거는 `entities/study/api/public.ts` 와 같다.

import { readMyPosts as readMyPostsImpl, type MyPost } from "./read-my-posts";
import { readPostForEdit as readPostForEditImpl, type EditablePost } from "./read-post-for-edit";

export function readMyPosts(userId: string): Promise<readonly MyPost[]> {
  return readMyPostsImpl(userId);
}

export function readPostForEdit(postId: string, userId: string): Promise<EditablePost | null> {
  return readPostForEditImpl(postId, userId);
}
