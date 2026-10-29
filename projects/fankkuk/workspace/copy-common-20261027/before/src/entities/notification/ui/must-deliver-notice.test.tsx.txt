import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MustDeliverNotice } from "./must-deliver-notice";

// 알림 설정 화면의 필수 알림 안내 (notifications INV-N6, my-account INV-A11, 2026-10-12 문제집 D7).

describe("필수 알림 안내", () => {
  it("INV-N6: 팬 화면 — 수신 설정과 관계없이 발송된다는 제목과 팬이 받는 필수 알림 목록", () => {
    const html = renderToStaticMarkup(<MustDeliverNotice audience="fan" id="must-fan" />);
    expect(html).toContain("<strong>필수 알림은 수신 설정과 관계없이 발송됩니다.</strong>");
    expect(html).toContain("반송할 상자 · 미도착 상자 · 전달되지 못한 선물 · 추가 결제 요청");
    // 「알림」을 거듭 쓰지 않는다(제목 뒤 목록에는 없다)
    expect(html.split("발송됩니다.</strong>")[1]).not.toContain("알림");
    expect(html).not.toContain("승인 요청");
    expect(html).toContain('id="must-fan"');
  });

  it("INV-N6 · N13 · N22: 크리에이터 화면 — 승인 요청·추적 장치 발견·반송 주소 확인", () => {
    const html = renderToStaticMarkup(<MustDeliverNotice audience="creator" id="must-creator" />);
    expect(html).toContain("필수 알림은 수신 설정과 관계없이 발송됩니다.");
    expect(html).toContain("승인 요청");
    expect(html).toContain("추적 장치 발견");
    expect(html).toContain("반송 주소 확인");
    expect(html).not.toContain("return_address");
  });
});
