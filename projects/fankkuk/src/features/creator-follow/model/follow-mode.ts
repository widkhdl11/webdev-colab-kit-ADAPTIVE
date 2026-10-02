import type { Viewer } from "@/entities/session/model/viewer";

/** fan = 저장하는 팔로우 버튼 / login = 로그인하지 않은 사람(누르면 로그인으로) / hidden = 크리에이터·운영자는 팔로우하지 않는다. */
export type FollowMode = "fan" | "login" | "hidden";

export function followModeOf(viewer: Viewer | null): FollowMode {
  if (!viewer) return "login";
  return viewer.role === "fan" ? "fan" : "hidden";
}
