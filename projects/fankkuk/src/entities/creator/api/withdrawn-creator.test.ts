import { describe, expect, it, vi } from "vitest";
import { readWithdrawnCreator } from "./creator-link-reads";

// 탈퇴한 크리에이터인지 묻기 (approval-signature INV-S15 — 크리에이터 페이지는 「탈퇴한 크리에이터입니다.」).
// DB 는 가짜 rpc 로 둔다 — 시험 대상은 무엇을 물어보고(인자) 어떤 답을 믿는지다.

const CREATOR_ID = "6f1c2b9e-4a3d-4c8e-9b7a-2d5e8f1a0c3b";
const rpcReturning = (data: unknown, error: { code: string } | null = null) => vi.fn(async () => ({ data, error }));

describe("탈퇴한 크리에이터 묻기 (INV-S15)", () => {
  it("INV-S15: 링크 주소는 아이디로, 옛 주소는 크리에이터 ID 로 묻고 DB 가 참이라 하면 참", async () => {
    const rpc = rpcReturning(true);
    expect(await readWithdrawnCreator({ rpc } as never, { handle: "haru" })).toBe(true);
    expect(rpc).toHaveBeenLastCalledWith("withdrawn_creator", { p_handle: "haru" });
    expect(await readWithdrawnCreator({ rpc } as never, { creatorId: CREATOR_ID })).toBe(true);
    expect(rpc).toHaveBeenLastCalledWith("withdrawn_creator", { p_creator: CREATOR_ID });
  });

  it("INV-S15 (실패경로): DB 가 거짓이거나 참·거짓이 아닌 값을 주면 거짓 — 「없는 페이지」 그대로", async () => {
    expect(await readWithdrawnCreator({ rpc: rpcReturning(false) } as never, { handle: "haru" })).toBe(false);
    expect(await readWithdrawnCreator({ rpc: rpcReturning("true") } as never, { handle: "haru" })).toBe(false);
    expect(await readWithdrawnCreator({ rpc: rpcReturning(null) } as never, { handle: "haru" })).toBe(false);
  });

  it("INV-S15 (실패경로): 아이디·ID 꼴이 틀리면 DB 에 묻지 않고 거짓", async () => {
    const rpc = rpcReturning(true);
    expect(await readWithdrawnCreator({ rpc } as never, { handle: "a" })).toBe(false);
    expect(await readWithdrawnCreator({ rpc } as never, { creatorId: "not-a-uuid" })).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("INV-S15 (실패경로): DB 오류는 삼키지 않고 던진다 — 오류 화면이 뜬다", async () => {
    await expect(readWithdrawnCreator({ rpc: rpcReturning(null, { code: "57014" }) } as never, { handle: "haru" })).rejects.toThrow("57014");
  });
});
