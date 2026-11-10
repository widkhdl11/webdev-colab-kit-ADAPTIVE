import { describe, expect, it } from "vitest";
import { creatorActionRows } from "./creator-home-page";

// 크리에이터 홈 「지금 할 일」 한 줄(action-center INV-J6) — 승인 서명 연결 줄(signup INV-U20 「크리에이터 홈 할 일」)만 연결 화면으로 간다.
describe("INV-U20: 홈 지금 할 일 — 승인 서명 연결 줄", () => {
  it("INV-U20: 연결 줄은 「카카오톡 인증 알림 연결」 · 연결 전 뱃지 · 승인 서명 연결 화면으로", () => {
    const [row] = creatorActionRows([{ kind: "signature_link" }]);
    expect(row).toMatchObject({ title: "카카오톡 인증 알림 연결", description: "선물을 받으려면 연결이 필요합니다", status: "연결 전", href: "/creator/settings/signature" });
  });

  it("INV-J6: 다른 줄은 따로 갈 곳이 없다(묶음 주소 — 처리할 일 화면)", () => {
    const rows = creatorActionRows([
      { kind: "unconfirmed", orderNo: "RG-1", shareId: "s1", nickname: "별빛", tier: "medium", sentAt: "2026-11-01T00:00:00.000Z" },
    ]);
    expect(rows[0]?.href).toBeUndefined();
    expect(rows).toHaveLength(1);
  });
});
