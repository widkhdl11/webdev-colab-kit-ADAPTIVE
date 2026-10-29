import { describe, expect, it } from "vitest";
import { receivedStageCopy, sentStateTag, settledStageCopy } from "./received-status";

// 역조공 수락 용어 (용어집 3절 역조공 두 행 · 7절 「역조공에 팬이 아직 답하지 않음」, 2026-10-16 사용자 확정).
// 크리에이터 화면 라벨은 「수락 대기」「수락」「받지 않음」, 팬 본인 화면은 「받을지 정해 주세요」와 기한.

describe("역조공 수락 라벨", () => {
  it("크리에이터 화면(보낸 역조공) 라벨 — 수락 대기·수락·받지 않음", () => {
    expect(sentStateTag("waiting").tag).toBe("수락 대기");
    expect(sentStateTag("accepted").tag).toBe("수락");
    expect(sentStateTag("not_received").tag).toBe("받지 않음");
  });

  it("팬 본인 화면(받은 역조공) — 아직 정하지 않았으면 「받을지 정해 주세요」와 남은 날·기한", () => {
    const now = Date.parse("2026-10-03T00:00:00Z");
    const c = receivedStageCopy("waiting", "2026-10-08T06:00:00Z", now);
    expect([c.tag, c.note]).toEqual(["받을지 정해 주세요", "6일 남음 · 10.08까지"]);
  });

  it("(실패경로) 쓰지 않는 말 — 「기다리는 중」(단독)·「받기 기다리는 중」은 어느 라벨에도 없다", () => {
    const now = Date.parse("2026-10-03T00:00:00Z");
    const all = [sentStateTag("waiting").tag, sentStateTag("accepted").tag, sentStateTag("not_received").tag, receivedStageCopy("waiting", "2026-10-08T06:00:00Z", now).tag];
    expect(all.some((t) => t.includes("기다리는 중"))).toBe(false);
  });
});

describe("처분된 역조공 (office-workflow INV-W15, 용어집 disposed)", () => {
  it("INV-W15: 팬 본인 화면 라벨은 「처분」, 돌려보냈다는 말은 없다", () => {
    const c = settledStageCopy("disposed");
    expect(c.tag).toBe("처분");
    expect(c.note).toBe("상자 처분 완료");
    expect(`${c.tag} ${c.note}`).not.toContain("돌려보냈");
  });
});
