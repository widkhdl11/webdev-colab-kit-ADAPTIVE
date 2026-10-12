// 관리자 왼쪽 메뉴 (design-rules 8절, 시안 admin/*.html 의 side-nav). 작업 · 돈 · 고객 · 관리 네 묶음.
// 아직 만들지 않은 화면도 메뉴에는 둔다 — 그 주소는 지금 404 다.

export type AdminMenuItem = { href: string; label: string };
export type AdminMenuGroup = { name: string; items: readonly AdminMenuItem[] };

export const ADMIN_MENU: readonly AdminMenuGroup[] = [
  {
    name: "작업",
    items: [
      { href: "/admin", label: "대시보드" },
      { href: "/admin/work/inbound", label: "입고" },
      { href: "/admin/work/inspect", label: "검수" },
      { href: "/admin/work/outbound", label: "출고" },
      { href: "/admin/parcels", label: "들어온 상자" },
      { href: "/admin/unmatched", label: "미확인 입고" },
      { href: "/admin/automation", label: "자동 처리 현황" },
      { href: "/admin/revgifts", label: "역조공 처리" },
    ],
  },
  {
    name: "돈",
    items: [
      { href: "/admin/payments", label: "결제·환불" },
      { href: "/admin/pricing", label: "요금표" },
    ],
  },
  {
    name: "고객",
    items: [
      { href: "/admin/inquiries", label: "1:1 문의" },
      { href: "/admin/notices", label: "공지" },
      { href: "/admin/creators", label: "크리에이터 확인" },
    ],
  },
  {
    name: "관리",
    items: [
      { href: "/admin/prohibited", label: "보낼 수 없는 물품" },
      // address-protection INV-P7(D12): 거부된 시도·대표·직원 구분은 운영자만 보는 내부 기록
      { href: "/admin/access-log", label: "주소 열람 기록" },
      // metrics INV-Q1: 집계는 운영자 틀 안에서만
      { href: "/admin/metrics", label: "측정" },
    ],
  },
];

/** 지금 주소가 어느 묶음의 어느 화면인가. 하위 주소(/admin/parcels/123)는 그 화면으로 본다. */
export function adminPlaceOf(pathname: string): { group: string; item: AdminMenuItem } | null {
  for (const g of ADMIN_MENU) {
    for (const item of g.items) {
      const hit = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (hit) return { group: g.name, item };
    }
  }
  return null;
}
