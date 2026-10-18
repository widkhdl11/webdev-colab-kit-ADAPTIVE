import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { BANNER_BUCKET } from "@/entities/banner/model/banner";
import { bannerLinkKind, bannerTextOk } from "@/entities/banner/model/banner-rules";
import { orderBanners, removeBanner, saveBanner } from "@/features/admin-banner-edit/model/save-banner";
import { adminClient, anonClient, psql, psqlError, signedInClient } from "./helpers";

// 광고 배너 (docs/specs/banners.md INV-Y1~Y6·Y8·Y10, S1~S6b·S8·S10·S10b) — 로컬 DB·저장소에 실제로 붙는다.
// 시드: fankkuk_admin = 대표 운영자(팬꾹 운영), fankkuk_staff = 직원 운영자(팬꾹 직원), byeolbit_fan = 팬, haru_creator = 크리에이터.
// 시험이 만드는 배너는 제목 앞머리로 가려 지운다. 기록 표는 추가만이라 트리거를 끄고 지운다.

const P = "시험-";
const OWNER_ID = "00000000-0000-4000-a000-000000000021";
const STAFF_ID = "00000000-0000-4000-a000-000000000022";
const PUBLIC_BUCKETS = ["banner-images", "creator-photos", "fan-photos"];

const fakePath = () => `b-${crypto.randomUUID().replaceAll("-", "")}.webp`;
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;

type Fields = { title: string; description?: string; link?: string; isAd?: boolean; startsOn?: string; endsOn?: string | null };

/** 운영자 함수로 배너를 만든다(그림 파일 없이 경로만 — DB 시험용). */
async function createByRpc(who: string, f: Fields): Promise<{ id: string | null; code: string | null }> {
  const c = await signedInClient(who);
  const r = await c.rpc("admin_save_banner", {
    p_id: null,
    p_title: f.title,
    p_description: f.description ?? "",
    p_link: f.link ?? "/about",
    p_is_ad: f.isAd ?? false,
    p_starts_on: f.startsOn ?? "2026-10-01",
    p_ends_on: f.endsOn ?? null,
    p_image_path: fakePath(),
  });
  return { id: (r.data as string | null) ?? null, code: r.error?.code ?? null };
}

/** DB 소유자로 바로 넣는다 — 날짜·순서·만든 때를 정해 둘 때. */
function insertDirect(f: { title: string; starts: string; ends: string | null; order?: number; createdAt?: string; isAd?: boolean; id?: string }): string {
  return psql(
    `insert into public.banners (id, title, link, is_ad, starts_on, ends_on, sort_order, image_path, created_at, created_by, updated_by)
     values (${f.id ? `'${f.id}'` : "gen_random_uuid()"}, ${q(f.title)}, '/about', ${f.isAd ?? false}, '${f.starts}', ${f.ends ? `'${f.ends}'` : "null"}, ${f.order ?? 0}, ${q(fakePath())},
       ${f.createdAt ? `'${f.createdAt}'` : "now()"}, '${STAFF_ID}', '${STAFF_ID}') returning id`,
  ).split("\n")[0]!;
}

const countTest = () => Number(psql(`select count(*) from public.banners where title like '${P}%'`));
const titleOf = (id: string) => psql(`select coalesce((select title from public.banners where id = '${id}'), '')`);

async function storedNames(): Promise<string[]> {
  const r = await adminClient().storage.from(BANNER_BUCKET).list("", { limit: 1000 });
  return (r.data ?? []).map((f) => f.name).filter((n) => n !== ".emptyFolderPlaceholder");
}

async function cleanup(): Promise<void> {
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      `delete from public.banner_changes where title like '${P}%';`,
      `delete from public.banners where title like '${P}%';`,
      "commit;",
    ].join(" "),
  );
  // 시험이 올린 파일만 — 남은(시험이 아닌) 배너가 쓰는 그림은 두고 나머지를 지운다
  const kept = new Set(psql("select coalesce(string_agg(image_path, ','), '') from public.banners").split(",").filter(Boolean));
  const stray = (await storedNames()).filter((n) => !kept.has(n));
  if (stray.length > 0) await adminClient().storage.from(BANNER_BUCKET).remove(stray);
}

afterEach(cleanup);

/** 위치 정보(GPS)와 촬영 기기 정보를 넣은 JPEG. */
function photoWithGps(color = "#8ce"): Promise<Buffer> {
  return sharp({ create: { width: 900, height: 900, channels: 3, background: color } })
    .jpeg()
    .withExif({ IFD0: { Make: "FankkukOpsCam", Model: "Spy-3" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 33/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "126/1 58/1 0/1" } })
    .toBuffer();
}
const blob = (buf: Uint8Array, type = "image/jpeg") => new Blob([new Uint8Array(buf)], { type });

async function opsDeps(who = "fankkuk_staff") {
  return { session: await signedInClient(who), storage: adminClient().storage };
}

const input = (f: Fields & { id?: string | null }) => ({
  id: f.id ?? null,
  title: f.title,
  description: f.description ?? "",
  link: f.link ?? "/about",
  isAd: f.isAd ?? false,
  startsOn: f.startsOn ?? "2026-10-01",
  endsOn: f.endsOn ?? null,
});

describe("운영자만 바꾼다 (INV-Y1)", () => {
  it("INV-Y1 (S1): 운영자가 만들고, 제목을 고치고, 순서를 바꾸고, 내림 — 넷 다 반영된다", async () => {
    const staff = await signedInClient("fankkuk_staff");
    const a = (await createByRpc("fankkuk_staff", { title: `${P}가` })).id!;
    const b = (await createByRpc("fankkuk_staff", { title: `${P}나` })).id!;
    expect(countTest()).toBe(2);
    const edit = await staff.rpc("admin_save_banner", {
      p_id: a, p_title: `${P}가 고침`, p_description: "설명", p_link: "/about", p_is_ad: true, p_starts_on: "2026-10-01", p_ends_on: null, p_image_path: null,
    });
    expect(edit.error).toBeNull();
    expect(titleOf(a)).toBe(`${P}가 고침`);
    expect((await staff.rpc("admin_set_banner_order", { p_ids: [b, a] })).error).toBeNull();
    expect(psql(`select string_agg(title, '|' order by sort_order, created_at) from public.banners where title like '${P}%'`)).toBe(`${P}나|${P}가 고침`);
    const removed = await staff.rpc("admin_remove_banner", { p_id: b });
    expect(removed.error).toBeNull();
    expect(typeof removed.data).toBe("string");
    expect(titleOf(b)).toBe("");
  });

  it("INV-Y1 (S1b, 실패경로): 팬·크리에이터·로그인 안 한 사람이 네 가지를 DB 함수로 직접 부름 → 모두 거부, 표는 그대로", async () => {
    const id = (await createByRpc("fankkuk_staff", { title: `${P}원본` })).id!;
    const before = psql(`select title || sort_order from public.banners where id = '${id}'`);
    const callers = [await signedInClient("byeolbit_fan"), await signedInClient("haru_creator"), anonClient()];
    for (const c of callers) {
      const add = await c.rpc("admin_save_banner", {
        p_id: null, p_title: `${P}몰래`, p_description: "", p_link: "/about", p_is_ad: false, p_starts_on: "2026-10-01", p_ends_on: null, p_image_path: fakePath(),
      });
      expect(add.error?.code).toBe("42501");
      const edit = await c.rpc("admin_save_banner", {
        p_id: id, p_title: `${P}바꿈`, p_description: "", p_link: "/about", p_is_ad: false, p_starts_on: "2026-10-01", p_ends_on: null, p_image_path: null,
      });
      expect(edit.error?.code).toBe("42501");
      expect((await c.rpc("admin_set_banner_order", { p_ids: [id] })).error?.code).toBe("42501");
      expect((await c.rpc("admin_set_banner_image", { p_id: id, p_image_path: fakePath() })).error?.code).toBe("42501");
      expect((await c.rpc("admin_remove_banner", { p_id: id })).error?.code).toBe("42501");
    }
    // 운영자 목록도 운영자가 아니면 빈 목록
    expect((await (await signedInClient("byeolbit_fan")).rpc("admin_banners")).data).toEqual([]);
    expect(psql(`select title || sort_order from public.banners where id = '${id}'`)).toBe(before);
    expect(countTest()).toBe(1);
  });

  it("INV-Y1 (S1c, 실패경로): 로그인한 팬이 화면 쪽 키로 배너 표에 바로 넣기·고치기·지우기 → 모두 거부", async () => {
    const id = (await createByRpc("fankkuk_staff", { title: `${P}표` })).id!;
    const fan = await signedInClient("byeolbit_fan");
    const ins = await fan.from("banners").insert({ title: `${P}바로`, link: "/about", starts_on: "2026-10-01", image_path: fakePath(), created_by: STAFF_ID, updated_by: STAFF_ID });
    expect(ins.error).not.toBeNull();
    const upd = await fan.from("banners").update({ title: `${P}바꿈` }).eq("id", id).select();
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    const del = await fan.from("banners").delete().eq("id", id).select();
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    expect(titleOf(id)).toBe(`${P}표`);
    expect(countTest()).toBe(1);
    expect(psql("select count(*) from pg_policies where schemaname = 'public' and tablename = 'banners'")).toBe("0");
    expect(psql("select relrowsecurity from pg_class where oid = 'public.banners'::regclass")).toBe("t");
  });

  it("INV-Y1 (실패경로): 운영자 확인 없이 그림 저장 경로를 부름(팬) → 404, 올린 파일을 열지도 않고 저장소에 아무것도 생기지 않는다", async () => {
    const before = await storedNames();
    let opened = 0;
    const spy = blob(await photoWithGps());
    const watched = Object.assign(spy, {
      arrayBuffer: () => {
        opened += 1;
        return Blob.prototype.arrayBuffer.call(spy);
      },
    });
    const r = await saveBanner(await opsDeps("byeolbit_fan"), input({ title: `${P}팬` }), watched);
    expect(r.status).toBe(404);
    expect(opened).toBe(0);
    expect(countTest()).toBe(0);
    expect((await storedNames()).sort()).toEqual(before.sort());
  });
});

describe("지금 보이는 배너만 (INV-Y2)", () => {
  it("INV-Y2 (S2): 오늘(한국) 2026-10-20 — 넷 중 첫째·넷째만 공개, 운영자 상태는 보이는 중·예정·끝남·보이는 중", () => {
    insertDirect({ title: `${P}1`, starts: "2026-10-14", ends: "2026-10-20", order: 1 });
    insertDirect({ title: `${P}2`, starts: "2026-10-21", ends: null, order: 2 });
    insertDirect({ title: `${P}3`, starts: "2026-10-01", ends: "2026-10-19", order: 3 });
    insertDirect({ title: `${P}4`, starts: "2026-10-20", ends: null, order: 4 });
    const at = "'2026-10-20T12:00:00+09:00'";
    expect(psql(`select string_agg(title, '|') from public.list_banners_at(${at}) where title like '${P}%'`)).toBe(`${P}1|${P}4`);
    expect(psql(`select string_agg(title || '=' || state, '|') from public.admin_banners_at(${at}) where title like '${P}%'`)).toBe(
      `${P}1=live|${P}2=scheduled|${P}3=ended|${P}4=live`,
    );
  });

  it("INV-Y2 (S2b, 실패경로): 한국 10-21 00:30(UTC 로는 10-20) — 끝 날짜 10-20 인 배너는 나오지 않는다. 10-20 23:59 에는 나온다", () => {
    insertDirect({ title: `${P}끝20`, starts: "2026-10-14", ends: "2026-10-20" });
    insertDirect({ title: `${P}시작21`, starts: "2026-10-21", ends: null });
    expect(psql(`select coalesce(string_agg(title, '|'), '') from public.list_banners_at('2026-10-21T00:30:00+09:00') where title like '${P}%'`)).toBe(`${P}시작21`);
    expect(psql(`select coalesce(string_agg(title, '|'), '') from public.list_banners_at('2026-10-20T23:59:00+09:00') where title like '${P}%'`)).toBe(`${P}끝20`);
  });

  it("INV-Y2: 실제 공개 읽기(로그인 없이)는 오늘 보이는 배너만, 공개 칸 여섯만 — 운영자 목록과 같은 상태 규칙", async () => {
    const today = psql("select public.banner_korea_date(now())::text");
    const tomorrow = psql("select (public.banner_korea_date(now()) + 1)::text");
    const yesterday = psql("select (public.banner_korea_date(now()) - 1)::text");
    await createByRpc("fankkuk_staff", { title: `${P}오늘`, startsOn: today, endsOn: today, isAd: true });
    await createByRpc("fankkuk_staff", { title: `${P}내일`, startsOn: tomorrow });
    await createByRpc("fankkuk_staff", { title: `${P}어제`, startsOn: yesterday, endsOn: yesterday });
    const pub = await anonClient().rpc("list_banners");
    expect(pub.error).toBeNull();
    const mine = (pub.data as Record<string, unknown>[]).filter((r) => String(r.title).startsWith(P));
    expect(mine.map((r) => r.title)).toEqual([`${P}오늘`]);
    expect(Object.keys(mine[0]!).sort()).toEqual(["description", "id", "image_path", "is_ad", "link", "title"]);
    expect(mine[0]!.is_ad).toBe(true);
    // 공개 함수는 지금 시각을 안쪽 함수(한국 날짜로 거름)에 그대로 넘긴다 — 둘의 결과가 같아야 한다
    expect(psql("select (select coalesce(array_agg(id), '{}') from public.list_banners()) = (select coalesce(array_agg(id), '{}') from public.list_banners_at(now()))")).toBe("t");
    expect(psql("select pg_get_functiondef('public.list_banners()'::regprocedure) like '%list_banners_at(now())%'")).toBe("t");
    const ops = (await (await signedInClient("fankkuk_admin")).rpc("admin_banners")).data as { title: string; state: string }[];
    expect(ops.filter((r) => r.title.startsWith(P)).map((r) => `${r.title}=${r.state}`).sort()).toEqual([`${P}내일=scheduled`, `${P}어제=ended`, `${P}오늘=live`]);
  });

  it("INV-Y2 (S2c, 실패경로): 로그인 안 한 사람이 배너 표를 직접 읽음 → 빈 결과(예정·끝난 배너·만든 사람이 보이지 않음)", async () => {
    insertDirect({ title: `${P}예정`, starts: "2099-01-01", ends: null });
    insertDirect({ title: `${P}보임`, starts: "2026-01-01", ends: null });
    for (const c of [anonClient(), await signedInClient("byeolbit_fan")]) {
      // 빈 결과는 권한 거부(42501)로 온다 — 표 이름이 틀리거나 다른 오류면 이 시험이 잡는다
      const r = await c.from("banners").select("*");
      expect(r.error?.code).toBe("42501");
      expect(r.data).toBeNull();
      const log = await c.from("banner_changes").select("*");
      expect(log.error?.code).toBe("42501");
    }
    expect(psql("select count(*) from pg_policies where schemaname = 'public' and tablename in ('banners', 'banner_changes')")).toBe("0");
    expect(psql("select string_agg(relname || '=' || relrowsecurity, ',' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relname in ('banners', 'banner_changes')")).toBe(
      "banner_changes=true,banners=true",
    );
  });

  it("INV-Y2 (S2d, 실패경로): 끝 날짜가 시작보다 앞서는 배너 → 함수도 DB 제약도 거부. 같은 날은 된다", async () => {
    expect((await createByRpc("fankkuk_staff", { title: `${P}거꾸로`, startsOn: "2026-10-20", endsOn: "2026-10-19" })).code).toBe("22023");
    expect(psqlError(`update public.banners set ends_on = starts_on - 1 where id = '${insertDirect({ title: `${P}제약`, starts: "2026-10-20", ends: null })}'`)).toMatch(/banners_period_ok/);
    expect((await createByRpc("fankkuk_staff", { title: `${P}같은날`, startsOn: "2026-10-20", endsOn: "2026-10-20" })).code).toBeNull();
  });
});

const GOOD_LINKS = ["/about", "/#price", "/", "/creators?tag=버추얼", "https://youtube.com/@haru", "https://chzzk.naver.com/momo", "https://a.com:8443/x?y=1#z"];
const BAD_LINKS = [
  "javascript:alert(1)",
  "http://a.com",
  "//evil.com",
  "/\\evil.com",
  "data:text/html,x",
  "",
  "/ a",
  "https://",
  "https:///x",
  "HTTPS://a.com",
  "https://a.com/x y",
  "/a\tb",
  "/a\u3000b",
  "/a\u00a0b",
  "https://user@evil.com",
  "about",
  `/${"a".repeat(500)}`,
];

describe("누르면 가는 곳 (INV-Y3)", () => {
  it("INV-Y3 (S3): /about · /#price · https://youtube.com/@haru 는 저장된다", async () => {
    for (const link of ["/about", "/#price", "https://youtube.com/@haru"]) {
      expect((await createByRpc("fankkuk_staff", { title: `${P}${link.slice(0, 20)}`, link })).code).toBeNull();
    }
    expect(countTest()).toBe(3);
  });

  it("INV-Y3 (S3b, 실패경로): javascript:·http:·//·/\\·data:·빈 값·「/ a」 등 → 함수가 거부하고, DB 제약도 거부한다", async () => {
    for (const link of BAD_LINKS) {
      expect((await createByRpc("fankkuk_staff", { title: `${P}나쁜주소`, link })).code, link).toBe("22023");
    }
    expect(countTest()).toBe(0);
    // 함수를 거치지 않고 넣어도 저장 경계의 제약이 막는다
    const id = insertDirect({ title: `${P}제약`, starts: "2026-10-01", ends: null });
    for (const link of ["javascript:alert(1)", "//evil.com", "/\\evil.com"]) {
      expect(psqlError(`update public.banners set link = ${q(link)} where id = '${id}'`), link).toMatch(/banners_link_ok/);
    }
  });

  it("INV-Y3: 화면 쪽 검사(bannerLinkKind)와 DB 검사(banner_link_ok)가 같은 답을 낸다", () => {
    // 앞 빈칸은 저장 함수가 걷어 내고 보므로 위 S3b 목록에는 없다 — 검사 함수 자체는 거부한다
    for (const link of [...GOOD_LINKS, ...BAD_LINKS, " https://a.com", "/about "]) {
      const db = psql(`select public.banner_link_ok(${q(link)})`) === "t";
      expect(bannerLinkKind(link) !== null, link).toBe(db);
    }
    expect(GOOD_LINKS.every((l) => bannerLinkKind(l) !== null)).toBe(true);
  });
});

describe("배너 그림 (INV-Y4·Y5)", () => {
  it("INV-Y4 (S4): 위치 정보가 든 JPG → 저장 파일은 WebP·사진 정보 없음·짐작할 수 없는 이름. 그림을 바꾸면 옛 파일이 사라진다", async () => {
    const deps = await opsDeps();
    const r = await saveBanner(deps, input({ title: `${P}그림` }), blob(await photoWithGps()));
    expect(r.status).toBe(200);
    const id = String(r.body.id);
    const path = psql(`select image_path from public.banners where id = '${id}'`);
    expect(path).toMatch(/^b-[0-9a-f]{32}\.webp$/);
    const file = await adminClient().storage.from(BANNER_BUCKET).download(path);
    expect(file.error).toBeNull();
    const bytes = Buffer.from(await file.data!.arrayBuffer());
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(bytes.includes(Buffer.from("FankkukOpsCam"))).toBe(false);
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(512);

    // 그림 바꾸기 — 새 이름, 옛 파일 지움
    const r2 = await saveBanner(deps, input({ id, title: `${P}그림` }), blob(await photoWithGps("#fc8")));
    expect(r2.status).toBe(200);
    const path2 = psql(`select image_path from public.banners where id = '${id}'`);
    expect(path2).not.toBe(path);
    const names = await storedNames();
    expect(names).toContain(path2);
    expect(names).not.toContain(path);

    // 내리면 그 파일도 지운다
    const off = await removeBanner(deps, { id });
    expect(off.status).toBe(200);
    expect(await storedNames()).not.toContain(path2);
  });

  it("INV-Y4 (S4b, 실패경로): 로그인한 팬·손님이 화면 쪽 키로 banner-images 에 바로 올림 → 거부", async () => {
    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#f00" } }).webp().toBuffer();
    for (const c of [await signedInClient("byeolbit_fan"), anonClient()]) {
      const name = fakePath();
      const up = await c.storage.from(BANNER_BUCKET).upload(name, webp, { contentType: "image/webp" });
      expect(up.error).not.toBeNull();
      expect(await storedNames()).not.toContain(name);
    }
    expect(psql(`select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') || coalesce(with_check, '')) like '%banner-images%'`)).toBe("0");
  });

  it("INV-Y4 (S4b, 실패경로): 그림이 아닌 파일(이름만 .png)·5MB 넘는 그림·WebP 를 운영자가 올림 → 거부, 배너는 그대로", async () => {
    const deps = await opsDeps();
    const fake = new File([new TextEncoder().encode("이건 그림이 아니다")], "x.png", { type: "image/png" });
    expect((await saveBanner(deps, input({ title: `${P}가짜` }), fake)).status).toBe(400);
    // 무늬 잡음 PNG — 압축해도 5MB 를 넘는 진짜 그림
    const big = await sharp({ create: { width: 1500, height: 1500, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } }).png().toBuffer();
    expect(big.byteLength).toBeGreaterThan(5 * 1024 * 1024);
    expect((await saveBanner(deps, input({ title: `${P}큰그림` }), blob(big, "image/png"))).status).toBe(400);
    // 5MB 바로 아래 진짜 그림은 된다(상한이 그 자리에 있다)
    const justUnder = await sharp({ create: { width: 1300, height: 1300, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } }).png().toBuffer();
    expect(justUnder.byteLength).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(justUnder.byteLength).toBeGreaterThan(4 * 1024 * 1024);
    expect((await saveBanner(deps, input({ title: `${P}5MB아래` }), blob(justUnder, "image/png"))).status).toBe(200);
    const webp = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#0f0" } }).webp().toBuffer();
    expect((await saveBanner(deps, input({ title: `${P}웹피` }), blob(webp, "image/webp"))).status).toBe(400);
    // 그림 바꾸기에서 거부돼도 배너는 그대로
    const id = (await createByRpc("fankkuk_staff", { title: `${P}그대로` })).id!;
    const before = psql(`select image_path from public.banners where id = '${id}'`);
    expect((await saveBanner(deps, input({ id, title: `${P}그대로 바꿈` }), fake)).status).toBe(400);
    expect(psql(`select title || '|' || image_path from public.banners where id = '${id}'`)).toBe(`${P}그대로|${before}`);
    expect(psql(`select string_agg(title, ',' order by title) from public.banners where title like '${P}%'`)).toBe(`${P}5MB아래,${P}그대로`);
  });

  it("INV-Y4 (실패경로): 고칠 때 그림 올리기가 실패하면 글도 그대로다(반쯤 저장 없음)", async () => {
    const deps = await opsDeps();
    const id = (await createByRpc("fankkuk_staff", { title: `${P}반쯤` })).id!;
    const before = psql(`select title || '|' || image_path from public.banners where id = '${id}'`);
    const real = deps.storage;
    const failing = {
      from: (bucket: string) => ({ ...real.from(bucket), upload: async () => ({ data: null, error: new Error("올리기 실패(시험)") }) }),
    } as unknown as typeof real;
    await expect(saveBanner({ ...deps, storage: failing }, input({ id, title: `${P}반쯤 고침` }), blob(await photoWithGps()))).rejects.toThrow();
    expect(psql(`select title || '|' || image_path from public.banners where id = '${id}'`)).toBe(before);
  });

  it("INV-Y4 (실패경로): 없는 배너를 그림과 함께 고침 → 404, 올린 파일은 남지 않는다", async () => {
    const before = (await storedNames()).sort();
    const r = await saveBanner(await opsDeps(), input({ id: "22222222-2222-4222-8222-222222222222", title: `${P}없음` }), blob(await photoWithGps()));
    expect(r.status).toBe(404);
    expect((await storedNames()).sort()).toEqual(before);
  });

  it("INV-Y4: 새 배너는 그림이 있어야 한다 — 그림 없이 만들기 → 400", async () => {
    expect((await saveBanner(await opsDeps(), input({ title: `${P}그림없음` }), null)).status).toBe(400);
    expect(countTest()).toBe(0);
  });
});

describe("서버 저장 경로의 검사 (INV-Y3·Y6·Y2)", () => {
  it.each([
    ["INV-Y3 나쁜 링크", { link: "javascript:alert(1)" }, "link"],
    ["INV-Y3 // 다른 곳", { link: "//evil.com" }, "link"],
    ["INV-Y6 제목 31자", { title: `${P}${"가".repeat(28)}` }, "title"],
    ["INV-Y6 제목 공백만", { title: "   " }, "title"],
    ["INV-Y6 설명 41자", { description: "나".repeat(41) }, "description"],
    ["INV-Y2 (S2d) 거꾸로 된 기간", { startsOn: "2026-10-20", endsOn: "2026-10-19" }, "endsOn"],
    ["INV-Y2 없는 날짜(2월 30일)", { startsOn: "2026-02-30" }, "startsOn"],
    ["INV-Y2 없는 끝 날짜(13월)", { endsOn: "2026-13-01" }, "endsOn"],
  ] as const)("%s → 400·그 칸, 그림을 올리지 않고 DB 도 그대로", async (_label, over, field) => {
    const before = (await storedNames()).sort();
    const r = await saveBanner(await opsDeps(), input({ title: `${P}검사`, ...over }), blob(await photoWithGps()));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe(field);
    expect(countTest()).toBe(0);
    expect((await storedNames()).sort()).toEqual(before);
  });
});

/** INV-Y5: 로컬 DB 의 공개 저장소가 목록과 같은지 — 다르면 그 차이를 돌려준다. */
function publicBucketProblem(): string | null {
  const actual = psql("select coalesce(string_agg(id, ',' order by id), '') from storage.buckets where public").split(",").filter(Boolean);
  return actual.join(",") === PUBLIC_BUCKETS.join(",") ? null : `공개 저장소가 목록과 다르다: ${actual.join(",")}`;
}

describe("공개 저장소는 셋뿐 (INV-Y5)", () => {
  it("INV-Y5 (S5): 로컬 DB 의 저장소 목록에서 공개인 것은 정확히 creator-photos · fan-photos · banner-images", () => {
    expect(publicBucketProblem()).toBeNull();
  });

  it("INV-Y5 (S5b, 실패경로): 시험용 공개 저장소를 하나 더 만들면 같은 검사가 실패한다", async () => {
    const admin = adminClient();
    const extra = "zz-banner-test-extra";
    await admin.storage.deleteBucket(extra); // 지난 실행이 남긴 것이 있으면
    expect((await admin.storage.createBucket(extra, { public: true })).error).toBeNull();
    try {
      expect(publicBucketProblem()).toMatch(/zz-banner-test-extra/);
    } finally {
      expect((await admin.storage.deleteBucket(extra)).error).toBeNull();
    }
    expect(publicBucketProblem()).toBeNull();
  });
});

describe("글자 수 (INV-Y6)", () => {
  it("INV-Y6 (S6): 제목 30자·설명 40자 → 저장. 앞뒤 공백은 걷고 센다", async () => {
    const title = `${P}${"가".repeat(30 - P.length)}`;
    expect((await createByRpc("fankkuk_staff", { title, description: "나".repeat(40) })).code).toBeNull();
    expect((await createByRpc("fankkuk_staff", { title: `  ${P}공백  `, description: "  설명  " })).code).toBeNull();
    expect(psql(`select description from public.banners where title = '${P}공백'`)).toBe("설명");
  });

  it("INV-Y6 (S6b, 실패경로): 제목 공백만·31자, 설명 41자 → 함수가 거부하고 DB 제약도 거부한다", async () => {
    for (const [title, description] of [["   ", ""], [`${P}${"가".repeat(31 - P.length)}`, ""], [`${P}설명`, "나".repeat(41)]] as const) {
      expect((await createByRpc("fankkuk_staff", { title, description })).code, title).toBe("22023");
    }
    expect(countTest()).toBe(0);
    const id = insertDirect({ title: `${P}제약`, starts: "2026-10-01", ends: null });
    expect(psqlError(`update public.banners set description = repeat('나', 41) where id = '${id}'`)).toMatch(/banners_text_ok/);
    expect(psqlError(`update public.banners set title = ${q(`${P}${"가".repeat(28)}`)} where id = '${id}'`)).toMatch(/banners_text_ok/);
  });

  it("INV-Y6: 화면 쪽 검사(bannerTextOk)와 DB 검사(banner_text_ok)가 같은 답을 낸다", () => {
    const samples: [string, string][] = [
      ["가", ""],
      ["가".repeat(30), "나".repeat(40)],
      ["가".repeat(31), ""],
      ["가", "나".repeat(41)],
      ["", ""],
      [" 가", ""],
      ["가 ", ""],
      ["가\u3000", ""],
      ["가", "\u00a0나"],
      ["가\t나", ""],
      ["가\n나", ""],
      ["가 나", "다 라"],
      ["😀".repeat(30), ""],
      ["😀".repeat(31), ""],
      ["<b>x</b>", "<i>y</i>"],
    ];
    for (const [title, description] of samples) {
      const db = psql(`select public.banner_text_ok(${q(title)}, ${q(description)})`) === "t";
      expect(bannerTextOk(title, description), JSON.stringify([title, description])).toBe(db);
    }
  });
});

describe("보이는 순서 (INV-Y8)", () => {
  it("INV-Y8 (S8): 순서 값 2·1·1(먼저 만든 것이 셋째) → 셋째 → 둘째 → 첫째", () => {
    insertDirect({ title: `${P}첫째`, starts: "2026-01-01", ends: null, order: 2, createdAt: "2026-10-03T00:00:00+09:00" });
    // 순서 값이 같은 둘은 id 가 거꾸로다(먼저 만든 셋째가 사전순으로 뒤) — 만든 때를 보지 않고 id 로만 줄 세우면 틀린다
    insertDirect({ title: `${P}둘째`, starts: "2026-01-01", ends: null, order: 1, createdAt: "2026-10-02T00:00:00+09:00", id: "11111111-1111-4111-8111-111111111111" });
    insertDirect({ title: `${P}셋째`, starts: "2026-01-01", ends: null, order: 1, createdAt: "2026-10-01T00:00:00+09:00", id: "ffffffff-ffff-4fff-bfff-ffffffffffff" });
    expect(psql(`select string_agg(title, '|') from public.list_banners_at(now()) where title like '${P}%'`)).toBe(`${P}셋째|${P}둘째|${P}첫째`);
  });

  it("INV-Y8: 서버의 순서 정하기 — 운영자가 아니면 404, 같은 id 두 번은 400", async () => {
    const a = (await createByRpc("fankkuk_staff", { title: `${P}가` })).id!;
    const b = (await createByRpc("fankkuk_staff", { title: `${P}나` })).id!;
    expect((await orderBanners(await signedInClient("byeolbit_fan"), { ids: [b, a] })).status).toBe(404);
    expect((await orderBanners(await signedInClient("fankkuk_staff"), { ids: [a, a] })).status).toBe(400);
    expect((await orderBanners(await signedInClient("fankkuk_staff"), { ids: [b, a] })).status).toBe(200);
    expect(psql(`select string_agg(title, '|') from public.list_banners_at(now()) where title like '${P}%'`)).toBe(`${P}나|${P}가`);
  });
});

describe("기록 (INV-Y10)", () => {
  it("INV-Y10 (S10): 운영자 A 가 만들고 B 가 내림 → 기록 두 줄(A 만듦 · B 내림)과 시각", async () => {
    const before = psql("select clock_timestamp()");
    const id = (await createByRpc("fankkuk_staff", { title: `${P}기록` })).id!;
    expect((await (await signedInClient("fankkuk_admin")).rpc("admin_remove_banner", { p_id: id })).error).toBeNull();
    const after = psql("select clock_timestamp()");
    const rows = psql(
      `select acted_by || '=' || action || '=' || (at between '${before}'::timestamptz and '${after}'::timestamptz) from public.banner_changes where banner_id = '${id}' order by id`,
    );
    expect(rows.split("\n")).toEqual([`${STAFF_ID}=create=true`, `${OWNER_ID}=remove=true`]);
  });

  it("INV-Y10: 고침·순서·그림 바꾸기도 한 줄씩 남는다", async () => {
    const staff = await signedInClient("fankkuk_staff");
    const a = (await createByRpc("fankkuk_staff", { title: `${P}가` })).id!;
    const b = (await createByRpc("fankkuk_staff", { title: `${P}나` })).id!;
    await staff.rpc("admin_save_banner", { p_id: a, p_title: `${P}가2`, p_description: "", p_link: "/about", p_is_ad: false, p_starts_on: "2026-10-01", p_ends_on: null, p_image_path: null });
    await staff.rpc("admin_set_banner_order", { p_ids: [b, a] });
    await staff.rpc("admin_set_banner_image", { p_id: a, p_image_path: fakePath() });
    expect(psql(`select string_agg(action || ':' || note, ',' order by id) from public.banner_changes where banner_id = '${a}'`)).toBe("create:,edit:,order:2,edit:image");
  });

  it("INV-Y10 (S10b, 실패경로): 운영자가 기록 표를 직접 고치거나 지움 → 거부. DB 소유자도", async () => {
    const id = (await createByRpc("fankkuk_staff", { title: `${P}지울수없음` })).id!;
    const staff = await signedInClient("fankkuk_admin");
    const upd = await staff.from("banner_changes").update({ action: "edit" }).eq("banner_id", id).select();
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    const del = await staff.from("banner_changes").delete().eq("banner_id", id).select();
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    expect(psqlError(`update public.banner_changes set action = 'edit' where banner_id = '${id}'`)).toMatch(/고치거나 지울 수 없다/);
    expect(psqlError(`delete from public.banner_changes where banner_id = '${id}'`)).toMatch(/고치거나 지울 수 없다/);
    expect(psql(`select count(*) from public.banner_changes where banner_id = '${id}'`)).toBe("1");
  });
});
