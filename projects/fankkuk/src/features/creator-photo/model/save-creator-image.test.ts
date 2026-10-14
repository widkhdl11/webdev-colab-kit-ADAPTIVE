import { describe, expect, it, vi } from "vitest";
import { removeCreatorImage, saveCreatorImage, SYMBOL_RIGHTS_REQUIRED } from "./save-creator-image";

// 배경사진·팬덤 심볼 저장의 앞문 (creator-link INV-E1·E12). 저장소·DB 는 가짜로 두고, 거를 요청이 저장소·DB 에 닿기 전에 멈추는지만 본다.
// 실제 저장·사진 정보 지우기·DB 거부는 통합 시험(tests/integration/creator-look-db)이 본다.

function fakeAdmin() {
  const rpc = vi.fn();
  const upload = vi.fn();
  const remove = vi.fn();
  return { admin: { rpc, storage: { from: () => ({ upload, remove }) } } as never, rpc, upload, remove };
}

const png = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

describe("INV-E12: 심볼은 권리 확인 체크가 있어야", () => {
  it("INV-E12 (실패경로): 체크 없이 심볼을 올리면 저장소·DB 를 부르지 않고 거부한다", async () => {
    const f = fakeAdmin();
    const r = await saveCreatorImage({ admin: f.admin, viewer: { userId: "u1", role: "creator" } }, "symbol", png(), { rightsChecked: false });
    expect(r).toEqual({ ok: false, status: 400, message: SYMBOL_RIGHTS_REQUIRED });
    expect([f.rpc.mock.calls.length, f.upload.mock.calls.length]).toEqual([0, 0]);
  });
});

describe("INV-E1: 크리에이터 본인만", () => {
  it("INV-E1 (실패경로): 로그인 안 함·팬은 저장소·DB 를 부르지 않고 거부한다 — 지우기도 같다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "f1", role: "fan" as const }, 403],
    ] as const) {
      const f = fakeAdmin();
      expect(await saveCreatorImage({ admin: f.admin, viewer }, "background", png(), { rightsChecked: false })).toMatchObject({ ok: false, status });
      expect(await removeCreatorImage({ admin: f.admin, viewer }, "symbol")).toMatchObject({ ok: false, status });
      expect([f.rpc.mock.calls.length, f.upload.mock.calls.length, f.remove.mock.calls.length]).toEqual([0, 0, 0]);
    }
  });
});
