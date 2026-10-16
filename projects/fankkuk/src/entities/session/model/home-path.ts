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

/** 팬 계정 설정·프로필 수정 화면(design-rules 12절). 사이드바 이름 메뉴와 팬 홈 프로필 구간이 같은 값을 쓴다. */
export const FAN_ACCOUNT_SETTINGS = "/me";
export const FAN_PROFILE_EDIT = "/me/profile";

/** 크리에이터 프로필 수정·상세 설정 화면(design-rules 12절 「내 팬꾹」 묶음). 사이드바와 크리에이터 홈 프로필 구간이 같은 값을 쓴다. */
export const CREATOR_PROFILE_EDIT = "/creator/profile";
export const CREATOR_SETTINGS = "/creator/settings";
/** 크리에이터 계정 설정(본인 확인·알림·계정 보안 — 2026-10-16 상세 설정에서 옮김). */
export const CREATOR_ACCOUNT = "/creator/account";
