import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { removeFanImage, saveFanImage } from "./save-fan-image";

// 팬 사진 저장의 앞문 (docs/specs/my-account.md INV-A14). 저장소·DB 는 가짜로 두고 거를 요청이 닿기 전에 멈추는지,
// 저장 경로가 세션의 계정으로 정해지는지, 저장되는 것이 다시 그린 webp 인지 본다. 실제 저장소 거부는 통합 시험이 본다.

function fakeAdmin(nextVersion = 1, oldPath: string | null = null) {
  const rpc = vi.fn(async (fn: string): Promise<{ data: unknown; error: { code: string } | null }> => {
    if (fn === "fan_image_next") return { data: nextVersion, error: null };
    return { data: oldPath, error: null };
  });
  const upload = vi.fn(async () => ({ data: {}, error: null }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const from = vi.fn((bucket: string) => {
    void bucket;
    return { upload, remove };
  });
  return { admin: { rpc, storage: { from } } as never, rpc, upload, remove, from };
}

const jpegWithGps = () =>
  sharp({ create: { width: 64, height: 32, channels: 3, background: "#8ce" } })
    .jpeg()
    .withExif({ IFD0: { Make: "UnitCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 33/1 0/1" } })
    .toBuffer();
const blob = (b: Buffer, type = "image/jpeg") => new Blob([new Uint8Array(b)], { type });
const FAN = { userId: "f1", role: "fan" as const };

describe("INV-A14: 팬 사진은 팬 본인만, 서버가 다시 그려서", () => {
  it("INV-A14 (실패경로): 로그인 안 함·크리에이터는 저장소·DB 를 부르지 않고 거부한다 — 지우기도 같다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "c1", role: "creator" as const }, 403],
    ] as const) {
      const f = fakeAdmin();
      expect(await saveFanImage({ admin: f.admin, viewer }, "photo", blob(await jpegWithGps()))).toMatchObject({ ok: false, status });
      expect(await removeFanImage({ admin: f.admin, viewer }, "background")).toMatchObject({ ok: false, status });
      expect([f.rpc.mock.calls.length, f.upload.mock.calls.length, f.remove.mock.calls.length]).toEqual([0, 0, 0]);
    }
  });

  it("INV-A14 (실패경로): 이미지가 아닌 파일·빈 파일은 저장소·DB 를 부르지 않고 400", async () => {
    const f = fakeAdmin();
    expect(await saveFanImage({ admin: f.admin, viewer: FAN }, "photo", blob(Buffer.from("hello"), "image/png"))).toMatchObject({ ok: false, status: 400 });
    expect(await saveFanImage({ admin: f.admin, viewer: FAN }, "photo", null)).toMatchObject({ ok: false, status: 400 });
    expect([f.rpc.mock.calls.length, f.upload.mock.calls.length]).toEqual([0, 0]);
  });

  it("INV-A14: 판과 사람은 세션의 계정으로 정하고, 다시 그린 webp(사진 정보 없음)를 fan-photos 에 덮어쓰기 없이 올린 뒤 옛 파일을 지운다", async () => {
    const f = fakeAdmin(3, "f1/p-2.webp");
    const r = await saveFanImage({ admin: f.admin, viewer: FAN }, "photo", blob(await jpegWithGps()));
    expect(r).toEqual({ ok: true, path: "f1/p-3.webp" });
    expect(f.rpc.mock.calls).toEqual([
      ["fan_image_next", { p_profile_id: "f1", p_kind: "photo" }],
      ["set_fan_image", { p_profile_id: "f1", p_kind: "photo", p_version: 3 }],
    ]);
    expect(f.from.mock.calls.map((c) => c[0])).toEqual(["fan-photos", "fan-photos"]);
    const [path, body, opts] = f.upload.mock.calls[0] as unknown as [string, Buffer, { contentType: string; upsert: boolean }];
    expect([path, opts.contentType, opts.upsert]).toEqual(["f1/p-3.webp", "image/webp", false]);
    const meta = await sharp(body).metadata();
    expect([meta.format, meta.width, meta.height, meta.exif]).toEqual(["webp", 512, 512, undefined]);
    expect(f.remove.mock.calls).toEqual([[["f1/p-2.webp"]]]);
  });

  it("INV-A14: 배경 사진은 bg-{판}.webp, 긴 변만 줄인다(작은 사진은 키우지 않는다)", async () => {
    const f = fakeAdmin(1, null);
    expect(await saveFanImage({ admin: f.admin, viewer: FAN }, "background", blob(await jpegWithGps()))).toEqual({ ok: true, path: "f1/bg-1.webp" });
    const body = (f.upload.mock.calls[0] as unknown as [string, Buffer])[1];
    const meta = await sharp(body).metadata();
    expect([meta.width, meta.height]).toEqual([64, 32]);
    expect(f.remove).not.toHaveBeenCalled();
  });

  it("INV-A14 (실패경로): 붙이기 직전에 다른 요청이 판을 올렸으면(40001) 방금 올린 파일을 지우고 409", async () => {
    const f = fakeAdmin(1, null);
    f.rpc.mockImplementation(async (fn: string) =>
      fn === "fan_image_next" ? { data: 1, error: null } : { data: null, error: { code: "40001" } },
    );
    expect(await saveFanImage({ admin: f.admin, viewer: FAN }, "photo", blob(await jpegWithGps()))).toMatchObject({ ok: false, status: 409 });
    expect(f.remove.mock.calls).toEqual([[["f1/p-1.webp"]]]);
  });

  it("INV-A14: 지우기는 판을 떼고 옛 파일을 지운다", async () => {
    const f = fakeAdmin(1, "f1/bg-4.webp");
    expect(await removeFanImage({ admin: f.admin, viewer: FAN }, "background")).toEqual({ ok: true, path: null });
    expect(f.rpc.mock.calls).toEqual([["set_fan_image", { p_profile_id: "f1", p_kind: "background", p_version: null }]]);
    expect(f.remove.mock.calls).toEqual([[["f1/bg-4.webp"]]]);
  });
});
