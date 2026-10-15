import { CREATOR_HOME, FAN_ACCOUNT_SETTINGS, FAN_HOME, FAN_PROFILE_EDIT } from "@/entities/session/model/home-path";

// 로그인 후 왼쪽 앱 사이드바 메뉴(design-rules 00절, 시안 docs/design/mockups/site/v18/home-fan.html·home-creator.html).
// 크리에이터 메뉴의 묶음·하위 줄은 design-rules 11절(시안 docs/design/mockups/site/v19-sidebar/creator-a.html).
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
  | "eye"
  | "map-pin"
  | "settings"
  | "package-plus"
  | "history"
  | "palette";

/** 부모 칸 아래 들여 쓴 하위 줄. soon 은 아직 없는 기능 — 링크 없이 「준비 중」 태그만(design-rules 11절) */
export type AppMenuSub = { label: string; href: string } | { label: string; soon: true };

/**
 * badge: 이 칸 옆에 숫자를 붙일 자리. 숫자는 헤더가 넘긴다.
 * also: 이 칸이 현재 칸으로 켜지는 다른 주소(한 칸이 탭으로 이은 두 화면을 맡을 때 — 「보낸 내역」).
 * sub: 늘 펼쳐 두는 하위 줄.
 */
export type AppMenuItem = {
  href: string;
  label: string;
  icon: AppIcon;
  badge?: "gifts" | "pending";
  also?: readonly string[];
  sub?: readonly AppMenuSub[];
};
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

/** 「내 팬꾹 꾸미기」 화면 — 설정의 프로필 칸도 이 주소로 보낸다. */
export const CREATOR_CUSTOMIZE_HREF = "/creator/customize";

/** 「보낸 내역」 한 칸이 맡는 두 화면 — 팬에게 보낸 역조공과 크리에이터에게 보낸 선물(탭으로 잇는다) */
export const CREATOR_SENT_HREFS = { fans: "/creator/revgifts", creators: "/gifts" } as const;

export const CREATOR_APP_MENU: readonly AppMenuGroup[] = [
  {
    label: "기본",
    items: [
      { href: CREATOR_HOME, label: "홈", icon: "house" },
      { href: "/creators", label: "크리에이터 찾기", icon: "search" },
    ],
  },
  {
    label: "받기",
    items: [
      { href: "/creator/requests", label: "승인 대기", icon: "inbox", badge: "pending" },
      { href: "/creator/requests#done", label: "승인 내역", icon: "list-checks" },
      { href: CREATOR_BOXES_HREF, label: "받은 선물", icon: "package" },
      { href: "/creator/log", label: "열람 기록", icon: "eye" },
    ],
  },
  {
    label: "보내기",
    items: [
      {
        href: "/creator/revgifts/new",
        label: "팬에게 보내기",
        icon: "package-plus",
        sub: [{ label: "몇 명에게", href: "/creator/revgifts/new#count" }, { label: "합포장", soon: true }],
      },
      { href: "/gifts/new", label: "다른 크리에이터에게 선물", icon: "gift" },
      { href: CREATOR_SENT_HREFS.fans, label: "보낸 내역", icon: "history", also: [CREATOR_SENT_HREFS.creators] },
    ],
  },
  {
    label: "내 팬꾹",
    items: [
      { href: CREATOR_CUSTOMIZE_HREF, label: "꾸미기", icon: "palette" },
      { href: "/creator/settings#address", label: "주소 관리", icon: "map-pin" },
      { href: "/creator/settings", label: "설정", icon: "settings" },
    ],
  },
];

/** 아래 이름 메뉴의 「계정 설정」 — 크리에이터가 /me 로 가면 승인 화면으로 돌려보내지므로(app/me) 크리에이터는 설정 화면 */
export const ACCOUNT_HREF = { fan: FAN_ACCOUNT_SETTINGS, creator: "/creator/settings" } as const;

/** 팬 프로필 수정 화면(my-account INV-A12, design-rules 12절) — 사이드바 위 메뉴 칸이 아니라 이름 메뉴와 홈 프로필 구간에서 간다(시안 v21-addendum3). */
export const FAN_PROFILE_EDIT_HREF = FAN_PROFILE_EDIT;

/** 아래 이름 메뉴의 링크(로그아웃 위). 팬은 시안대로 「프로필 수정」·「계정 설정」, 크리에이터는 「계정 설정」 하나. */
export const ACCOUNT_MENU: Record<"fan" | "creator", readonly { label: string; href: string }[]> = {
  fan: [
    { label: "프로필 수정", href: FAN_PROFILE_EDIT_HREF },
    { label: "계정 설정", href: ACCOUNT_HREF.fan },
  ],
  creator: [{ label: "계정 설정", href: ACCOUNT_HREF.creator }],
};

/**
 * 지금 화면에 해당하는 메뉴 칸 하나 — 주소(또는 also 의 주소)가 current 와 글자 그대로 같은 첫 칸. 하위 줄은 고르지 않는다(부모가 켜진다). 「#」 붙은 칸(승인 내역 = /creator/requests#done)은 current 와 같을 수 없어 고르지 않는다 —
 * 한 화면에서 두 칸이 동시에 켜지지 않게.
 */
export function currentMenuItem(groups: readonly AppMenuGroup[], current: string | undefined): AppMenuItem | null {
  if (!current) return null;
  for (const g of groups) {
    for (const it of g.items) {
      if (it.href === current || it.also?.includes(current)) return it;
    }
  }
  return null;
}
