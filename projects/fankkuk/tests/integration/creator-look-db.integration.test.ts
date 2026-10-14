import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readCreatorLinkExtras, readMyCreatorLook } from "@/entities/creator/api/creator-link-reads";
import { NO_LOOK, previewImagePath } from "@/entities/creator/model/link-images";
import { removeCreatorImage, saveCreatorImage } from "@/features/creator-photo/model/save-creator-image";
import { savePreviewPick } from "@/features/creator-settings-save/model/save-creator-settings";
import { loadCreatorLinkPage } from "@/widgets/creator-profile/api/load-creator-link";
import { clearPhotos, linkClient, PHOTO_BUCKET_NAME, resetLink, verifyCreator } from "./creator-link-helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";
import { adminClient, anonClient, psql, SEED } from "./helpers";

// 「내 팬꾹 꾸미기」 — 프로필 배경사진·팬덤 심볼·링크 미리보기 이미지 고르기 (docs/specs/creator-link.md INV-E1·E7·E9·E10·E12).
// 저장 경로는 프로필 사진과 같다: 서버가 받아 열어 보고 사진 정보를 지운 뒤 다시 굽고, 저장소에는 서버의 비밀 키로만 쓴다.
// 크리에이터는 본인 확인 시험 계정(cvt_*) — 시험 동안만 확인된 상태로 둔다.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));

const A = CV.haru;
const B = CV.summer;
const BUCKET = PHOTO_BUCKET_NAME;

const asViewer = (c: (typeof CV)[keyof typeof CV]) => ({ userId: c.id, role: "creator" as const });
const blob = (buf: Buffer, type = "image/jpeg") => new Blob([new Uint8Array(buf)], { type });

/** 위치 정보(GPS)와 촬영 기기 정보를 넣은 JPEG. */
async function photoWithGps(width = 2000, height = 1000, color = "#e88"): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .jpeg()
    .withExif({ IFD0: { Make: "FankkukTestCam", Model: "Spy-1" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 33/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "126/1 58/1 0/1" } })
    .toBuffer();
}

async function storedNames(creatorId: string): Promise<string[]> {
  const r = await adminClient().storage.from(BUCKET).list(creatorId);
  return (r.data ?? []).map((f) => f.name).sort();
}

async function stored(path: string): Promise<Buffer> {
  const dl = await adminClient().storage.from(BUCKET).download(path);
  if (!dl.data) throw new Error(`저장된 파일이 없다: ${path}`);
  return Buffer.from(await dl.data.arrayBuffer());
}

const col = (creatorId: string, name: string) => psql(`select coalesce(${name}::text, '') from public.creators where id = '${creatorId}'`);

const admin = () => ({ admin: adminClient(), viewer: asViewer(A) });

beforeAll(async () => {
  createCvAccounts();
  resetLink();
  await clearPhotos();
});
beforeEach(async () => {
  resetLink();
  await clearPhotos();
  resetCv();
  verifyCreator(A.creatorId, "cvt-look-a");
  verifyCreator(B.creatorId, "cvt-look-b");
});
afterAll(async () => {
  resetLink();
  await clearPhotos();
  dropCvAccounts();
});

describe("INV-E9: 프로필 배경사진 — 서버가 열어 보고 사진 정보를 지우고 긴 변만 줄여 저장", () => {
  it("INV-E9: 위치 정보가 든 2000×1000 사진은 사진 정보 없는 1280×640 webp 로 저장된다 — 비율은 그대로, 원본은 어디에도 없다", async () => {
    const input = await photoWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    expect(await saveCreatorImage(admin(), "background", blob(input), { rightsChecked: false })).toMatchObject({ ok: true });
    const path = col(A.creatorId, "bg_path");
    expect(path).toBe(`${A.creatorId}/bg-1.webp`);
    expect(await storedNames(A.creatorId)).toEqual(["bg-1.webp"]);
    const file = await stored(path);
    const meta = await sharp(file).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 1280, 640]);
    expect([meta.exif, meta.icc, meta.xmp]).toEqual([undefined, undefined, undefined]);
    expect(file.includes(Buffer.from("FankkukTestCam"))).toBe(false);
    // 공개 주소로 누구나 읽힌다(프로필 사진과 같은 공개 읽기 저장소)
    const pub = await fetch(`${process.env.FK_TEST_API_URL}/storage/v1/object/public/${BUCKET}/${path}`);
    expect(pub.status).toBe(200);
  });

  it("INV-E9: 작은 배경사진은 키우지 않는다", async () => {
    await saveCreatorImage(admin(), "background", blob(await photoWithGps(600, 200)), { rightsChecked: false });
    const meta = await sharp(await stored(col(A.creatorId, "bg_path"))).metadata();
    expect([meta.width, meta.height]).toEqual([600, 200]);
  });

  it("INV-E9 (실패경로): 이미지 아닌 파일·gif·팬은 거부되고 아무것도 저장되지 않는다", async () => {
    expect(await saveCreatorImage(admin(), "background", new Blob(["<html>x</html>"], { type: "image/jpeg" }), { rightsChecked: false })).toMatchObject({ ok: false, status: 400 });
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).gif().toBuffer();
    expect(await saveCreatorImage(admin(), "background", blob(gif), { rightsChecked: false })).toMatchObject({ ok: false, status: 400 });
    expect(await saveCreatorImage({ admin: adminClient(), viewer: { userId: SEED.fanId, role: "fan" } }, "background", blob(await photoWithGps()), { rightsChecked: false })).toMatchObject({ ok: false, status: 403 });
    expect(await saveCreatorImage({ admin: adminClient(), viewer: null }, "background", blob(await photoWithGps()), { rightsChecked: false })).toMatchObject({ ok: false, status: 401 });
    expect(await storedNames(A.creatorId)).toEqual([]);
    expect(col(A.creatorId, "bg_version")).toBe("0");
  });

  it("INV-E9 S9c: 바꾸면 옛 파일을 지우고, 지우면 파일도 지운다 — 프로필 사진 파일은 건드리지 않는다", async () => {
    psql(`update public.creators set photo_version = 1, photo_path = id::text || '/1.webp' where id = '${A.creatorId}'`);
    await saveCreatorImage(admin(), "background", blob(await photoWithGps()), { rightsChecked: false });
    await saveCreatorImage(admin(), "background", blob(await photoWithGps(2000, 1000, "#8e8")), { rightsChecked: false });
    expect(await storedNames(A.creatorId)).toEqual(["bg-2.webp"]);
    expect(await removeCreatorImage(admin(), "background")).toMatchObject({ ok: true, path: null });
    expect(await storedNames(A.creatorId)).toEqual([]);
    expect([col(A.creatorId, "bg_path"), col(A.creatorId, "photo_path")]).toEqual(["", `${A.creatorId}/1.webp`]);
  });
});

describe("INV-E12·E9: 팬덤 심볼 — 권리 확인 체크 뒤에만, 정사각 512", () => {
  it("INV-E12 (실패경로): 권리 확인 체크 없이 올리면 서버가 거부하고 아무것도 저장되지 않는다", async () => {
    const r = await saveCreatorImage(admin(), "symbol", blob(await photoWithGps()), { rightsChecked: false });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(await storedNames(A.creatorId)).toEqual([]);
    expect([col(A.creatorId, "symbol_path"), col(A.creatorId, "symbol_rights_at"), col(A.creatorId, "symbol_version")]).toEqual(["", "", "0"]);
  });

  it("INV-E12 (실패경로): 심볼을 붙이는 DB 함수도 체크 없이는 거부한다 — 서버 코드를 건너뛰어도 막힌다", async () => {
    const r = await adminClient().rpc("set_creator_image", { p_profile_id: A.id, p_kind: "symbol", p_version: 1, p_rights_checked: false });
    expect(r.error?.code).toBe("P0095");
    expect(col(A.creatorId, "symbol_path")).toBe("");
  });

  it("INV-E12·E9: 체크하고 올리면 사진 정보 없는 512×512 webp 로 저장되고 체크한 시각이 같이 남는다", async () => {
    const before = Date.now();
    expect(await saveCreatorImage(admin(), "symbol", blob(await photoWithGps()), { rightsChecked: true })).toMatchObject({ ok: true });
    const path = col(A.creatorId, "symbol_path");
    expect(path).toBe(`${A.creatorId}/sym-1.webp`);
    const file = await stored(path);
    const meta = await sharp(file).metadata();
    expect([meta.format, meta.width, meta.height, meta.exif]).toEqual(["webp", 512, 512, undefined]);
    expect(file.includes(Buffer.from("FankkukTestCam"))).toBe(false);
    const at = Date.parse(col(A.creatorId, "symbol_rights_at"));
    expect(at).toBeGreaterThanOrEqual(before - 60_000);
  });

  it("INV-E12: 심볼을 지우면 체크 시각도 지우고, 미리보기 고르기는 프로필 사진으로 돌아간다", async () => {
    await saveCreatorImage(admin(), "symbol", blob(await photoWithGps()), { rightsChecked: true });
    expect(await savePreviewPick({ client: await linkClient(A.login), viewer: asViewer(A) }, { pick: "symbol" })).toEqual({ ok: true });
    expect(await removeCreatorImage(admin(), "symbol")).toMatchObject({ ok: true, path: null });
    expect([col(A.creatorId, "symbol_path"), col(A.creatorId, "symbol_rights_at"), col(A.creatorId, "preview_pick")]).toEqual(["", "", "photo"]);
    expect(await storedNames(A.creatorId)).toEqual([]);
  });
});

describe("INV-E1: 배경사진·심볼·미리보기 고르기는 본인만", () => {
  it("INV-E1 (실패경로): 사진 판을 정하는 DB 함수는 화면 쪽 키로 부를 수 없다", async () => {
    const me = await linkClient(A.login);
    expect((await me.rpc("creator_image_next", { p_profile_id: A.id, p_kind: "background" })).error).not.toBeNull();
    expect((await me.rpc("set_creator_image", { p_profile_id: A.id, p_kind: "background", p_version: 1, p_rights_checked: false })).error).not.toBeNull();
    expect((await anonClient().rpc("set_creator_image", { p_profile_id: A.id, p_kind: "symbol", p_version: 1, p_rights_checked: true })).error).not.toBeNull();
    expect([col(A.creatorId, "bg_version"), col(A.creatorId, "symbol_version")]).toEqual(["0", "0"]);
  });

  it("INV-E1 S1c (실패경로): 로그인한 크리에이터가 화면 쪽 키로 저장소에 배경사진·심볼 파일을 바로 올리면 거부된다", async () => {
    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).webp().toBuffer();
    const me = await linkClient(A.login);
    for (const name of ["bg-9.webp", "sym-9.webp"]) {
      expect((await me.storage.from(BUCKET).upload(`${A.creatorId}/${name}`, webp, { contentType: "image/webp" })).error).not.toBeNull();
    }
    expect(await storedNames(A.creatorId)).toEqual([]);
  });

  it("INV-E1: 미리보기 고르기 저장 함수에는 크리에이터를 고를 칸이 없다 — 로그인한 크리에이터 한 줄만 바뀐다", async () => {
    await saveCreatorImage({ admin: adminClient(), viewer: asViewer(B) }, "symbol", blob(await photoWithGps()), { rightsChecked: true });
    await saveCreatorImage(admin(), "symbol", blob(await photoWithGps()), { rightsChecked: true });
    const me = await linkClient(A.login);
    expect((await me.rpc("set_my_preview_pick", { p_pick: "symbol" })).error).toBeNull();
    expect([col(A.creatorId, "preview_pick"), col(B.creatorId, "preview_pick")]).toEqual(["symbol", "photo"]);
    expect((await me.rpc("set_my_preview_pick", { p_pick: "photo", p_creator_id: B.creatorId })).error).not.toBeNull();
  });

  it("INV-E1 (실패경로): 팬·로그인 안 함은 미리보기 고르기를 저장하지 못한다", async () => {
    const fan = await linkClient("byeolbit_fan");
    expect((await fan.rpc("set_my_preview_pick", { p_pick: "photo" })).error?.code).toBe("42501");
    expect((await anonClient().rpc("set_my_preview_pick", { p_pick: "photo" })).error).not.toBeNull();
    expect(await savePreviewPick({ client: fan, viewer: { userId: SEED.fanId, role: "fan" } }, { pick: "photo" })).toMatchObject({ ok: false, status: 403 });
  });

  it("INV-E10 (실패경로): 심볼이 없으면 심볼을 고를 수 없다 — 정해진 두 값 밖도 거부", async () => {
    const me = await linkClient(A.login);
    expect((await me.rpc("set_my_preview_pick", { p_pick: "symbol" })).error?.code).toBe("P0096");
    expect((await me.rpc("set_my_preview_pick", { p_pick: "logo" })).error?.code).toBe("22023");
    expect(await savePreviewPick({ client: me, viewer: asViewer(A) }, { pick: "symbol" })).toMatchObject({ ok: false, status: 400 });
    expect(col(A.creatorId, "preview_pick")).toBe("photo");
  });
});

describe("INV-E7: 공개 읽기는 공개 칸만", () => {
  it("INV-E7: 공개 읽기 함수는 배경사진·심볼 경로·미리보기 고르기를 더해 돌려준다 — 체크 시각·판 번호는 없다", async () => {
    await saveCreatorImage(admin(), "background", blob(await photoWithGps()), { rightsChecked: false });
    await saveCreatorImage(admin(), "symbol", blob(await photoWithGps()), { rightsChecked: true });
    await savePreviewPick({ client: await linkClient(A.login), viewer: asViewer(A) }, { pick: "symbol" });
    const raw = await anonClient().rpc("creator_link_extras", { p_creator_id: A.creatorId });
    expect(raw.error).toBeNull();
    const row = (raw.data as Record<string, unknown>[])[0]!;
    expect(Object.keys(row).sort()).toEqual(["bg_path", "channel_key", "channel_url", "fan_name", "platform", "preview_pick", "symbol_path", "verified_on"]);
    expect(JSON.stringify(row)).not.toMatch(/rights/);
    const extras = await readCreatorLinkExtras(anonClient(), A.creatorId);
    expect(extras.look).toEqual({ bgPath: `${A.creatorId}/bg-1.webp`, symbolPath: `${A.creatorId}/sym-1.webp`, previewPick: "symbol" });
  });

  it("INV-E7 (실패경로): 본인 확인 전 크리에이터는 배경사진·심볼도 읽히지 않는다", async () => {
    await saveCreatorImage(admin(), "background", blob(await photoWithGps()), { rightsChecked: false });
    psql(`begin; set local session_replication_role = replica; update public.creators set identity_verified = false where id = '${A.creatorId}'; commit;`);
    expect((await anonClient().rpc("creator_link_extras", { p_creator_id: A.creatorId })).data).toEqual([]);
    expect((await readCreatorLinkExtras(anonClient(), A.creatorId)).look).toEqual(NO_LOOK);
  });

  it("INV-E1: 본인 꾸미기 읽기는 로그인한 크리에이터 본인 것만 — 팬·로그인 안 함은 읽지 못한다", async () => {
    await saveCreatorImage(admin(), "symbol", blob(await photoWithGps()), { rightsChecked: true });
    expect(await readMyCreatorLook(await linkClient(A.login))).toEqual({ bgPath: null, symbolPath: `${A.creatorId}/sym-1.webp`, previewPick: "photo" });
    expect(await readMyCreatorLook(await linkClient(B.login))).toEqual(NO_LOOK);
    expect(await readMyCreatorLook(await linkClient("byeolbit_fan"))).toBeNull();
    expect((await anonClient().rpc("my_creator_look")).error).not.toBeNull();
  });
});

describe("INV-E9·E10: 링크 페이지와 미리보기 주소", () => {
  it("INV-E9: 심볼을 고르면 미리보기 주소의 판이 심볼 판으로, 심볼을 바꾸면 다시 바뀐다", async () => {
    const pathOf = async () => {
      const page = await loadCreatorLinkPage({ client: anonClient(), viewer: null, creatorId: A.creatorId, photoBase: "http://photo.test" });
      return previewImagePath(page!.props.creator, page!.props.look);
    };
    expect(await pathOf()).toBe(`/api/og/${A.creatorId}?v=0`);
    await saveCreatorImage(admin(), "symbol", blob(await photoWithGps()), { rightsChecked: true });
    expect(await pathOf()).toBe(`/api/og/${A.creatorId}?v=0`);
    await savePreviewPick({ client: await linkClient(A.login), viewer: asViewer(A) }, { pick: "symbol" });
    expect(await pathOf()).toBe(`/api/og/${A.creatorId}?v=s1`);
    await saveCreatorImage(admin(), "symbol", blob(await photoWithGps(800, 800, "#88e")), { rightsChecked: true });
    expect(await pathOf()).toBe(`/api/og/${A.creatorId}?v=s2`);
  });

  it("INV-E7: 링크 페이지 데이터의 배경사진은 공개 저장소 주소, 없으면 null", async () => {
    const empty = await loadCreatorLinkPage({ client: anonClient(), viewer: null, creatorId: A.creatorId, photoBase: "http://photo.test" });
    expect(empty!.props.backgroundUrl).toBeNull();
    await saveCreatorImage(admin(), "background", blob(await photoWithGps()), { rightsChecked: false });
    const page = await loadCreatorLinkPage({ client: anonClient(), viewer: null, creatorId: A.creatorId, photoBase: "http://photo.test" });
    expect(page!.props.backgroundUrl).toBe(`http://photo.test/storage/v1/object/public/${BUCKET}/${A.creatorId}/bg-1.webp`);
  });
});
