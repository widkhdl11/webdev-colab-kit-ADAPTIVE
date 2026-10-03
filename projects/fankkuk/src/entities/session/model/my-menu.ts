// 「내 팬꾹」 메뉴. 왼쪽 메뉴(my-nav)와 헤더의 닉네임 펼침 메뉴·모바일 메뉴가 같은 목록을 쓴다 — 한쪽만 고쳐 어긋나지 않게.
// 크리에이터의 일하는 화면(승인 요청·보낸 선물·보낸 역조공·열람 기록·주소와 설정)은 헤더 가로 메뉴가 아니라 여기에만 있다
// (2026-10-04 사용자 「왼쪽 사이드바로 보는거면 좋겠어. 내 정보 페이지로 들어가서 보게」).

export const MY_PAGE_TITLE = "내 팬꾹";

export const FAN_MY_MENU = [
  { href: "/me", label: "개인정보" },
  { href: "/me/following", label: "팔로우한 크리에이터" },
  { href: "/gifts", label: "선물 내역" },
  { href: "/me/revgifts", label: "받은 역조공" },
] as const;

export const CREATOR_MY_MENU = [
  { href: "/creator/requests", label: "승인 요청" },
  { href: "/gifts", label: "보낸 선물" },
  { href: "/creator/revgifts", label: "보낸 역조공" },
  { href: "/creator/log", label: "열람 기록" },
  { href: "/creator/settings", label: "주소와 설정" },
] as const;

/** 크리에이터가 「내 팬꾹」(/me)을 찾아오면 보내는 곳 — 메뉴 첫 칸. */
export const CREATOR_MY_HOME = CREATOR_MY_MENU[0].href;

export type FanMyHref = (typeof FAN_MY_MENU)[number]["href"];
export type CreatorMyHref = (typeof CREATOR_MY_MENU)[number]["href"];
