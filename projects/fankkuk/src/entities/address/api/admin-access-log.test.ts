import { describe, expect, it, vi } from "vitest";
import { parseAdminAccessLogRows, readAdminAccessLog } from "./admin-access-log";

// 운영자 내부 주소 열람 기록 — INV-P7(2026-10-12 문제집 D12): 거부 줄과 대표·직원 구분은 여기에만 있다.

const opened = {
  at: "2026-10-12T05:32:00+00:00",
  target: "gift",
  order_no: "FC-4T7NX",
  result: "opened",
  print_no: 1,
  deny_reason: null,
  requester: "owner",
  requester_nickname: "팬꾹 운영",
  released: false,
};
const denied = {
  at: "2026-10-12T05:40:00+00:00",
  target: "revgift",
  order_no: "RG-AB12CD0",
  result: "denied",
  print_no: null,
  deny_reason: "not_owner",
  requester: "other",
  requester_nickname: "팬꾹 직원",
  released: false,
};

describe("INV-P7 (D12): 운영자 내부 열람 기록 응답", () => {
  it("INV-P7 (D12): 연 줄·거부 줄을 화면 모양으로 — 대표인지·닉네임·선물 종류까지", () => {
    expect(parseAdminAccessLogRows([denied, opened])).toEqual([
      {
        at: "2026-10-12T05:40:00.000Z",
        target: "revgift",
        orderNo: "RG-AB12CD0",
        requester: "other",
        requesterNickname: "팬꾹 직원",
        result: { kind: "denied", reason: "not_owner" },
      },
      {
        at: "2026-10-12T05:32:00.000Z",
        target: "gift",
        orderNo: "FC-4T7NX",
        requester: "owner",
        requesterNickname: "팬꾹 운영",
        result: { kind: "opened", printNo: 1, released: false },
      },
    ]);
  });

  it("탈퇴 등으로 닉네임이 없으면 null 로 둔다", () => {
    expect(parseAdminAccessLogRows([{ ...denied, requester_nickname: null }])[0]?.requesterNickname).toBeNull();
  });

  it.each([
    ["거부 줄에 사유가 없음", { ...denied, deny_reason: null }],
    ["연 줄에 순번이 없음", { ...opened, print_no: null }],
    ["모르는 선물 종류", { ...opened, target: "parcel" }],
    ["모르는 요청자 값", { ...opened, requester: "staff" }],
    ["거부 줄이 돌려받음으로 옴", { ...denied, released: true }],
  ])("(실패경로): %s → 받지 않는다", (_label, row) => {
    expect(() => parseAdminAccessLogRows([row])).toThrow();
  });

  it("INV-P7 (D12): admin_access_log 를 인자 없이 부르고, 오류면 코드만 담아 던진다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [opened], error: null });
    expect(await readAdminAccessLog({ rpc } as never)).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("admin_access_log");
    const failing = vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "운영자만 본다" } });
    await expect(readAdminAccessLog({ rpc: failing } as never)).rejects.toThrow("42501");
  });
});
