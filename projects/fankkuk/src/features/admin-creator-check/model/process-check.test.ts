import { describe, expect, it } from "vitest";
import { processCreatorCheck } from "./process-check";

// 운영자 처리 (office-workflow INV-W13). DB 함수가 운영자 판정·선택 비교·잠금을 지키고, 여기서는 운영자 확인·본문 꼴·결과 문구만 본다.

function fakeClient(opts: { operator?: boolean; data?: unknown; error?: { code: string } | null }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      if (fn === "is_operator") return { data: opts.operator !== false, error: null };
      if (fn === "is_owner") return { data: false, error: null };
      return { data: opts.data ?? null, error: opts.error ?? null };
    },
  } as never;
  return { client, calls };
}

const BODY = { qr: "Q-000123", seen: "accept" };

describe("크리에이터가 고른 상자의 운영자 처리 (INV-W13)", () => {
  it("INV-W13: QR 과 화면에서 본 선택만 DB 에 넘기고, 처리 결과를 돌려준다", async () => {
    for (const data of ["accepted", "returned"] as const) {
      const { client, calls } = fakeClient({ data });
      expect(await processCreatorCheck(client, BODY)).toEqual({ status: 200, body: { result: data } });
      expect(calls.filter((c) => c.fn === "office_process_creator_check")).toEqual([{ fn: "office_process_creator_check", args: { p_qr: "Q-000123", p_seen_choice: "accept" } }]);
    }
  });

  it("INV-W13 (실패경로): 본 선택이 없거나 모르는 값·다른 칸이 섞이면 400 — DB 를 부르지 않는다", async () => {
    for (const body of [{ qr: "Q-000123" }, { ...BODY, seen: "maybe" }, { ...BODY, creatorId: "x" }, { ...BODY, qr: "FC-1" }]) {
      const { client, calls } = fakeClient({ data: "accepted" });
      expect((await processCreatorCheck(client, body)).status).toBe(400);
      expect(calls.some((c) => c.fn === "office_process_creator_check")).toBe(false);
    }
  });

  it("INV-W13 (실패경로): 「바뀜」·「고른 것 없음」·「이미 처리됨」·「끝남」은 409, 없음은 404 — 처리됐다고 하지 않는다", async () => {
    for (const [data, status] of [["changed", 409], ["no_choice", 409], ["processed", 409], ["closed", 409], ["not_found", 404]] as const) {
      const { client } = fakeClient({ data });
      expect([data, (await processCreatorCheck(client, BODY)).status]).toEqual([data, status]);
    }
    expect((await processCreatorCheck(fakeClient({ data: "weird" }).client, BODY)).status).toBe(500);
    expect((await processCreatorCheck(fakeClient({ error: { code: "42501" } }).client, BODY)).status).toBe(403);
  });

  it("INV-W13 (실패경로): 운영자가 아니면 404 — 처리 함수를 부르지 않는다", async () => {
    const { client, calls } = fakeClient({ operator: false, data: "accepted" });
    expect((await processCreatorCheck(client, BODY)).status).toBe(404);
    expect(calls.some((c) => c.fn === "office_process_creator_check")).toBe(false);
  });
  it("INV-W13·W14 (실패경로): 기한(검수 완료 + 168시간)이 지난 상자는 409 와 문장 — 코드값을 돌려주지 않는다", async () => {
    const { client } = fakeClient({ data: "expired" });
    const reply = await processCreatorCheck(client, { qr: "Q-000123", seen: "report" });
    expect(reply.status).toBe(409);
    expect(reply.body).toEqual({ message: "7일이 지나 자동 처리를 기다리는 상자예요." });
  });

  it("INV-W14: 추적기 보관 상자의 신고하기·신고하지 않기 처리 결과를 돌려준다", async () => {
    for (const data of ["reported", "not_reported"] as const) {
      const { client } = fakeClient({ data });
      expect(await processCreatorCheck(client, { qr: "Q-000123", seen: data === "reported" ? "report" : "no_report" })).toEqual({ status: 200, body: { result: data } });
    }
  });
});
