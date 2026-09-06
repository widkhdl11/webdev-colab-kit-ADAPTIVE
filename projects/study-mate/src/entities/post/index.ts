export {
  MEETING_MODE_LABEL,
  placeLabel,
  type MeetingMode,
  type PostSummary,
  type StudySummary,
} from "./model/post-summary";
export {
  readLatestPosts,
  readPosts,
  SORT_LABEL,
  SORTS,
  toSort,
  type PostPage,
  type PostQuery,
  type Sort,
} from "./api/read-posts";
export {
  applyState,
  canEditPost,
  isPostAuthor,
  type ApplyState,
  type DetailSlot,
  type ParticipationStatus,
  type Person,
  type PostDetail,
  type StudyDetail,
} from "./model/post-detail";
export { countPostView, readPostDetail } from "./api/read-post-detail";
// 판독기 인자를 뺀 시그니처로 내보낸다 — `entities/study/api/public.ts` 와 같은 이유
export { readMyPosts, readPostForEdit } from "./api/public";
export type { MyPost } from "./api/read-my-posts";
export type { EditablePost } from "./api/read-post-for-edit";

// 길이 상한(`model/limits.ts`)은 **여기서 다시 내보내지 않는다.** 그 값을 쓰는 것은
// 폼(클라이언트 컴포넌트)이기도 한데, 이 배럴은 서버 전용 판독기를 함께 내보내므로
// 배럴로 가져가면 브라우저 번들이 서버 클라이언트를 끌고 들어가 빌드가 죽는다
// (게이트 bundle/CLIENT_IMPORTS_SERVER 가 편집 시점에 잡는다). 쓰는 쪽은
// `@/entities/post/model/limits` 를 직접 가리킨다 — 길이 상한은 경로가 하나뿐이다.
