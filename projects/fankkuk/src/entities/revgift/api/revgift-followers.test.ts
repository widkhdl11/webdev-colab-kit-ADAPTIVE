import { describe, expect, it } from "vitest";
import { readRevgiftFollowers } from "./revgift-reads";

// reverse-gift INV-R2: 팔로워 목록 한 줄은 계정 ID 와 닉네임뿐 — 그 밖의 칸이 오면 화면으로 넘기지 않고 멈춘다.

const FAN = "00000000-0000-4000-a000-000000000001";

function clientReturning(data: unknown, error: { code: string } | null = null) {
  return { rpc: async () => ({ data, error }) } as unknown as Parameters<typeof readRevgiftFollowers>[0];
}

describe("readRevgiftFollowers (INV-R2)", () => {
  it("계정 ID·닉네임 줄을 화면 값으로 바꾼다", async () => {
    await expect(readRevgiftFollowers(clientReturning([{ fan_id: FAN, nickname: "별빛" }]))).resolves.toEqual([{ fanId: FAN, nickname: "별빛" }]);
  });

  it("(실패경로) 아이디 같은 다른 칸이 섞이면 멈춘다", async () => {
    await expect(readRevgiftFollowers(clientReturning([{ fan_id: FAN, nickname: "별빛", login_id: "byeolbit_fan" }]))).rejects.toThrow();
  });

  it("(실패경로) 읽기 오류는 멈춘다", async () => {
    await expect(readRevgiftFollowers(clientReturning(null, { code: "42501" }))).rejects.toThrow("팔로워 목록을 읽지 못했다");
  });
});
