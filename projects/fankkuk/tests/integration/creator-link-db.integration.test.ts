import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noticeImageInput, previewImageInput, previewImagePath } from "@/entities/creator/model/link-images";
import { removeCreatorPhoto, saveCreatorPhoto } from "@/features/creator-photo/model/save-creator-photo";
import { loadCreatorLinkPage } from "@/widgets/creator-profile/api/load-creator-link";
import { CreatorProfilePage } from "@/widgets/creator-profile/ui/creator-profile-page";
import { ImageResponse } from "next/og";
import { readImageFont, readLogoDataUrl, readPhotoDataUrl } from "@/widgets/link-images/api/image-assets";
import { NoticeImageCard, PreviewImageCard } from "@/widgets/link-images/ui/link-image-cards";
import { clearPhotos, insertOrder, linkClient, PHOTO_BUCKET_NAME, resetLink, setHandle, setHandleOk, unlockHandle, verifyCreator } from "./creator-link-helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";
import { adminClient, anonClient, deleteTestOrders, psql, SEED } from "./helpers";

// 선물 링크 페이지 (docs/specs/creator-link.md INV-E1~E11, S1~S11) 중 DB·저장소·서버가 지키는 것.
// 주소 판정(대문자·옛 아이디 넘기기)의 갈래는 src 단위 시험(entities/creator/model/creator-handle.test.ts)에도 있다.
// 크리에이터는 본인 확인 시험 계정(cvt_*) — 시험 동안만 확인된 상태로 둔다(hard-items 시험과 같은 방식).
// 주문은 psql 로 바로 넣는다(물품 이름 「시험 선물」 — deleteTestOrders 가 같이 지운다). 상태·결제 시각을 마음대로 정해야 해서다.

// 페이지를 Next 밖에서 그린다 — 주 버튼(팔로우하고 선물 보내기)이 쓰는 라우터만 빈 것으로 둔다. 검사 대상(읽기·그리기)은 그대로다.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));

const A = CV.haru;
const B = CV.summer;
const C = CV.ggul; // 본인 확인 전으로 두는 크리에이터
const BUCKET = PHOTO_BUCKET_NAME;
const FAN_X = SEED.fanId; // 별빛 (byeolbit_fan)
const FAN_Y = SEED.otherFanId; // 달토끼 (daltokki_fan)
const verify = verifyCreator;
const client = linkClient;
const unlock = unlockHandle;

function currentHandle(creatorId: string): string {
  return psql(`select coalesce((select handle from public.creator_handles where creator_id = '${creatorId}' and retired_until is null), '')`);
}

async function resolve(handle: string): Promise<{ creator_id: string; handle: string }[]> {
  const r = await anonClient().rpc("resolve_creator_handle", { p_handle: handle });
  if (r.error) throw new Error(`아이디 찾기 실패: ${r.error.code}`);
  return r.data as { creator_id: string; handle: string }[];
}

async function saveProfile(login: string, intro: string) {
  const name = Object.values(CV).find((c) => c.login === login)?.name ?? "시험";
  return (await client(login)).rpc("update_my_creator_profile", { p_name: name, p_intro: intro, p_searchable: true });
}

async function monthFans(creatorId: string): Promise<number> {
  const r = await anonClient().rpc("creator_month_fan_total", { p_creator_id: creatorId });
  if (r.error) throw new Error(`이번 달 팬 수 읽기 실패: ${r.error.code}`);
  return r.data as number;
}

/** 위치 정보(GPS)와 촬영 기기 정보를 넣은 800×600 JPEG. */
async function photoWithGps(color = "#e88"): Promise<Buffer> {
  return sharp({ create: { width: 800, height: 600, channels: 3, background: color } })
    .jpeg()
    .withExif({ IFD0: { Make: "FankkukTestCam", Model: "Spy-1" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 33/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "126/1 58/1 0/1" } })
    .toBuffer();
}

const asViewer = (c: (typeof CV)[keyof typeof CV]) => ({ userId: c.id, role: "creator" as const });
const blob = (buf: Buffer, type: string) => new Blob([new Uint8Array(buf)], { type });

async function storedNames(creatorId: string): Promise<string[]> {
  const r = await adminClient().storage.from(BUCKET).list(creatorId);
  return (r.data ?? []).map((f) => f.name).sort();
}

beforeAll(async () => {
  createCvAccounts();
  resetLink();
  await clearPhotos();
});
beforeEach(async () => {
  deleteTestOrders();
  resetLink();
  await clearPhotos();
  resetCv();
  verify(A.creatorId, "cvt-link-a");
  verify(B.creatorId, "cvt-link-b");
});
afterAll(async () => {
  deleteTestOrders();
  resetLink();
  await clearPhotos();
  dropCvAccounts();
});

describe("INV-E1: 링크용 아이디·소개·사진은 본인만 바꾼다", () => {
  it("INV-E1 S1: A 로그인으로 저장하면 A 만 바뀐다 — 저장 함수에 크리에이터를 고를 칸이 없다", async () => {
    expect(await setHandleOk(A.login, "linka_one")).toBe("linka_one");
    expect(currentHandle(A.creatorId)).toBe("linka_one");
    expect(currentHandle(B.creatorId)).toBe("");
    // 크리에이터 ID 를 덧붙여 부르면 그런 함수가 없다고 거부된다
    const r = await (await client(A.login)).rpc("update_my_creator_handle", { p_handle: "linka_two", p_creator_id: B.creatorId });
    expect(r.error).not.toBeNull();
    expect(currentHandle(B.creatorId)).toBe("");
  });

  it("INV-E1 S1b (실패경로): 팬 로그인·로그인 안 함은 아이디·소개 저장이 거부되고 아무것도 바뀌지 않는다", async () => {
    const fan = await client("byeolbit_fan");
    expect((await fan.rpc("update_my_creator_handle", { p_handle: "fan_handle" })).error?.code).toBe("42501");
    expect((await anonClient().rpc("update_my_creator_handle", { p_handle: "anon_handle" })).error).not.toBeNull();
    expect((await fan.rpc("update_my_creator_profile", { p_name: "팬", p_intro: "소개", p_searchable: true })).error?.code).toBe("42501");
    expect(Number(psql("select count(*) from public.creator_handles where handle in ('fan_handle', 'anon_handle')"))).toBe(0);
  });

  it("INV-E1 S1c (실패경로): 로그인한 크리에이터가 화면 쪽 키로 사진 저장소에 바로 올리면 거부된다", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).webp().toBuffer();
    const up = await (await client(A.login)).storage.from(BUCKET).upload(`${A.creatorId}/999.webp`, png, { contentType: "image/webp" });
    expect(up.error).not.toBeNull();
    const anonUp = await anonClient().storage.from(BUCKET).upload(`${A.creatorId}/998.webp`, png, { contentType: "image/webp" });
    expect(anonUp.error).not.toBeNull();
    expect(await storedNames(A.creatorId)).toEqual([]);
  });

  it("INV-E1 (실패경로): 사진 판을 정하는 DB 함수는 화면 쪽 키로 부를 수 없다", async () => {
    const me = await client(A.login);
    expect((await me.rpc("set_creator_photo", { p_profile_id: A.id, p_version: 1 })).error).not.toBeNull();
    expect((await me.rpc("creator_photo_next", { p_profile_id: A.id })).error).not.toBeNull();
    expect(psql(`select photo_version from public.creators where id = '${A.creatorId}'`)).toBe("0");
  });
});

describe("INV-E2: 아이디 꼴·예약어·본인 로그인 아이디", () => {
  it("INV-E2 S2 (실패경로): ab·21자·ha-ru·하루·login·admin·본인 로그인 아이디는 거부된다", async () => {
    const cases: [string, string][] = [
      ["ab", "22023"],
      ["a".repeat(21), "22023"],
      ["ha-ru", "22023"],
      ["하루", "22023"],
      ["login", "P0090"],
      ["admin", "P0090"],
      ["creators", "P0090"],
      [A.login, "P0093"],
      [A.login.toUpperCase(), "P0093"],
    ];
    for (const [handle, code] of cases) {
      expect([handle, (await setHandle(A.login, handle)).error?.code]).toEqual([handle, code]);
    }
    expect(currentHandle(A.creatorId)).toBe("");
  });

  it("INV-E2 S2: ha_ru 는 저장되고 HaRu7 은 haru7 로 바뀌어 저장된다", async () => {
    expect(await setHandleOk(A.login, "ha_ru")).toBe("ha_ru");
    expect(await setHandleOk(B.login, "  HaRu7 ")).toBe("haru7");
    expect(currentHandle(B.creatorId)).toBe("haru7");
  });

  it("INV-E2: 남의 로그인 아이디는 거부하지 않는다(그 아이디가 누군가의 로그인 아이디라는 사실을 드러내지 않게)", async () => {
    expect(await setHandleOk(A.login, B.login)).toBe(B.login);
  });

  it("INV-E2 S2c: 사이트의 첫 단계 주소(src/app·public 아래 이름)가 예약어 목록에 모두 들어 있다", () => {
    const appDir = join(process.cwd(), "src", "app");
    const firstLevel = readdirSync(appDir)
      .filter((n) => statSync(join(appDir, n)).isDirectory())
      .filter((n) => !n.startsWith("[") && !n.startsWith("(") && !n.startsWith("_"));
    const publicNames = readdirSync(join(process.cwd(), "public")).map((n) => n.replace(/\.[^.]+$/, ""));
    const reserved = new Set(psql("select word from public.creator_handle_reserved").split("\n"));
    const missing = [...firstLevel, ...publicNames].map((n) => n.toLowerCase()).filter((n) => !reserved.has(n));
    expect(firstLevel.length).toBeGreaterThan(10);
    expect(missing).toEqual([]);
  });
});

describe("INV-E3: 한 아이디는 한 크리에이터 — 옛 아이디는 90일 묶임", () => {
  it("INV-E3 S3 (실패경로): A 가 쓰는 haru_s3 를 B 가 저장하면 거부된다", async () => {
    await setHandleOk(A.login, "haru_s3");
    expect((await setHandle(B.login, "haru_s3")).error?.code).toBe("P0092");
    expect((await setHandle(B.login, "HARU_S3")).error?.code).toBe("P0092");
    expect(currentHandle(B.creatorId)).toBe("");
  });

  it("INV-E3 S3b: 바꾼 뒤 89일째 — 옛 주소는 새 아이디로 찾아지고 B 는 옛 아이디를 가져갈 수 없다", async () => {
    await setHandleOk(A.login, "haru_old");
    unlock(A.creatorId);
    await setHandleOk(A.login, "haru_new");
    // 89일 뒤 = 묶임이 하루 남음
    psql(`update public.creator_handles set retired_until = now() + interval '1 day' where handle = 'haru_old'`);
    expect(await resolve("haru_old")).toEqual([{ creator_id: A.creatorId, handle: "haru_new" }]);
    expect(await resolve("haru_new")).toEqual([{ creator_id: A.creatorId, handle: "haru_new" }]);
    expect((await setHandle(B.login, "haru_old")).error?.code).toBe("P0092");
  });

  it("INV-E3: 바꾼 옛 아이디는 처음부터 90일 묶인다", async () => {
    await setHandleOk(A.login, "haru_ninety");
    unlock(A.creatorId);
    await setHandleOk(A.login, "haru_ninety2");
    const days = Number(psql(`select round(extract(epoch from (retired_until - now())) / 86400) from public.creator_handles where handle = 'haru_ninety'`));
    expect(days).toBe(90);
  });

  it("INV-E3 S3c: 91일 뒤에는 옛 주소가 없는 페이지이고 B 가 그 아이디를 저장할 수 있다", async () => {
    await setHandleOk(A.login, "haru_free");
    unlock(A.creatorId);
    await setHandleOk(A.login, "haru_free2");
    psql(`update public.creator_handles set retired_until = now() - interval '1 day' where handle = 'haru_free'`);
    expect(await resolve("haru_free")).toEqual([]);
    expect(await setHandleOk(B.login, "haru_free")).toBe("haru_free");
    expect(await resolve("haru_free")).toEqual([{ creator_id: B.creatorId, handle: "haru_free" }]);
  });

  it("INV-E3: 묶인 옛 아이디는 그 크리에이터 본인이 다시 가져올 수 있다", async () => {
    await setHandleOk(A.login, "haru_back");
    unlock(A.creatorId);
    await setHandleOk(A.login, "haru_away");
    unlock(A.creatorId);
    expect(await setHandleOk(A.login, "haru_back")).toBe("haru_back");
    expect(await resolve("haru_away")).toEqual([{ creator_id: A.creatorId, handle: "haru_back" }]);
  });

  it("INV-E3 S3d (동시): 아무도 안 쓰는 아이디를 A·B 가 동시에 저장하면 한 명만 성공한다", async () => {
    const handle = `momo_${Date.now().toString(36).slice(-6)}`;
    for (let round = 0; round < 5; round++) {
      resetLink();
      const [ra, rb] = await Promise.all([setHandle(A.login, `${handle}${round}`), setHandle(B.login, `${handle}${round}`)]);
      const ok = [ra, rb].filter((r) => r.error === null).length;
      expect([round, ok]).toEqual([round, 1]);
      const loser = [ra, rb].find((r) => r.error !== null);
      expect(loser?.error?.code).toBe("P0092");
      expect(Number(psql(`select count(*) from public.creator_handles where handle = '${handle}${round}'`))).toBe(1);
    }
  });

  it("INV-E3 (실패경로): 같은 아이디를 「지금 아이디 줄」과 「묶인 옛 아이디 줄」로 직접 넣으면 고유 목록이 거부한다(23505)", () => {
    /** 오류가 나면 그 SQLSTATE 를, 아니면 ok 를 돌려준다. */
    const insertState = (sql: string) =>
      psql(`do $$ begin ${sql}; raise notice 'ok'; exception when others then raise exception 'sqlstate=%', sqlstate; end $$; select 'ok'`)
        .split(/\r?\n/)
        .at(-1);
    expect(insertState(`insert into public.creator_handles (handle, creator_id) values ('dup_e3', '${A.creatorId}')`)).toBe("ok");
    const asRetired = `insert into public.creator_handles (handle, creator_id, retired_until) values ('dup_e3', '${B.creatorId}', now() + interval '90 days')`;
    expect(() => insertState(asRetired)).toThrow(/sqlstate=23505/);
    // 반대 순서(옛 아이디 줄이 먼저)도 같다
    psql(`delete from public.creator_handles where handle = 'dup_e3'`);
    expect(insertState(asRetired)).toBe("ok");
    expect(() => insertState(`insert into public.creator_handles (handle, creator_id) values ('dup_e3', '${A.creatorId}')`)).toThrow(/sqlstate=23505/);
    expect(psql(`select creator_id || ':' || (retired_until is not null) from public.creator_handles where handle = 'dup_e3'`)).toBe(`${B.creatorId}:true`);
  });

  it("INV-E3 (동시): A 가 아이디를 바꾸는 저장과 B 가 A 의 옛 아이디를 고르는 저장이 겹쳐도 B 는 거부되고 옛 주소는 A 에게 간다", async () => {
    const base = `conc_${Date.now().toString(36).slice(-5)}`;
    for (let round = 0; round < 5; round++) {
      resetLink();
      const oldHandle = `${base}o${round}`;
      await setHandleOk(A.login, oldHandle);
      unlock(A.creatorId);
      const [ra, rb] = await Promise.all([setHandle(A.login, `${base}n${round}`), setHandle(B.login, oldHandle)]);
      expect([round, ra.error]).toEqual([round, null]);
      expect([round, rb.error?.code]).toEqual([round, "P0092"]);
      expect(currentHandle(B.creatorId)).toBe("");
      expect(await resolve(oldHandle)).toEqual([{ creator_id: A.creatorId, handle: `${base}n${round}` }]);
    }
  });
});

describe("INV-E4: 정하거나 바꾸면 30일 잠금", () => {
  it("INV-E4 S4 (실패경로): 오늘 정하고 29일 뒤 바꾸면 거부되고 남은 날이 보인다 — 30일 뒤에는 바뀐다", async () => {
    await setHandleOk(A.login, "lock_first");
    const now = await setHandle(A.login, "lock_second");
    expect(now.error?.code).toBe("P0091");
    psql(`update public.creators set handle_changed_at = now() - interval '29 days' where id = '${A.creatorId}'`);
    const r = await setHandle(A.login, "lock_second");
    expect(r.error?.code).toBe("P0091");
    const link = await (await client(A.login)).rpc("my_creator_link");
    expect((link.data as { handle_locked_days: number }[])[0]?.handle_locked_days).toBe(1);
    psql(`update public.creators set handle_changed_at = now() - interval '30 days' where id = '${A.creatorId}'`);
    expect(await setHandleOk(A.login, "lock_second")).toBe("lock_second");
    const after = await (await client(A.login)).rpc("my_creator_link");
    expect((after.data as { handle: string; handle_locked_days: number }[])[0]).toMatchObject({ handle: "lock_second", handle_locked_days: 30 });
  });

  it("INV-E4: 거부된 저장은 잠금을 새로 걸지 않는다(빈 시도로 잠금이 늘지 않게)", async () => {
    await setHandleOk(A.login, "lock_keep");
    psql(`update public.creators set handle_changed_at = now() - interval '29 days' where id = '${A.creatorId}'`);
    await setHandle(A.login, "lock_keep2");
    await setHandle(A.login, "admin");
    const days = Number(psql(`select round(extract(epoch from (now() - handle_changed_at)) / 86400) from public.creators where id = '${A.creatorId}'`));
    expect(days).toBe(29);
  });
});

describe("INV-E5: 본인 확인 전이거나 없는 아이디는 없는 페이지", () => {
  it("INV-E5 S5b (실패경로): 본인 확인 전 크리에이터가 정해 둔 아이디로는 찾아지지 않는다", async () => {
    expect(await setHandleOk(C.login, "ggul_unverified")).toBe("ggul_unverified");
    expect(await resolve("ggul_unverified")).toEqual([]);
    expect(await resolve("nobody_here")).toEqual([]);
  });

  it("INV-E5 S5: 아이디가 있는 크리에이터는 한 명 읽기·목록에 아이디가 실려 옛 페이지 주소를 링크 주소로 넘길 수 있다", async () => {
    await setHandleOk(A.login, "haru_s5");
    const one = (await anonClient().rpc("creator_by_id", { p_id: A.creatorId })).data as { handle: string | null }[];
    expect(one[0]?.handle).toBe("haru_s5");
    const list = (await anonClient().rpc("list_creators")).data as { id: string; handle: string | null }[];
    expect(list.find((x) => x.id === A.creatorId)?.handle).toBe("haru_s5");
    expect(list.find((x) => x.id === B.creatorId)?.handle).toBeNull();
  });
});

describe("INV-E6: 한 줄 소개 0~40자, 줄바꿈 없음, 태그와 같은 필터", () => {
  it("INV-E6 S6 (실패경로): 41자·줄바꿈·전화번호 꼴·금칙어는 거부된다", async () => {
    expect((await saveProfile(A.login, "가".repeat(41))).error?.code).toBe("22023");
    expect((await saveProfile(A.login, "첫 줄\n둘째 줄")).error?.code).toBe("22023");
    expect((await saveProfile(A.login, "연락 010-1234-5678")).error?.code).toBe("P0082");
    expect((await saveProfile(A.login, "느긋한 시발 방송")).error?.code).toBe("P0081");
    expect(psql(`select intro from public.creators where id = '${A.creatorId}'`)).toBe("");
  });

  it("INV-E6 S6: 40자와 빈칸은 저장된다", async () => {
    expect((await saveProfile(A.login, "나".repeat(40))).error).toBeNull();
    expect(psql(`select char_length(intro) from public.creators where id = '${A.creatorId}'`)).toBe("40");
    expect((await saveProfile(A.login, "   ")).error).toBeNull();
    expect(psql(`select intro from public.creators where id = '${A.creatorId}'`)).toBe("");
  });

  it("INV-E6: 크리에이터 표가 40자 넘는 소개를 받지 않는다(마이그레이션이 기존 소개를 40자로 잘랐다)", () => {
    expect(Number(psql("select count(*) from public.creators where char_length(intro) > 40"))).toBe(0);
    expect(psql(`select count(*) from public.creators where intro ~ '[\\n\\r]'`)).toBe("0");
  });
});

describe("INV-E8: 이번 달 N명의 팬", () => {
  it("INV-E8 S8: X 결제 2건·Y 결제 1건·Z 결제 대기·W 취소 → N = 2", async () => {
    insertOrder(FAN_X, A.creatorId, "registered", "now()");
    insertOrder(FAN_X, A.creatorId, "shipped", "now()");
    insertOrder(FAN_Y, A.creatorId, "rejected", "now()");
    insertOrder(CV.ggul.id, A.creatorId, "pending_payment", null);
    insertOrder(CV.dawn.id, A.creatorId, "canceled", "now()");
    expect(await monthFans(A.creatorId)).toBe(2);
  });

  it("INV-E8 S8b: 이번 달 결제 0건(지난달은 있음)이면 0 이고 링크 페이지에 줄이 없다", async () => {
    insertOrder(FAN_X, A.creatorId, "shipped", "(date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') - interval '1 hour'");
    expect(await monthFans(A.creatorId)).toBe(0);
    const page = await loadCreatorLinkPage({ client: anonClient(), viewer: null, creatorId: A.creatorId, photoBase: "http://photo.test" });
    expect(page?.props.monthFans).toBe(0);
    const html = renderToStaticMarkup(createElement(CreatorProfilePage, page!.props));
    expect(html).not.toContain("마음을 보냈어요");
  });

  it("INV-E8: 숫자만 돌려준다 — 본인 확인 전 크리에이터는 0", async () => {
    insertOrder(FAN_X, C.creatorId, "registered", "now()");
    expect(await monthFans(C.creatorId)).toBe(0);
    insertOrder(FAN_X, A.creatorId, "registered", "now()");
    const page = await loadCreatorLinkPage({ client: anonClient(), viewer: null, creatorId: A.creatorId, photoBase: "http://photo.test" });
    const html = renderToStaticMarkup(createElement(CreatorProfilePage, page!.props));
    expect(html).toContain("1명");
    expect(html).toContain("마음을 보냈어요");
  });

  // 한국 시간 달 시작 = UTC 로는 전달 마지막 날 15시. 그 +1시간은 UTC 달력으로는 아직 전달이라, UTC 로 달을 자르는 구현이면 빠진다.
  // (UTC 로도 아직 전달인 한국 시간 1일 0~9시에 돌리면 이 시험은 두 구현을 가르지 못한다 — 그 아홉 시간 말고는 가른다)
  it("INV-E8: 한국 시간 달 시작 +1시간에 결제된 선물은 이번 달로 세고, 시작 -1시간은 세지 않는다", async () => {
    const kstMonthStart = "(date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')";
    insertOrder(FAN_X, A.creatorId, "registered", `${kstMonthStart} + interval '1 hour'`);
    insertOrder(FAN_Y, A.creatorId, "registered", `${kstMonthStart} - interval '1 hour'`);
    expect(await monthFans(A.creatorId)).toBe(1);
  });

  // 스펙 「스스로 정한 것」: 거절·반려된 주문도 넣는다. expired 는 「결제 뒤 7일 안에 승인하지 않아 반려」(office_run_expiry)라 넣는 쪽이다.
  // 빼는 것은 결제가 끝나지 않은 주문(pending_payment — 결제 실패도 이 상태로 남는다)과 취소뿐이다.
  it("INV-E8: 기한이 지나 반려된 선물(expired)은 마음을 보낸 것으로 세고, 결제가 끝나지 않은 주문·취소는 세지 않는다", async () => {
    insertOrder(FAN_X, A.creatorId, "expired", "now()");
    insertOrder(FAN_Y, A.creatorId, "pending_payment", null);
    insertOrder(CV.dawn.id, A.creatorId, "canceled", "now()");
    expect(await monthFans(A.creatorId)).toBe(1);
  });
});

describe("이런 크리에이터도 있어요 — 링크 페이지 아래 줄", () => {
  it("INV-E7: 아래 줄은 그 크리에이터를 뺀 목록의 앞 6명이고, 목록 전체를 읽던 때와 같은 사람·같은 순서다", async () => {
    const page = await loadCreatorLinkPage({ client: anonClient(), viewer: null, creatorId: A.creatorId, photoBase: "http://photo.test" });
    const all = (await anonClient().rpc("list_creators")).data as { id: string }[];
    const expected = all.filter((c) => c.id !== A.creatorId).slice(0, 6).map((c) => c.id);
    expect(all.length).toBeGreaterThan(2);
    expect(page!.props.others.map((o) => o.id)).toEqual(expected);
    expect(page!.props.others.some((o) => o.id === A.creatorId)).toBe(false);
  });

  it("INV-E7: 로그인한 팬에게는 팔로우 여부가 크리에이터와 아래 줄에 같이 붙는다", async () => {
    const fan = await client("byeolbit_fan");
    const follows = ((await fan.rpc("my_follows")).data as { creator_id: string }[]).map((f) => f.creator_id);
    const page = await loadCreatorLinkPage({ client: fan, viewer: { userId: FAN_X, role: "fan" }, creatorId: A.creatorId, photoBase: "http://photo.test" });
    expect(page!.props.creator.following).toBe(follows.includes(A.creatorId));
    for (const o of page!.props.others) expect([o.id, o.following]).toEqual([o.id, follows.includes(o.id)]);
    expect(page!.props.others.some((o) => o.following)).toBe(follows.some((id) => page!.props.others.some((o) => o.id === id)));
  });
});

describe("INV-E7: 공개 화면에는 정해진 칸만", () => {
  it("INV-E7 S7: 주문·운송장·팬이 있는 크리에이터의 링크 페이지 응답(HTML·데이터)과 이미지 입력에 주문번호·운송장·팬 닉네임·로그인 아이디가 없다", async () => {
    await setHandleOk(A.login, "haru_s7");
    const orders = [
      insertOrder(FAN_X, A.creatorId, "shipped", "now()", { waybill: "581234567890", tracking: "6012345678901" }),
      insertOrder(FAN_Y, A.creatorId, "label_printed", "now()", { waybill: "581234567891" }),
    ];
    const viewers: [string, SupabaseClient][] = [
      ["anon", anonClient()],
      ["fan", await client("daltokki_fan")],
    ];
    for (const [who, c] of viewers) {
      const page = await loadCreatorLinkPage({ client: c, viewer: null, creatorId: A.creatorId, photoBase: "http://photo.test" });
      expect([who, page !== null]).toEqual([who, true]);
      const html = renderToStaticMarkup(createElement(CreatorProfilePage, page!.props));
      const data = JSON.stringify(page);
      expect(html).toContain("fankkuk.kr/haru_s7");
      for (const text of [html, data]) {
        expect([who, text.match(/FC-[0-9A-Z]{3,}/g)]).toEqual([who, null]);
        for (const bad of [...orders, "581234567890", "581234567891", "6012345678901", "별빛", "달토끼", "byeolbit_fan", "daltokki_fan", A.login]) {
          expect([who, bad, text.includes(bad)]).toEqual([who, bad, false]);
        }
      }
      const pub = page!.props.creator;
      const inputs = JSON.stringify([previewImageInput(pub, "http://photo.test"), noticeImageInput(pub, "http://photo.test")]);
      for (const bad of [...orders, "별빛", "달토끼", A.login, "581234567890"]) {
        expect([who, bad, inputs.includes(bad)]).toEqual([who, bad, false]);
      }
    }
  });

  it("INV-E7 S11: 링크 페이지에는 주소 열람 건수가 없다", async () => {
    const page = await loadCreatorLinkPage({ client: anonClient(), viewer: null, creatorId: A.creatorId, photoBase: "http://photo.test" });
    const html = renderToStaticMarkup(createElement(CreatorProfilePage, page!.props));
    expect(html).not.toMatch(/열람/);
    expect(Object.keys(page!.props.creator).filter((k) => /open|decrypt|access|login|address|order/i.test(k))).toEqual([]);
  });
});

describe("INV-E9: 프로필 사진 — 서버가 열어 보고 사진 정보를 지우고 512 정사각으로", () => {
  it("INV-E9 S9: 위치 정보가 든 사진을 올리면 저장된 파일에 사진 정보가 없고 512×512 webp 다 — 원본은 어디에도 없다", async () => {
    const input = await photoWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const r = await saveCreatorPhoto({ admin: adminClient(), viewer: asViewer(A) }, blob(input, "image/jpeg"));
    expect(r).toMatchObject({ ok: true });
    const path = psql(`select photo_path from public.creators where id = '${A.creatorId}'`);
    expect(path).toBe(`${A.creatorId}/1.webp`);
    expect(await storedNames(A.creatorId)).toEqual(["1.webp"]);
    const dl = await adminClient().storage.from(BUCKET).download(path);
    const stored = Buffer.from(await dl.data!.arrayBuffer());
    const meta = await sharp(stored).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 512, 512]);
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(stored.includes(Buffer.from("FankkukTestCam"))).toBe(false);
    // 공개 주소로 누구나 읽힌다(공개 버킷)
    const pub = await fetch(`${process.env.FK_TEST_API_URL}/storage/v1/object/public/${BUCKET}/${path}`);
    expect(pub.status).toBe(200);
  });

  it("INV-E9 S9b (실패경로): 이미지 확장자를 붙인 이미지 아닌 파일·10MB 넘는 파일·팬은 거부된다", async () => {
    const fake = await saveCreatorPhoto({ admin: adminClient(), viewer: asViewer(A) }, new Blob(["<html>not an image</html>"], { type: "image/jpeg" }));
    expect(fake).toMatchObject({ ok: false, status: 400 });
    const big = Buffer.concat([await photoWithGps(), Buffer.alloc(10 * 1024 * 1024)]);
    expect(await saveCreatorPhoto({ admin: adminClient(), viewer: asViewer(A) }, blob(big, "image/jpeg"))).toMatchObject({ ok: false, status: 400 });
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).gif().toBuffer();
    expect(await saveCreatorPhoto({ admin: adminClient(), viewer: asViewer(A) }, blob(gif, "image/jpeg"))).toMatchObject({ ok: false, status: 400 });
    expect(await saveCreatorPhoto({ admin: adminClient(), viewer: { userId: FAN_X, role: "fan" } }, blob(await photoWithGps(), "image/jpeg"))).toMatchObject({ ok: false, status: 403 });
    expect(await storedNames(A.creatorId)).toEqual([]);
    expect(psql(`select photo_version from public.creators where id = '${A.creatorId}'`)).toBe("0");
  });

  it("INV-E9 (실패경로): 그림 크기 상한(4천만 화소)을 넘는 이미지는 열지 않고 거부한다", async () => {
    const huge = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: "#fff" } }).jpeg({ quality: 10 }).toBuffer();
    expect(await saveCreatorPhoto({ admin: adminClient(), viewer: asViewer(A) }, blob(huge, "image/jpeg"))).toMatchObject({ ok: false, status: 400 });
  });

  it("INV-E9 S9c: 사진을 바꾸면 미리보기 이미지 주소의 판 값이 바뀌고 옛 파일은 저장소에 없다 — 지우면 파일도 지운다", async () => {
    await saveCreatorPhoto({ admin: adminClient(), viewer: asViewer(A) }, blob(await photoWithGps("#e88"), "image/jpeg"));
    const first = await loadCreatorLinkPage({ client: anonClient(), viewer: null, creatorId: A.creatorId, photoBase: "http://photo.test" });
    await saveCreatorPhoto({ admin: adminClient(), viewer: asViewer(A) }, blob(await photoWithGps("#8e8"), "image/jpeg"));
    const second = await loadCreatorLinkPage({ client: anonClient(), viewer: null, creatorId: A.creatorId, photoBase: "http://photo.test" });
    expect(previewImagePath(first!.props.creator)).not.toBe(previewImagePath(second!.props.creator));
    expect(previewImagePath(second!.props.creator)).toBe(`/api/og/${A.creatorId}?v=2`);
    expect(await storedNames(A.creatorId)).toEqual(["2.webp"]);
    expect(await removeCreatorPhoto({ admin: adminClient(), viewer: asViewer(A) })).toMatchObject({ ok: true });
    expect(await storedNames(A.creatorId)).toEqual([]);
    const third = await loadCreatorLinkPage({ client: anonClient(), viewer: null, creatorId: A.creatorId, photoBase: "http://photo.test" });
    expect(third!.props.creator.photoUrl).toBeNull();
    expect(previewImagePath(third!.props.creator)).not.toBe(previewImagePath(second!.props.creator));
  });
});

describe("INV-E10: 이미지 생성에 넘기는 값", () => {
  it("INV-E10 S10: 미리보기 입력은 이름·사진 주소뿐, 공지 입력은 사진·링크 주소뿐 — 아이디가 없으면 공지 이미지가 없다", async () => {
    await saveProfile(A.login, "느긋하게 게임하는 방송이에요");
    const before = await loadCreatorLinkPage({ client: anonClient(), viewer: null, creatorId: A.creatorId, photoBase: "http://photo.test" });
    expect(noticeImageInput(before!.props.creator, "http://photo.test")).toBeNull();
    expect(Object.keys(previewImageInput(before!.props.creator, "http://photo.test")).sort()).toEqual(["name", "photoUrl"]);
    await setHandleOk(A.login, "haru_s10");
    const after = await loadCreatorLinkPage({ client: anonClient(), viewer: null, creatorId: A.creatorId, photoBase: "http://photo.test" });
    const notice = noticeImageInput(after!.props.creator, "http://photo.test");
    expect(notice).toEqual({ photoUrl: null, linkText: "fankkuk.kr/haru_s10", initial: [...A.name][0] });
    expect(JSON.stringify(previewImageInput(after!.props.creator, "http://photo.test"))).not.toContain("느긋하게");
  });
});

describe("INV-E10: 사진이 있는 크리에이터의 이미지가 실제로 그려진다", () => {
  it("INV-E10 S10: 저장된 사진(webp)으로 미리보기(1200×630)·공지(1080×1080) PNG 가 끝까지 만들어진다", async () => {
    await setHandleOk(A.login, "haru_img");
    await saveCreatorPhoto({ admin: adminClient(), viewer: asViewer(A) }, blob(await photoWithGps(), "image/jpeg"));
    const page = await loadCreatorLinkPage({ client: anonClient(), viewer: null, creatorId: A.creatorId, photoBase: process.env.FK_TEST_API_URL ?? "" });
    const pub = page!.props.creator;
    const preview = previewImageInput(pub, process.env.FK_TEST_API_URL ?? "");
    const notice = noticeImageInput(pub, process.env.FK_TEST_API_URL ?? "")!;
    const photo = await readPhotoDataUrl(preview.photoUrl);
    expect(photo?.startsWith("data:image/png;base64,")).toBe(true);
    // 실제 바이트도 PNG — 개발 서버의 이미지 그리기는 webp 를 받으면 응답이 중간에 끊겼다(이 시험 환경의 그리기는 webp 도 읽어서 크기만으로는 못 잡는다)
    expect(Buffer.from(photo!.split(",")[1] ?? "", "base64").subarray(0, 4).toString("hex")).toBe("89504e47");
    const fonts = [{ name: "Pretendard", data: await readImageFont(), weight: 800 as const, style: "normal" as const }];
    const shots = [
      new ImageResponse(createElement(PreviewImageCard, { name: preview.name, photo, logo: await readLogoDataUrl() }), { width: 1200, height: 630, fonts }),
      new ImageResponse(createElement(NoticeImageCard, { photo: await readPhotoDataUrl(notice.photoUrl), initial: notice.initial, linkText: notice.linkText }), { width: 1080, height: 1080, fonts }),
    ];
    const sizes: [number, number][] = [];
    for (const shot of shots) {
      const meta = await sharp(Buffer.from(await shot.arrayBuffer())).metadata();
      sizes.push([meta.width ?? 0, meta.height ?? 0]);
    }
    expect(sizes).toEqual([
      [1200, 630],
      [1080, 1080],
    ]);
  });
});

describe("INV-E11: 승인 서명 없이 열린 열람 줄 경보", () => {
  it("INV-E11 S11: 승인 서명 없는 열람 줄 하나가 생기면 운영자 자동 처리 현황의 경보 숫자가 늘어난다 — 운영자만 읽는다", async () => {
    const admin = await client("fankkuk_admin");
    const read = async () => {
      const r = await admin.rpc("admin_unsigned_open_alerts");
      if (r.error) throw new Error(`경보 읽기 실패: ${r.error.code}`);
      return (r.data as { open_rows: number }[])[0]?.open_rows ?? 0;
    };
    /**
     * 상자 하나와 열린 열람 줄 하나(열린 시각 = 지금). 그 주문의 승인 상태:
     * signed = 열기 한 시간 전에 승인·서명 / none = 승인 없음 / unsigned = 승인만 있고 서명 없음 / late = 승인했지만 서명 시각이 열람보다 한 시간 늦음.
     */
    const opened = (approval: "signed" | "none" | "unsigned" | "late") => {
      const no = insertOrder(FAN_X, A.creatorId, "label_printed", "now()");
      const req = `apr_${no.replaceAll("-", "")}`;
      const request =
        approval === "none"
          ? ""
          : `insert into public.approval_requests (request_id, order_id, payload, created_at, status, decided_at) select '${req}', id, 'p', now() - interval '2 hours', 'approved', now() - interval '1 hour' from public.orders where order_no = '${no}';`;
      const signedAt = approval === "signed" ? "now() - interval '1 hour'" : approval === "late" ? "now() + interval '1 hour'" : null;
      const signature = signedAt
        ? `insert into public.approval_signatures (request_id, signed_content, signer_id, method, signed_at) values ('${req}', 'p', 'fake:${A.id}', 'fake', ${signedAt});`
        : "";
      psql(
        `begin; set local session_replication_role = replica;
         insert into public.boxes (order_id, seq, declared_tier, price_krw, shipping_fee_krw, inspection_fee_krw) select id, 1, 'small', 6900, 4000, 1500 from public.orders where order_no = '${no}';
         ${request}
         ${signature}
         insert into public.decrypt_log (order_id, requester_id, result, print_no, box_id) select o.id, '${A.id}', 'opened', 1, b.id from public.orders o join public.boxes b on b.order_id = o.id where o.order_no = '${no}';
         commit;`,
      );
    };
    const before = await read();
    opened("signed");
    expect(await read()).toBe(before); // 서명된 승인 뒤의 열람은 경보가 아니다
    opened("none");
    expect(await read()).toBe(before + 1);
    opened("unsigned");
    expect(await read()).toBe(before + 2); // 승인만 있고 서명이 없는 열람도 경보
    opened("late");
    expect(await read()).toBe(before + 3); // 서명이 열람보다 늦게 붙은 열람도 경보
    expect((await (await client(A.login)).rpc("admin_unsigned_open_alerts")).data ?? []).toEqual([]);
    expect((await anonClient().rpc("admin_unsigned_open_alerts")).error).not.toBeNull();
  });
});
