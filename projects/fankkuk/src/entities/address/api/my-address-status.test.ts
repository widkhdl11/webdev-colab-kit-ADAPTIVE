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

describe("내 주소 상태 읽기 (INV-P13·P16)", () => {
  it("INV-P16 S16: 읽기 함수가 돌려준 크리에이터 ID·등록 여부·이름표·바꾼 시각을 넘긴다", async () => {
    const c = client([{ creator_id: HARU_CREATOR_ID, registered: true, label: "studio", updated_at: "2026-10-03T05:00:00+00:00" }]);
    expect(await readMyAddressStatus(c as never)).toEqual({
      creatorId: HARU_CREATOR_ID,
      registered: true,
      label: "studio",
      updatedAt: "2026-10-03T05:00:00+00:00",
    });
    expect(c.calls).toEqual(["my_creator_address_status"]);
  });

  it("INV-P13: 등록 전이면 이름표·시각이 null", async () => {
    const c = client([{ creator_id: HARU_CREATOR_ID, registered: false, label: null, updated_at: null }]);
    expect(await readMyAddressStatus(c as never)).toEqual({ creatorId: HARU_CREATOR_ID, registered: false, label: null, updatedAt: null });
  });

  it("INV-P13: 이름표·시각 칸이 없는 옛 DB 응답은 null 로 읽는다", async () => {
    const c = client([{ creator_id: HARU_CREATOR_ID, registered: true }]);
    expect(await readMyAddressStatus(c as never)).toEqual({ creatorId: HARU_CREATOR_ID, registered: true, label: null, updatedAt: null });
  });

  it("INV-P13: 크리에이터 줄이 없으면 null", async () => {
    expect(await readMyAddressStatus(client([]) as never)).toBeNull();
  });

  it("INV-P9 (실패경로): 꼴이 다른 응답(주소 칸이 섞인 줄·목록 밖 이름표 포함)은 받지 않는다", async () => {
    await expect(readMyAddressStatus(client([{ creator_id: HARU_CREATOR_ID, registered: true, envelope: {} }]) as never)).rejects.toThrow();
    await expect(
      readMyAddressStatus(client([{ creator_id: HARU_CREATOR_ID, registered: true, label: "역삼동 집", updated_at: null }]) as never),
    ).rejects.toThrow();
    await expect(readMyAddressStatus(client([{ creator_id: "x", registered: true }]) as never)).rejects.toThrow();
    await expect(readMyAddressStatus(client(null, { code: "42883" }) as never)).rejects.toThrow();
  });
});
