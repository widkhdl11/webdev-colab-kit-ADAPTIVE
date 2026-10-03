import type { Viewer } from "@/entities/session/model/viewer";

/** save = 저장하는 팔로우 버튼(팬·크리에이터) / login = 로그인하지 않은 사람(누르면 로그인으로) / hidden = 운영자, 또는 크리에이터 자기 페이지. */
export type FollowMode = "save" | "login" | "hidden";

/** ownCreatorId: 로그인한 크리에이터 자신의 크리에이터 id. 자기 자신은 팔로우하지 않는다(DB set_follow 도 막는다). */
export function followModeOf(viewer: Viewer | null, target?: { creatorId: string; ownCreatorId: string | null }): FollowMode {
  if (!viewer) return "login";
  if (viewer.role === "operator") return "hidden";
  if (target && target.ownCreatorId !== null && target.creatorId === target.ownCreatorId) return "hidden";
  return "save";
}
