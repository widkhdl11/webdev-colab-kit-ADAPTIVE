import { describe, expect, it } from "vitest";
import { readMyAddressStatus } from "./my-address-status";

const HARU_CREATOR_ID = "00000000-0000-4000-b000-000000000001";

function client(data: unknown, error: { code: string } | null = null) {
  const calls: string[] = [];
  const rpc = async (fn: string) => {
    calls.push(fn);
    return { data, error };
  };
  return { calls, rpc };
}

describe("내 주소 등록 여부 읽기 (INV-P13)", () => {
  it("INV-P13 S13: 읽기 함수가 돌려준 크리에이터 ID 와 등록 여부만 넘긴다", async () => {
    const c = client([{ creator_id: HARU_CREATOR_ID, registered: true }]);
    expect(await readMyAddressStatus(c as never)).toEqual({ creatorId: HARU_CREATOR_ID, registered: true });
    expect(c.calls).toEqual(["my_creator_address_status"]);
  });

  it("INV-P13: 크리에이터 줄이 없으면 null", async () => {
    expect(await readMyAddressStatus(client([]) as never)).toBeNull();
  });

  it("INV-P9 (실패경로): 꼴이 다른 응답(주소 칸이 섞인 줄 포함)은 받지 않는다", async () => {
    await expect(readMyAddressStatus(client([{ creator_id: HARU_CREATOR_ID, registered: true, envelope: {} }]) as never)).rejects.toThrow();
    await expect(readMyAddressStatus(client([{ creator_id: "x", registered: true }]) as never)).rejects.toThrow();
    await expect(readMyAddressStatus(client(null, { code: "42883" }) as never)).rejects.toThrow();
  });
});
