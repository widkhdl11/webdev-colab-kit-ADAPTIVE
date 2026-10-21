import type { FanGiftView } from "./fan-view";

// 보낸 선물 하나가 마지막으로 움직인 때(design-rules 21절 — 보낸 선물 목록은 「가장 최근 움직인 줄 하나만」 강조).
// 따로 저장한 값이 아니라 주문에 이미 있는 시각(등록·입고·검수·출고·배송…)에서 가장 늦은 것이다.

export function lastMovedAt(view: Pick<FanGiftView, "registeredAt" | "steps">): number {
  let latest = Date.parse(view.registeredAt);
  for (const st of view.steps) {
    if (!st.at) continue;
    const t = Date.parse(st.at);
    if (t > latest) latest = t;
  }
  return latest;
}

/** 줄들 가운데 가장 최근 움직인 하나의 주문번호. 같은 때면 앞 줄. 줄이 없으면 null */
export function mostRecentlyMoved(views: readonly Pick<FanGiftView, "orderNo" | "registeredAt" | "steps">[]): string | null {
  let best: { orderNo: string; at: number } | null = null;
  for (const v of views) {
    const at = lastMovedAt(v);
    if (!best || at > best.at) best = { orderNo: v.orderNo, at };
  }
  return best?.orderNo ?? null;
}
