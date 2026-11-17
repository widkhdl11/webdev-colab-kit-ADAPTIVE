// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCreatorAddress } from "./send-creator-address";

// 브라우저의 결과 확인 답 나누기 (address-protection INV-P22 ②) — 서버 오류(500)를 「아직 기다림」으로 치지 않는다.
afterEach(() => vi.unstubAllGlobals());
const reply = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe("checkCreatorAddress", () => {
  it("INV-P22 ②: 500(503 제외)은 error — pending 이 아니다", async () => {
    reply(500, { message: "요청을 처리하지 못했습니다." });
    expect(await checkCreatorAddress("r")).toEqual({ kind: "error" });
  });
  it("INV-P22 ②: 503 은 서버 문구 그대로(refused), 연결이 끊기면 pending", async () => {
    reply(503, { message: "현재 주소를 변경할 수 없습니다." });
    expect(await checkCreatorAddress("r")).toEqual({ kind: "refused", message: "현재 주소를 변경할 수 없습니다." });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await checkCreatorAddress("r")).toEqual({ kind: "pending" });
  });
  it("INV-P22 ②: 200 상태는 그대로", async () => {
    reply(200, { state: "rejected" });
    expect(await checkCreatorAddress("r")).toEqual({ kind: "rejected" });
  });
});
