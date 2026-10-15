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

describe("INV-E1: 올리기 오류 — 「이미 있음」만 409, 오래 남은 파일은 치우고 다시", () => {
  const CREATOR = { userId: "u1", role: "creator" as const };
  const CREATOR_ID = "00000000-0000-4000-b000-000000000001";
  const NOW = Date.parse("2026-10-16T12:00:00Z");
  const jpeg = async () => {
    const sharp = (await import("sharp")).default;
    const buf = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#8ce" } }).jpeg().toBuffer();
    return new Blob([new Uint8Array(buf)], { type: "image/jpeg" });
  };
  function storageFake(ageMs: number) {
    const rpc = vi.fn(async (fn: string) =>
      fn === "creator_image_next"
        ? { data: [{ creator_id: CREATOR_ID, next_version: 2 }], error: null }
        : { data: [{ old_path: null, preview_pick: "photo" }], error: null },
    );
    const upload = vi.fn();
    const remove = vi.fn(async () => ({ data: [], error: null }));
    const list = vi.fn(async () => ({ data: [{ name: "bg-2.webp", created_at: new Date(NOW - ageMs).toISOString() }], error: null }));
    return { admin: { rpc, storage: { from: () => ({ upload, remove, list }) } } as never, rpc, upload, remove };
  }
  const DUPLICATE = { data: null, error: { message: "The resource already exists", statusCode: "409" } };

  it("INV-E1 (실패경로): 방금 생긴 같은 판 파일 → 409, 지우지 않는다 / 다른 올리기 오류 → 던진다(500)", async () => {
    const fresh = storageFake(1_000);
    fresh.upload.mockResolvedValue(DUPLICATE);
    expect(await saveCreatorImage({ admin: fresh.admin, viewer: CREATOR, now: () => NOW }, "background", await jpeg(), { rightsChecked: false })).toMatchObject({ ok: false, status: 409 });
    expect(fresh.remove).not.toHaveBeenCalled();
    const broken = storageFake(1_000);
    broken.upload.mockResolvedValue({ data: null, error: { message: "Internal Server Error", statusCode: "500" } });
    await expect(saveCreatorImage({ admin: broken.admin, viewer: CREATOR, now: () => NOW }, "background", await jpeg(), { rightsChecked: false })).rejects.toThrow();
  });

  it("INV-E1: 오래 남은 같은 판 파일은 지우고 한 번 다시 올려 붙인다", async () => {
    const f = storageFake(10 * 60_000);
    f.upload.mockResolvedValueOnce(DUPLICATE).mockResolvedValueOnce({ data: {}, error: null });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await saveCreatorImage({ admin: f.admin, viewer: CREATOR, now: () => NOW }, "background", await jpeg(), { rightsChecked: false });
    log.mockRestore();
    expect(r).toEqual({ ok: true, path: `${CREATOR_ID}/bg-2.webp`, previewPick: "photo" });
    expect(f.remove.mock.calls[0]).toEqual([[`${CREATOR_ID}/bg-2.webp`]]);
    expect(f.upload).toHaveBeenCalledTimes(2);
  });
});
