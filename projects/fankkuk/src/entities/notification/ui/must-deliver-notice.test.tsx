import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MustDeliverNotice } from "./must-deliver-notice";

// 알림 설정 화면의 「끌 수 없는 알림」 안내 (notifications INV-N6, my-account INV-A11, 2026-10-12 문제집 D7).

describe("끌 수 없는 알림 안내", () => {
  it("INV-N6: 팬 화면 — 제목과 팬이 받는 끌 수 없는 알림 목록, 꺼도 간다는 말", () => {
    const html = renderToStaticMarkup(<MustDeliverNotice audience="fan" id="must-fan" />);
    expect(html).toContain("끌 수 없는 알림");
    expect(html).toContain("추가 결제 요청");
    expect(html).toContain("돌려보낼 상자");
    expect(html).toContain("전해지지 못한 선물");
    expect(html).toContain("돈·상자가 걸린 일이라 꺼 두어도 가요.");
    // 「알림」을 한 문장에 거듭 쓰지 않는다(제목 「끌 수 없는 알림」 뒤 본문에는 없다)
    expect(html.split("끌 수 없는 알림</strong>")[1]).not.toContain("알림");
    expect(html).not.toContain("승인 요청");
    expect(html).toContain('id="must-fan"');
  });

  it("INV-N6: 크리에이터 화면 — 승인 요청과 사무실이 보관 중인 상자", () => {
    const html = renderToStaticMarkup(<MustDeliverNotice audience="creator" id="must-creator" />);
    expect(html).toContain("끌 수 없는 알림");
    expect(html).toContain("승인 요청");
    expect(html).toContain("사무실이 보관 중인 상자");
  });
});
