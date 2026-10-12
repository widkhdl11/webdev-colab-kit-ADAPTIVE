import { afterEach, describe, expect, it, vi } from "vitest";
import { readMyRevgiftAccessLog } from "./revgift-reads";

// INV-R16: 팬 열람 기록 읽기 — 몫 번호만 넘기고(사람 ID 없음), 읽지 못하면 null + 값 없는 서버 로그.

const opened = { at: "2026-10-09T05:32:00+00:00", kind: "opened", print_no: 1, outcome: null, released: false };

function clientReturning(result: { data: unknown; error: { code: string; message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as Parameters<typeof readMyRevgiftAccessLog>[0], rpc };
}

afterEach(() => vi.restoreAllMocks());

describe("INV-R16: readMyRevgiftAccessLog", () => {
  it("INV-R16: my_revgift_access_log 에 몫 번호(p_order_no)만 넘기고 줄을 화면 모양으로 돌려준다", async () => {
    const { client, rpc } = clientReturning({ data: [opened], error: null });
    expect(await readMyRevgiftAccessLog(client, "RG-AB12CD0")).toEqual([
      { at: "2026-10-09T05:32:00.000Z", kind: "opened", printNo: 1, released: false },
    ]);
    expect(rpc).toHaveBeenCalledWith("my_revgift_access_log", { p_order_no: "RG-AB12CD0" });
  });

  it("INV-R16 (실패경로): DB 오류면 null, 서버 로그에는 오류 코드만(메시지·몫 번호 없이)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = clientReturning({ data: null, error: { code: "42501", message: "permission denied RG-AB12CD0" } });
    expect(await readMyRevgiftAccessLog(client, "RG-AB12CD0")).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    const text = log.mock.calls[0]?.map(String).join(" ") ?? "";
    expect(text).toContain("42501");
    expect(text).not.toContain("permission denied");
    expect(text).not.toContain("RG-AB12CD0");
  });

  it("INV-R16 (실패경로): 꼴이 다르면 null, 서버 로그에는 어긋난 경로·코드만(값 없이)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = clientReturning({ data: [{ ...opened, requester_id: "00000000-0000-4000-a000-000000000021" }], error: null });
    expect(await readMyRevgiftAccessLog(client, "RG-AB12CD0")).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    const text = log.mock.calls[0]?.map(String).join(" ") ?? "";
    expect(text).toContain("unrecognized_keys");
    expect(text).not.toContain("00000000-0000-4000-a000-000000000021");
    expect(text).not.toContain("RG-AB12CD0");
  });
});
