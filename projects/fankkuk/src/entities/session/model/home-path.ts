import { CREATOR_SIGNATURE_LINK_PATH } from "@/shared/config/creator-paths";
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

/** 크리에이터 프로필 수정·계정 설정(옛 상세 설정, 2026-11-13 이름 바꿈 — 주소 그대로) 화면(design-rules 12절 「내 팬꾹」 묶음). 사이드바와 크리에이터 홈 프로필 구간이 같은 값을 쓴다. */
export const CREATOR_PROFILE_EDIT = "/creator/profile";
export const CREATOR_SETTINGS = "/creator/settings";
/** 크리에이터 승인 서명 연결하기(approval-signature INV-S16) — 계정 설정(옛 상세 설정)의 「승인 서명」 줄이 여는 화면(장애 대비 길로 가입한 크리에이터의 첫 연결·다시 연결, signup INV-U20). */
export const CREATOR_SIGNATURE_LINK = CREATOR_SIGNATURE_LINK_PATH;
/** 크리에이터 알림 설정(옛 계정 설정 — 주소는 그대로). 2026-11-13 재분류로 알림만 남았다 — 보안·회원 탈퇴는 계정 설정(/creator/settings), 채널 소유자 확인은 프로필 수정 채널 탭. */
export const CREATOR_ACCOUNT = "/creator/account";

/**
 * 크리에이터 프로필 수정의 두 탭(2026-11-13 재분류 — UX 명세 creator-profile, 같은 날 「계정」 탭을 없앰). 탭은 주소의 ?tab= 로 싣는다 —
 * 없거나 모르는 값(옛 ?tab=account 포함)이면 프로필 탭. 다른 화면의 안내 링크(꾸미기의 팬마크·링크 주소 등)가 원하는 탭을 바로 연다.
 */
export const CREATOR_PROFILE_TABS = ["profile", "channel"] as const;
export type CreatorProfileTab = (typeof CREATOR_PROFILE_TABS)[number];

export function parseCreatorProfileTab(raw: unknown): CreatorProfileTab {
  return CREATOR_PROFILE_TABS.find((t) => t === raw) ?? "profile";
}

/** 탭 주소 — 프로필 탭은 ?tab 없는 주소(사이드바 「프로필 수정」과 같은 주소) */
export function creatorProfileTabHref(tab: CreatorProfileTab): string {
  return tab === "profile" ? CREATOR_PROFILE_EDIT : `${CREATOR_PROFILE_EDIT}?tab=${tab}`;
}

/**
 * 다른 화면으로 옮겨진 칸의 옛 주소(화면 + #칸) → 지금 주소. 옮겨지지 않은 칸·없앤 칸(X 공유 설정 #thanks·#reply)은 null — 그 화면에 그대로 둔다.
 * 북마크·예전 안내 링크가 빈 자리로 열리지 않게 한다. 옮긴 날: 팬덤·선물 링크·채널 소유자 확인 2026-11-13 재분류, 생일과 기념일 2026-11-14.
 */
const MOVED_SECTIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  [CREATOR_SETTINGS]: {
    fandom: `${creatorProfileTabHref("channel")}#fandom`,
    link: `${creatorProfileTabHref("channel")}#link`,
    "gift-link": `${creatorProfileTabHref("channel")}#link`,
    days: `${creatorProfileTabHref("profile")}#days`,
  },
  [CREATOR_ACCOUNT]: {
    verify: `${creatorProfileTabHref("channel")}#verify`,
  },
};

export function movedCreatorSectionHref(path: string, sectionId: string): string | null {
  return Object.hasOwn(MOVED_SECTIONS, path) && Object.hasOwn(MOVED_SECTIONS[path], sectionId) ? MOVED_SECTIONS[path][sectionId] : null;
}
