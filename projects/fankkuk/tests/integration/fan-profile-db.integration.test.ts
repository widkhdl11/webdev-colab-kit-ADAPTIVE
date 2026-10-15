import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFanProfile } from "@/entities/fan/api/read-fan-profile";
import { FAN_PHOTO_BUCKET } from "@/entities/fan/model/fan-profile";
import { removeFanImage, saveFanImage } from "@/features/fan-profile-edit/model/save-fan-image";
import { saveFanIntro } from "@/features/fan-profile-edit/model/save-fan-intro";
import { adminClient, anonClient, psql, SEED, signedInClient } from "./helpers";

// 팬 프로필 — 사진·배경 사진·자기소개 (docs/specs/my-account.md INV-A12~A14, S12~S14b).
// 소개는 로그인 토큰의 팬 한 줄만 고치고(A12), 누구나 네 칸만 읽고(A13), 사진은 서버가 다시 그려 공개 저장소에 서버 키로만 쓴다(A14).

const BYEOL = SEED.fanId;
const DAL = SEED.otherFanId;
const HARU = SEED.creatorProfileId;
const BUCKET = FAN_PHOTO_BUCKET;

const fanViewer = (userId: string) => ({ userId, role: "fan" as const });
const blob = (buf: Buffer, type = "image/jpeg") => new Blob([new Uint8Array(buf)], { type });
const introOf = (id: string) => psql(`select fan_intro from public.profiles where id = '${id}'`);
const colOf = (id: string, col: string) => psql(`select coalesce(${col}::text, '') from public.profiles where id = '${id}'`);

/** 위치 정보(GPS)와 촬영 기기 정보를 넣은 JPEG. */
async function photoWithGps(width = 1200, height = 800, color = "#8ce"): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .jpeg()
    .withExif({ IFD0: { Make: "FankkukFanCam", Model: "Spy-2" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 33/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "126/1 58/1 0/1" } })
    .toBuffer();
}

async function storedNames(profileId: string): Promise<string[]> {
  const r = await adminClient().storage.from(BUCKET).list(profileId);
  return (r.data ?? []).map((f) => f.name).filter((n) => n !== ".emptyFolderPlaceholder").sort();
}

async function clearFanPhotos(): Promise<void> {
  const admin = adminClient();
  for (const id of [BYEOL, DAL]) {
    const names = await storedNames(id);
    if (names.length > 0) await admin.storage.from(BUCKET).remove(names.map((n) => `${id}/${n}`));
  }
}

/** 별빛·달토끼 프로필을 빈 값으로 — 칸이 없을 때(구현 전 빨간불)도 멈추지 않게. */
function resetProfiles(): void {
  psql(
    `do $$ begin
       if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'fan_intro') then
         update public.profiles set fan_intro = '', fan_photo_path = null, fan_photo_version = 0, fan_bg_path = null, fan_bg_version = 0
         where id in ('${BYEOL}', '${DAL}', '${HARU}');
       end if;
       update public.profiles set nickname = '별빛' where id = '${BYEOL}';
       update public.profiles set nickname = '달토끼' where id = '${DAL}';
     end $$;`,
  );
}

const PROFILE_KEYS = ["bg_path", "intro", "nickname", "photo_path"];

beforeEach(async () => {
  resetProfiles();
  await clearFanPhotos();
});
afterAll(async () => {
  resetProfiles();
  await clearFanPhotos();
});

describe("INV-A12: 팬 프로필은 그 팬 본인만 바꾼다", () => {
  it("INV-A12 S12: 별빛 로그인으로 소개를 저장하면 별빛의 소개만 바뀐다", async () => {
    const byeol = await signedInClient("byeolbit_fan");
    const r = await byeol.rpc("update_my_fan_profile", { p_intro: "  밤마다 방송 챙겨 보는 사람  " });
    expect(r.error).toBeNull();
    expect(introOf(BYEOL)).toBe("밤마다 방송 챙겨 보는 사람");
    expect(introOf(DAL)).toBe("");
  });

  it("INV-A12 S12: 서버 저장 경로도 세션의 팬 한 줄만 고친다 — 본문의 계정 ID 는 읽지 않는다", async () => {
    const byeol = await signedInClient("byeolbit_fan");
    const r = await saveFanIntro({ client: byeol, viewer: fanViewer(BYEOL) }, { intro: "작은 선물로 응원해요", profileId: DAL, accountId: DAL });
    expect(r).toEqual({ ok: true, intro: "작은 선물로 응원해요" });
    expect([introOf(BYEOL), introOf(DAL)]).toEqual(["작은 선물로 응원해요", ""]);
  });

  it("INV-A12 S12: 닉네임은 내 정보 고치기 경로로 바뀌고, 남이 쓰는 닉네임이면 「이미 쓰는 닉네임」(FKU04)", async () => {
    const byeol = await signedInClient("byeolbit_fan");
    const taken = await byeol.rpc("update_my_account", { p_nickname: "달토끼", p_email: "byeolbit.fan@example.com", p_notify_kakao: true, p_notify_email: true });
    expect(taken.error?.code).toBe("FKU04");
    expect(colOf(BYEOL, "nickname")).toBe("별빛");
  });

  it("INV-A12 S12b (실패경로): 함수 인자에 계정 ID 를 넣으면 함수를 못 찾아 거부되고 달토끼·별빛 모두 그대로", async () => {
    const byeol = await signedInClient("byeolbit_fan");
    const r = await byeol.rpc("update_my_fan_profile", { p_intro: "남의 소개", p_profile_id: DAL });
    expect(r.error).not.toBeNull();
    expect([introOf(BYEOL), introOf(DAL)]).toEqual(["", ""]);
  });

  it("INV-A12 S12b (실패경로): 서버 경로 — 소개 101자·전화번호는 400, 아무 칸도 안 바뀐다", async () => {
    const byeol = await signedInClient("byeolbit_fan");
    const deps = { client: byeol, viewer: fanViewer(BYEOL) };
    expect(await saveFanIntro(deps, { intro: "가".repeat(101) })).toMatchObject({ ok: false, status: 400 });
    expect(await saveFanIntro(deps, { intro: "연락 주세요 010-1234-5678" })).toMatchObject({ ok: false, status: 400 });
    expect(await saveFanIntro(deps, { intro: "인스타 fan@example.com" })).toMatchObject({ ok: false, status: 400 });
    expect(introOf(BYEOL)).toBe("");
  });

  it("INV-A12 S12b (실패경로): DB 함수를 직접 불러 101자·줄바꿈 → 22023, 전화번호 → FKF02, 금칙어 → FKF01, 변화 없음", async () => {
    const byeol = await signedInClient("byeolbit_fan");
    expect((await byeol.rpc("update_my_fan_profile", { p_intro: "가".repeat(101) })).error?.code).toBe("22023");
    expect((await byeol.rpc("update_my_fan_profile", { p_intro: "첫 줄\n둘째 줄" })).error?.code).toBe("22023");
    expect((await byeol.rpc("update_my_fan_profile", { p_intro: "연락 주세요 01012345678" })).error?.code).toBe("FKF02");
    expect((await byeol.rpc("update_my_fan_profile", { p_intro: "시발" })).error?.code).toBe("FKF01");
    expect(introOf(BYEOL)).toBe("");
    // 100자는 받는다(경계)
    expect((await byeol.rpc("update_my_fan_profile", { p_intro: "가".repeat(100) })).error).toBeNull();
    expect(introOf(BYEOL)).toBe("가".repeat(100));
  });

  it("INV-A12 S12b (실패경로): 표 제약 — DB 소유자가 직접 101자를 넣어도 거부된다", () => {
    expect(() => psql(`update public.profiles set fan_intro = repeat('가', 101) where id = '${BYEOL}'`)).toThrow();
    expect(introOf(BYEOL)).toBe("");
  });

  it("INV-A12 S12b (실패경로): 크리에이터·로그인 안 함으로 부르면 거부된다", async () => {
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("update_my_fan_profile", { p_intro: "크리에이터 소개" })).error?.code).toBe("42501");
    expect((await anonClient().rpc("update_my_fan_profile", { p_intro: "익명 소개" })).error).not.toBeNull();
    expect(colOf(HARU, "fan_intro")).toBe("");
    expect([introOf(BYEOL), introOf(DAL)]).toEqual(["", ""]);
  });
});

describe("INV-A13: 팬 프로필은 누구나 읽지만 네 칸뿐이다", () => {
  async function seedByeol(): Promise<void> {
    const byeol = await signedInClient("byeolbit_fan");
    expect((await byeol.rpc("update_my_fan_profile", { p_intro: "밤마다 방송 챙겨 보는 사람" })).error).toBeNull();
    expect(await saveFanImage({ admin: adminClient(), viewer: fanViewer(BYEOL) }, "photo", blob(await photoWithGps(400, 400)))).toMatchObject({ ok: true });
  }

  it("INV-A13 S13: 로그인 안 함·달토끼(팬)·하루(크리에이터)·직원 모두 별빛의 닉네임·사진·배경·소개를 읽는다", async () => {
    await seedByeol();
    const readers = [anonClient(), await signedInClient("daltokki_fan"), await signedInClient("haru_creator"), await signedInClient("fankkuk_staff")];
    for (const c of readers) {
      const { data, error } = await c.rpc("fan_profile", { p_profile_id: BYEOL });
      expect(error).toBeNull();
      expect(data).toEqual([{ nickname: "별빛", photo_path: `${BYEOL}/p-1.webp`, bg_path: null, intro: "밤마다 방송 챙겨 보는 사람" }]);
    }
    // 화면 쪽 읽기 함수도 같은 네 칸을 준다
    expect(await readFanProfile(anonClient(), BYEOL)).toEqual({ nickname: "별빛", photoPath: `${BYEOL}/p-1.webp`, bgPath: null, intro: "밤마다 방송 챙겨 보는 사람" });
  });

  it("INV-A13 S13b (실패경로): 로그인 안 함으로 읽은 응답은 네 칸뿐 — 아이디·휴대폰·이메일·주문번호가 어디에도 없다", async () => {
    await seedByeol();
    const orderNo = psql(`select coalesce((select order_no from public.orders where fan_id = '${BYEOL}' limit 1), '')`);
    const { data, error } = await anonClient().rpc("fan_profile", { p_profile_id: BYEOL });
    expect(error).toBeNull();
    const rows = data as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(PROFILE_KEYS);
    const text = JSON.stringify(data);
    for (const leak of ["byeolbit_fan", "01012345678", "1234-5678", "byeolbit.fan@example.com"]) {
      expect(text).not.toContain(leak);
    }
    if (orderNo) expect(text).not.toContain(orderNo);
  });

  it("INV-A13 S13b (실패경로): 크리에이터 계정의 팬 프로필은 빈 결과", async () => {
    const { data, error } = await anonClient().rpc("fan_profile", { p_profile_id: HARU });
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await readFanProfile(anonClient(), HARU)).toBeNull();
  });
});

describe("INV-A14: 사진은 서버가 다시 그려 공개 저장소에 서버 키로만 쓴다", () => {
  const deps = () => ({ admin: adminClient(), viewer: fanViewer(BYEOL) });

  it("INV-A14 S14: 위치 정보가 든 JPG 는 사진 정보 없는 512×512 webp 로 저장되고, 공개 주소로 누구나 연다", async () => {
    const input = await photoWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    expect(await saveFanImage(deps(), "photo", blob(input))).toEqual({ ok: true, path: `${BYEOL}/p-1.webp` });
    expect(colOf(BYEOL, "fan_photo_path")).toBe(`${BYEOL}/p-1.webp`);
    expect(await storedNames(BYEOL)).toEqual(["p-1.webp"]);
    const dl = await adminClient().storage.from(BUCKET).download(`${BYEOL}/p-1.webp`);
    const file = Buffer.from(await dl.data!.arrayBuffer());
    const meta = await sharp(file).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 512, 512]);
    expect([meta.exif, meta.icc, meta.xmp]).toEqual([undefined, undefined, undefined]);
    expect(file.includes(Buffer.from("FankkukFanCam"))).toBe(false);
    const pub = await fetch(`${process.env.FK_TEST_API_URL}/storage/v1/object/public/${BUCKET}/${BYEOL}/p-1.webp`);
    expect(pub.status).toBe(200);
  });

  it("INV-A14 S14: 배경 사진은 긴 변 1280 으로 줄여 저장된다(비율 그대로)", async () => {
    expect(await saveFanImage(deps(), "background", blob(await photoWithGps(2000, 1000)))).toEqual({ ok: true, path: `${BYEOL}/bg-1.webp` });
    const dl = await adminClient().storage.from(BUCKET).download(`${BYEOL}/bg-1.webp`);
    const meta = await sharp(Buffer.from(await dl.data!.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height, meta.exif]).toEqual(["webp", 1280, 640, undefined]);
    expect(colOf(BYEOL, "fan_bg_path")).toBe(`${BYEOL}/bg-1.webp`);
  });

  it("INV-A14 S14: 사진을 바꾸면 판 값이 바뀌고 옛 파일은 저장소에 없다 — 지우면 파일도 없다", async () => {
    await saveFanImage(deps(), "photo", blob(await photoWithGps(300, 300, "#f00")));
    expect(await saveFanImage(deps(), "photo", blob(await photoWithGps(300, 300, "#0f0")))).toEqual({ ok: true, path: `${BYEOL}/p-2.webp` });
    expect(await storedNames(BYEOL)).toEqual(["p-2.webp"]);
    const old = await fetch(`${process.env.FK_TEST_API_URL}/storage/v1/object/public/${BUCKET}/${BYEOL}/p-1.webp`);
    expect(old.status).not.toBe(200);
    expect(await removeFanImage(deps(), "photo")).toEqual({ ok: true, path: null });
    expect(await storedNames(BYEOL)).toEqual([]);
    expect(colOf(BYEOL, "fan_photo_path")).toBe("");
  });

  it("INV-A14 S14b (실패경로): 별빛·달토끼·로그인 안 함이 화면 쪽 키로 저장소에 바로 올리거나 덮어쓰거나 지우면 거부된다", async () => {
    await saveFanImage(deps(), "photo", blob(await photoWithGps(300, 300)));
    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).webp().toBuffer();
    const byeol = await signedInClient("byeolbit_fan");
    const dal = await signedInClient("daltokki_fan");
    expect((await byeol.storage.from(BUCKET).upload(`${BYEOL}/p-9.webp`, webp, { contentType: "image/webp" })).error).not.toBeNull();
    expect((await anonClient().storage.from(BUCKET).upload(`${BYEOL}/p-8.webp`, webp, { contentType: "image/webp" })).error).not.toBeNull();
    expect((await dal.storage.from(BUCKET).upload(`${BYEOL}/p-1.webp`, webp, { contentType: "image/webp", upsert: true })).error).not.toBeNull();
    expect((await dal.storage.from(BUCKET).update(`${BYEOL}/p-1.webp`, webp, { contentType: "image/webp" })).error).not.toBeNull();
    await dal.storage.from(BUCKET).remove([`${BYEOL}/p-1.webp`]);
    await byeol.storage.from(BUCKET).remove([`${BYEOL}/p-1.webp`]);
    expect(await storedNames(BYEOL)).toEqual(["p-1.webp"]);
    // 화면 쪽 키의 저장소 쓰기 정책이 하나도 없다
    expect(psql(`select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') || coalesce(with_check, '')) like '%fan-photos%'`)).toBe("0");
  });

  it("INV-A14 S14b (실패경로): 판을 정하는 DB 함수는 화면 쪽 키로 부를 수 없다", async () => {
    const byeol = await signedInClient("byeolbit_fan");
    expect((await byeol.rpc("fan_image_next", { p_profile_id: BYEOL, p_kind: "photo" })).error).not.toBeNull();
    expect((await byeol.rpc("set_fan_image", { p_profile_id: BYEOL, p_kind: "photo", p_version: 1 })).error).not.toBeNull();
    expect((await anonClient().rpc("set_fan_image", { p_profile_id: BYEOL, p_kind: "photo", p_version: 1 })).error).not.toBeNull();
    expect(colOf(BYEOL, "fan_photo_version")).toBe("0");
  });

  it("INV-A14 (실패경로): 다음 판이 아닌 번호로 붙이면(그 사이 다른 요청이 바꿈) 40001, 경로·판 그대로", async () => {
    await saveFanImage(deps(), "photo", blob(await photoWithGps(300, 300)));
    const stale = await adminClient().rpc("set_fan_image", { p_profile_id: BYEOL, p_kind: "photo", p_version: 1 });
    expect(stale.error?.code).toBe("40001");
    const skip = await adminClient().rpc("set_fan_image", { p_profile_id: BYEOL, p_kind: "photo", p_version: 5 });
    expect(skip.error?.code).toBe("40001");
    expect([colOf(BYEOL, "fan_photo_path"), colOf(BYEOL, "fan_photo_version")]).toEqual([`${BYEOL}/p-1.webp`, "1"]);
  });

  it("INV-A14 S14b (실패경로): 11MB 파일·이미지가 아닌 파일은 400, 저장 없음", async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 1);
    expect(await saveFanImage(deps(), "photo", blob(big))).toMatchObject({ ok: false, status: 400 });
    expect(await saveFanImage(deps(), "background", blob(Buffer.from("not an image at all"), "image/png"))).toMatchObject({ ok: false, status: 400 });
    expect(await storedNames(BYEOL)).toEqual([]);
    expect([colOf(BYEOL, "fan_photo_version"), colOf(BYEOL, "fan_bg_version")]).toEqual(["0", "0"]);
  });

  it("INV-A14 (실패경로): 크리에이터 계정은 팬 사진을 올리지 못한다 — 저장소·DB 에 닿지 않는다", async () => {
    const r = await saveFanImage({ admin: adminClient(), viewer: { userId: HARU, role: "creator" } }, "photo", blob(await photoWithGps(300, 300)));
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(await storedNames(HARU)).toEqual([]);
  });
});
