import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isMustDeliver, MUST_DELIVER_KINDS, mustDeliverLabels, NOTIFICATION_KINDS, NOTIFICATION_POLICY } from "./delivery-policy";

// 꼭 가는 알림 (notifications INV-N6 S6f, 2026-10-12 문제집 D7). 조치가 필요하거나 돈·상자가 걸린 알림은 끌 수 없다.
// 정본은 스펙의 「알림 종류와 끌 수 있는지」 표다 — 표와 이 목록이 다르면 여기서 빨간불이 난다.

// 시험은 프로젝트 폴더에서 돈다(jsdom 환경이라 import.meta.url 이 파일 주소가 아니다)
const SPEC = join(process.cwd(), "docs/specs/notifications.md");

/** 스펙 표의 줄에서 (종류 코드, 끌 수 없나)를 꺼낸다 */
function specTable(): Map<string, boolean> {
  const text = readFileSync(SPEC, "utf8");
  const start = text.indexOf("## 알림 종류와 끌 수 있는지");
  const end = text.indexOf("\n## ", start + 1);
  expect(start).toBeGreaterThan(0);
  const rows = new Map<string, boolean>();
  for (const line of text.slice(start, end).split("\n")) {
    const m = /^\| .*\(([a-z_]+)\) \| [^|]+ \| (끌 수 없음|끌 수 있음) \|/.exec(line);
    if (m) rows.set(m[1]!, m[2] === "끌 수 없음");
  }
  return rows;
}

describe("꼭 가는 알림 목록 (INV-N6)", () => {
  it("INV-N6 (S6f): 앱의 종류별 판정이 스펙 표와 같다 — 종류 수도 같다", () => {
    const table = specTable();
    expect(table.size).toBe(NOTIFICATION_KINDS.length);
    for (const kind of NOTIFICATION_KINDS) expect([kind, NOTIFICATION_POLICY[kind].mustDeliver]).toEqual([kind, table.get(kind)]);
  });

  it("INV-N6: 끌 수 없는 알림은 아홉 — 승인 요청·돌려보내는 선물·돌려보낼 상자·안 온 상자 둘·거절 알림·추가 결제·결제 취소 둘", () => {
    expect([...MUST_DELIVER_KINDS].sort()).toEqual(
      ["approval_request", "hold", "hold_fan", "box_missing", "gift_pending_box", "gift_undelivered", "difference_due", "payment_canceled", "difference_canceled"].sort(),
    );
  });

  it("INV-N6 (실패경로): 진행·소식 알림은 끌 수 있다", () => {
    for (const kind of ["arrived", "inspected", "shipped", "in_transit", "delivered", "box_arrived", "gift_reply", "gift_received"] as const) {
      expect([kind, isMustDeliver(kind)]).toEqual([kind, false]);
    }
    expect(isMustDeliver("no_such_kind")).toBe(false);
  });

  it("INV-N6: 설정 화면의 안내 목록 — 팬은 팬이 받는 끌 수 없는 알림, 크리에이터는 승인 요청·돌려보내는 선물(INV-N13, 2026-10-12 D2)", () => {
    const fan = mustDeliverLabels("fan");
    expect(fan).toEqual(["돌려보낼 상자", "아직 도착하지 않은 상자", "전해지지 못한 선물", "추가 결제 요청", "결제 취소", "추가 결제 취소"]);
    expect(mustDeliverLabels("creator")).toEqual(["승인 요청", "돌려보내는 선물"]);
  });

  it("INV-N6: 설정 화면 이름이 운영자 화면·스펙 표와 같다 — 추가 결제 취소는 「추가 결제 취소」", () => {
    expect(NOTIFICATION_POLICY.difference_canceled.label).toBe("추가 결제 취소");
    expect(NOTIFICATION_POLICY.payment_canceled.label).toBe("결제 취소");
  });
});
