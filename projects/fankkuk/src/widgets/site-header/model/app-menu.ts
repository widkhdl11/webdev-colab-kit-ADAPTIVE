import { CREATOR_HOME, FAN_HOME } from "@/entities/session/model/home-path";

// 로그인 후 왼쪽 앱 사이드바 메뉴(design-rules 00절, 시안 docs/design/mockups/site/v18/home-fan.html·home-creator.html).
// 아이콘 이름은 lucide 선 아이콘 이름 — 그림은 ui/app-icons.tsx 에 있다.

export type AppIcon =
  | "house"
  | "search"
  | "gift"
  | "heart"
  | "package"
  | "mail"
  | "message-circle"
  | "inbox"
  | "list-checks"
  | "send"
  | "eye"
  | "map-pin"
  | "settings";

/** badge: 이 칸 옆에 숫자를 붙일 자리. 숫자는 헤더가 넘긴다 */
export type AppMenuItem = { href: string; label: string; icon: AppIcon; badge?: "gifts" | "pending" };
export type AppMenuGroup = { label: string; items: readonly AppMenuItem[] };

const BASIC: AppMenuGroup["items"] = [
  { href: "/creators", label: "크리에이터 찾기", icon: "search" },
  { href: "/gifts/new", label: "선물 보내기", icon: "gift" },
];

export const FAN_APP_MENU: readonly AppMenuGroup[] = [
  { label: "기본", items: [{ href: FAN_HOME, label: "홈", icon: "house" }, ...BASIC] },
  {
    label: "내 활동",
    items: [
      { href: "/me/following", label: "팔로우한 크리에이터", icon: "heart" },
      { href: "/gifts", label: "보낸 선물", icon: "package", badge: "gifts" },
      { href: "/me/revgifts", label: "받은 선물", icon: "mail" },
      { href: "/support", label: "문의", icon: "message-circle" },
    ],
  },
];

// 「받은 선물」은 시안대로 승인 화면과 나뉜 화면이다(creator-boxes.html → /creator/boxes).
export const CREATOR_BOXES_HREF = "/creator/boxes";

export const CREATOR_APP_MENU: readonly AppMenuGroup[] = [
  { label: "기본", items: [{ href: CREATOR_HOME, label: "홈", icon: "house" }, ...BASIC] },
  {
    label: "관리",
    items: [
      { href: "/creator/requests", label: "승인 대기", icon: "inbox", badge: "pending" },
      { href: "/creator/requests#done", label: "승인 내역", icon: "list-checks" },
      { href: CREATOR_BOXES_HREF, label: "받은 선물", icon: "mail" },
      { href: "/creator/revgifts", label: "보낸 역조공", icon: "send" },
      { href: "/creator/log", label: "열람 기록", icon: "eye" },
      { href: "/creator/settings#address", label: "주소 관리", icon: "map-pin" },
      { href: "/creator/settings", label: "설정", icon: "settings" },
      // 시안에 없던 칸 — 크리에이터도 선물을 보내므로 보낸 선물 목록으로 가는 길(카드 d78 「추가해」)
      { href: "/gifts", label: "보낸 선물", icon: "package" },
    ],
  },
];

/** 아래 이름 메뉴의 「계정 설정」 — 크리에이터가 /me 로 가면 승인 화면으로 돌려보내지므로(app/me) 크리에이터는 설정 화면 */
export const ACCOUNT_HREF = { fan: "/me", creator: "/creator/settings" } as const;

/**
 * 지금 화면에 해당하는 메뉴 칸 하나 — 주소가 current 와 글자 그대로 같은 첫 칸. 「#」 붙은 칸(승인 내역 = /creator/requests#done)은 current 와 같을 수 없어 고르지 않는다 —
 * 한 화면에서 두 칸이 동시에 켜지지 않게.
 */
export function currentMenuItem(groups: readonly AppMenuGroup[], current: string | undefined): AppMenuItem | null {
  if (!current) return null;
  for (const g of groups) {
    for (const it of g.items) {
      if (it.href === current) return it;
    }
  }
  return null;
}
