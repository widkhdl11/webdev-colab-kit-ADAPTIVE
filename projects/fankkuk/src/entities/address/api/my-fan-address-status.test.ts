import { describe, expect, it } from "vitest";
import { readMyFanAddressStatus } from "./my-fan-address-status";

function client(data: unknown, error: { code: string } | null = null) {
  const calls: string[] = [];
  const rpc = async (fn: string) => {
    calls.push(fn);
    return { data, error };
  };
  return { calls, rpc };
}

describe("팬 받을 주소 상태 읽기 (address-protection INV-P16·P17)", () => {
  it("INV-P17 S17: 읽기 함수가 돌려준 등록 여부·이름표·바꾼 시각만 넘긴다", async () => {
    const c = client([{ registered: true, label: "home", updated_at: "2026-10-17T05:00:00+00:00" }]);
    expect(await readMyFanAddressStatus(c as never)).toEqual({ registered: true, label: "home", updatedAt: "2026-10-17T05:00:00+00:00" });
    expect(c.calls).toEqual(["my_fan_address_status"]);
  });

  it("INV-P17: 등록 전이면 이름표·시각이 null", async () => {
    expect(await readMyFanAddressStatus(client([{ registered: false, label: null, updated_at: null }]) as never)).toEqual({
      registered: false,
      label: null,
      updatedAt: null,
    });
  });

  it("INV-P17 S17b: 팬 줄이 없으면(크리에이터·운영자·로그인 안 함) null", async () => {
    expect(await readMyFanAddressStatus(client([]) as never)).toBeNull();
  });

  it("INV-P16 (실패경로): 주소 칸이 섞인 줄·목록 밖 이름표·두 줄 이상·오류는 받지 않는다", async () => {
    await expect(readMyFanAddressStatus(client([{ registered: true, label: "home", updated_at: null, envelope: {} }]) as never)).rejects.toThrow();
    await expect(readMyFanAddressStatus(client([{ registered: true, label: "역삼동 집", updated_at: null }]) as never)).rejects.toThrow();
    const row = { registered: true, label: "home", updated_at: null };
    await expect(readMyFanAddressStatus(client([row, row]) as never)).rejects.toThrow();
    await expect(readMyFanAddressStatus(client(null, { code: "42883" }) as never)).rejects.toThrow();
  });
});
