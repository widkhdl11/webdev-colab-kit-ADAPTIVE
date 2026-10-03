import type { ViewerRole } from "./viewer";

// 로그인한 사람의 첫 화면. 로그인 뒤 이동·로고 링크·남의 화면에서 돌려보내는 곳이 모두 이 값을 쓴다.
// 운영자 화면은 아직 없어 운영자는 null(손님처럼 다룬다).

export const FAN_HOME = "/home";
export const CREATOR_HOME = "/creator";

export function homePathOf(role: ViewerRole | null | undefined): string | null {
  if (role === "fan") return FAN_HOME;
  if (role === "creator") return CREATOR_HOME;
  return null;
}
