import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPhotos, insertOrder, linkClient, resetLink, setHandleOk, unlockHandle, verifyCreator } from "./creator-link-helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";
import sharp from "sharp";
import { saveCreatorImage } from "@/features/creator-photo/model/save-creator-image";
import { savePreviewPick } from "@/features/creator-settings-save/model/save-creator-settings";
import { adminClient, anonClient, deleteTestOrders, psql, SEED } from "./helpers";
import { PHONE_IN_TEXT } from "./pii-shape";

// 선물 링크 페이지의 주소와 이미지 라우트 (docs/specs/creator-link.md INV-E2·E3·E5·E7·E10).
// 1) 주소 넘기기(308)는 실제 페이지가 내는 응답을 본다 — 떠 있는 개발 서버(기본 http://localhost:3000, FK_TEST_APP_URL 로 바꿈)에
//    넘기기를 따라가지 않는 요청을 보내 상태와 Location 을 읽는다. 개발 서버는 이 시험과 같은 로컬 Supabase 를 본다
//    (아이디를 막 정한 크리에이터의 링크 페이지가 200 으로 열리는지가 그 확인이다). 서버가 꺼져 있으면 실패다.
// 2) 이미지 라우트(미리보기·공지)는 라우트 함수를 직접 부르고, 그림 그리기(next/og)만 바꿔 라우트가 그리라고 넘긴 화면 조각을 받는다.
//    PNG 에서 글자를 읽을 수는 없어서, 그 조각을 글자로 펼쳐 무엇이 그려지는지 본다. 읽기는 로컬 DB 에 실제로 한다.

type ShotInit = { width?: number; height?: number; headers?: Record<string, string> };
const captured = vi.hoisted(() => ({ shots: [] as { element: unknown; init: ShotInit | undefined }[], client: null as SupabaseClient | null }));

vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor(element: unknown, init?: ShotInit) {
      super("png", { status: 200, headers: init?.headers });
      captured.shots.push({ element, init });
    }
  },
}));
vi.mock("@/shared/api/supabase/detached", () => ({
  createPublicReadSupabase: () => anonClient(),
  readPublicStorageBase: () => process.env.FK_TEST_API_URL ?? "",
}));
vi.mock("@/shared/api/supabase/server", () => ({
  createRequestSupabase: async () => {
    if (!captured.client) throw new Error("시험이 요청 클라이언트를 정하지 않았다");
    return captured.client;
  },
}));

const { GET: previewGet } = await import("@/app/api/og/[id]/route");
const { GET: noticeGet } = await import("@/app/api/notice/[id]/route");

const APP = process.env.FK_TEST_APP_URL ?? "http://localhost:3000";
const A = CV.haru;
const B = CV.summer;
const C = CV.ggul; // 본인 확인 전
const FAN_X = SEED.fanId; // 별빛 (byeolbit_fan)
const FAN_Y = SEED.otherFanId; // 달토끼 (daltokki_fan)
/** 주문 상자 값 — 요금표에 없는 금액이라 화면에 나오면 주문에서 온 것이다. */
const ODD_PRICE = 13570;
const INTRO = "와우산로 근처 사는 느긋한 방송";
/** 공지 이미지에는 한 줄 소개가 들어간다(INV-E10) — 주소 꼴이 아닌 소개. */
const NOTICE_INTRO = "느긋하게 게임하는 방송";

async function open(path: string): Promise<Response> {
  return fetch(`${APP}${path}`, { redirect: "manual", headers: { accept: "text/html" } });
}

/** 넘기기 응답의 상태와 넘어갈 경로. */
async function redirectOf(path: string): Promise<[number, string]> {
  const res = await open(path);
  const loc = res.headers.get("location");
  return [res.status, loc ? new URL(loc, APP).pathname : ""];
}

async function saveIntro(login: string, name: string, intro: string): Promise<void> {
  const r = await (await linkClient(login)).rpc("update_my_creator_profile", { p_name: name, p_intro: intro, p_searchable: true });
  if (r.error) throw new Error(`소개 저장 실패: ${r.error.code}`);
}

/** 주문 하나에 요금표에 없는 금액의 상자를 붙인다. */
function addBox(orderNo: string): void {
  psql(
    `begin; set local session_replication_role = replica;
     insert into public.boxes (order_id, seq, declared_tier, price_krw, shipping_fee_krw, inspection_fee_krw) select id, 1, 'small', ${ODD_PRICE}, 4000, 1500 from public.orders where order_no = '${orderNo}';
     commit;`,
  );
}

/** 라우트가 그리라고 넘긴 화면 조각을 글자로 — 사진·로고(data 주소)는 뺀다. */
function drawnText(element: unknown): string {
  if (!isValidElement(element)) throw new Error("라우트가 화면 조각을 넘기지 않았다");
  return renderToStaticMarkup(element as ReactElement)
    .replace(/<img[^>]*>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lastShot() {
  const shot = captured.shots.at(-1);
  if (!shot) throw new Error("이미지가 그려지지 않았다");
  return shot;
}

/** 크리에이터 A 와 두 팬의 pii 칸 값(이메일·휴대폰) — 시험 계정에 값이 없으면 넣어 두고 읽는다. */
function piiStrings(): string[] {
  psql(
    `insert into pii.account_contacts (account_id, email, phone) values ('${A.id}', 'cvt-haru-pii@fankkuk.test', '01077770303')
     on conflict (account_id) do update set email = coalesce(pii.account_contacts.email, excluded.email), phone = coalesce(pii.account_contacts.phone, excluded.phone)`,
  );
  const ids = [A.id, FAN_X, FAN_Y].map((id) => `'${id}'`).join(", ");
  return psql(`select coalesce(email, '') || chr(10) || coalesce(phone, '') from pii.account_contacts where account_id in (${ids})`)
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter((v) => v.length >= 6);
}

function forbidden(orderNos: string[]): string[] {
  return [
    ...orderNos,
    ...piiStrings(),
    "581234567890",
    "6012345678901",
    "별빛",
    "달토끼",
    "byeolbit_fan",
    "daltokki_fan",
    A.login,
    String(ODD_PRICE),
    ODD_PRICE.toLocaleString("ko-KR"),
  ];
}

beforeAll(async () => {
  try {
    await fetch(APP, { redirect: "manual" });
  } catch {
    throw new Error(`개발 서버(${APP})가 떠 있어야 한다 — npm run dev 로 띄운 뒤 실행한다`);
  }
  createCvAccounts();
  resetLink();
  await clearPhotos();
}, 60_000);
beforeEach(async () => {
  deleteTestOrders();
  resetLink();
  await clearPhotos();
  resetCv();
  verifyCreator(A.creatorId, "cvt-route-a");
  verifyCreator(B.creatorId, "cvt-route-b");
  captured.shots.length = 0;
  captured.client = null;
});
afterAll(async () => {
  deleteTestOrders();
  resetLink();
  await clearPhotos();
  dropCvAccounts();
});

describe("주소 넘기기 — 실제 페이지 응답 (개발 서버)", () => {
  it(
    "INV-E2 S2b: 대문자가 섞인 링크 주소로 열면 308 로 소문자 주소로 넘기고, 소문자 주소는 그 크리에이터 페이지가 200 으로 열린다",
    async () => {
      await setHandleOk(A.login, "rt_haru7");
      const page = await open("/rt_haru7");
      expect(page.status).toBe(200);
      expect(await page.text()).toContain(A.name);
      expect(await redirectOf("/RT_Haru7")).toEqual([308, "/rt_haru7"]);
    },
    120_000,
  );

  it("INV-E3 S3b: 묶여 있는 옛 아이디 주소로 열면 308 로 지금 아이디 주소로 넘긴다", async () => {
    await setHandleOk(A.login, "rt_old");
    unlockHandle(A.creatorId);
    await setHandleOk(A.login, "rt_new");
    expect(await redirectOf("/rt_old")).toEqual([308, "/rt_new"]);
    // 대문자 옛 아이디는 소문자로 먼저 넘기고, 그다음 지금 아이디로 넘어간다
    expect(await redirectOf("/RT_OLD")).toEqual([308, "/rt_old"]);
  });

  it("INV-E3 S3c (실패경로): 90일이 지나 풀린 옛 아이디 주소는 없는 페이지다", async () => {
    await setHandleOk(A.login, "rt_gone");
    unlockHandle(A.creatorId);
    await setHandleOk(A.login, "rt_gone2");
    psql(`update public.creator_handles set retired_until = now() - interval '1 day' where handle = 'rt_gone'`);
    expect((await open("/rt_gone")).status).toBe(404);
  });

  it("INV-E5 S5: 아이디가 있는 크리에이터의 옛 페이지 주소(/creators/{id})는 308 로 링크 주소로 넘기고, 아이디가 없으면 그 주소가 그대로 200 이다", async () => {
    await setHandleOk(A.login, "rt_s5");
    expect(await redirectOf(`/creators/${A.creatorId}`)).toEqual([308, "/rt_s5"]);
    const plain = await open(`/creators/${B.creatorId}`);
    expect(plain.status).toBe(200);
    expect(await plain.text()).toContain(B.name);
  });

  it("INV-E5 S5b (실패경로): 본인 확인 전 크리에이터가 정해 둔 아이디·없는 아이디·그 크리에이터의 옛 페이지 주소는 없는 페이지다", async () => {
    await setHandleOk(C.login, "rt_unverified");
    expect((await open("/rt_unverified")).status).toBe(404);
    expect((await open("/rt_nobody_here")).status).toBe(404);
    expect((await open(`/creators/${C.creatorId}`)).status).toBe(404);
  });

  it("INV-E5 · approval-signature INV-S15: 탈퇴한 크리에이터의 링크 주소·옛 페이지 주소는 없는 페이지(404)가 아니라 「탈퇴한 크리에이터입니다.」가 200 으로 열린다", async () => {
    await setHandleOk(A.login, "rt_left");
    // 탈퇴하면 본인 확인이 꺼지고 탈퇴 시각이 남는다 — 링크 찾기는 빈 결과가 된다
    psql(`begin; set local session_replication_role = replica; update public.creators set withdrawn_at = now(), identity_verified = false where id = '${A.creatorId}'; commit;`);
    try {
      for (const path of ["/rt_left", `/creators/${A.creatorId}`]) {
        const res = await open(path);
        expect([path, res.status]).toEqual([path, 200]);
        expect([path, (await res.text()).includes("탈퇴한 크리에이터입니다.")]).toEqual([path, true]);
      }
    } finally {
      psql(`begin; set local session_replication_role = replica; update public.creators set withdrawn_at = null where id = '${A.creatorId}'; commit;`);
    }
  });

  it("INV-E7 S7: 로그인 안 한 사람이 받는 링크 페이지 HTML 에 주문번호·운송장·주문 금액·팬 닉네임·로그인 아이디·전화번호 꼴·열람 건수가 없다", async () => {
    await setHandleOk(A.login, "rt_s7");
    await saveIntro(A.login, A.name, INTRO);
    const orders = [
      insertOrder(FAN_X, A.creatorId, "shipped", "now()", { waybill: "581234567890", tracking: "6012345678901" }),
      insertOrder(FAN_Y, A.creatorId, "label_printed", "now()"),
    ];
    orders.forEach(addBox);
    const res = await open("/rt_s7");
    expect(res.status).toBe(200);
    const html = await res.text();
    // 있어야 할 것이 있어야 없는 것의 확인이 뜻을 가진다
    expect(html).toContain(A.name);
    // 화면의 링크 주소 줄은 재디자인(카드 d134, docs/ux/pages/handle.md 「없음」 표)에서 뺐다 — 그 아이디의 페이지라는 것은 정식 주소로 본다
    expect(html).toMatch(/<link rel="canonical" href="[^"]*\/rt_s7"/);
    expect(html).toContain(INTRO);
    // 집계 숫자(팬 둘)는 나온다 — 누가·몇 개·금액은 없다. 재디자인(카드 d134) 뒤 문구는 「이번 달 선물한 팬 N명」 한 칸이다
    expect(html).toMatch(/이번 달 선물한 팬 (<!-- -->)?2(<!-- -->)?명/);
    for (const bad of forbidden(orders)) expect([bad, html.includes(bad)]).toEqual([bad, false]);
    expect(html.match(/FC-[0-9A-Z]{3,}/g)).toBeNull();
    expect(PHONE_IN_TEXT.test(html)).toBe(false);
    expect(html).not.toMatch(/열람/);
  });
});

describe("미리보기·공지 이미지 라우트가 그리는 것 (INV-E7·E10)", () => {
  it("INV-E10 S10: 미리보기 라우트가 그리는 글자는 공개 이름·「승인한 선물만 받습니다」·팬꾹뿐 — 소개(주소 꼴 문자열)·금액·주문번호·로그인 아이디가 없다", async () => {
    await setHandleOk(A.login, "rt_og");
    await saveIntro(A.login, A.name, INTRO);
    const orders = [insertOrder(FAN_X, A.creatorId, "shipped", "now()", { waybill: "581234567890" })];
    orders.forEach(addBox);
    const res = await previewGet(new Request(`http://app.test/api/og/${A.creatorId}?v=0`), { params: Promise.resolve({ id: A.creatorId }) });
    expect(res.status).toBe(200);
    const text = drawnText(lastShot().element);
    // 사진이 없으면 기본 이미지(이름 첫 글자 원) — 그다음 공개 이름·정해진 문구·로고 글자
    expect(text).toBe(`${[...A.name][0]} ${A.name} 승인한 선물만 받습니다 팬꾹`);
    for (const bad of [...forbidden(orders), "와우산로", INTRO, "rt_og"]) expect([bad, text.includes(bad)]).toEqual([bad, false]);
  });

  it("INV-E10 S10: 공지 이미지 세 크기가 그리는 글자는 이름 첫 글자(사진 없음)·공개 이름·한 줄 소개·「팬꾹으로 선물 보내기」·링크 주소뿐 — 부탁 문구·로그인 없이도 열린다", async () => {
    await setHandleOk(A.login, "rt_notice");
    await saveIntro(A.login, A.name, NOTICE_INTRO);
    const orders = [insertOrder(FAN_X, A.creatorId, "shipped", "now()", { waybill: "581234567890" })];
    orders.forEach(addBox);
    const sizes: [string, number | undefined, number | undefined][] = [];
    for (const size of ["square", "story", "wide"]) {
      const res = await noticeGet(new Request(`http://app.test/api/notice/${A.creatorId}?size=${size}`), { params: Promise.resolve({ id: A.creatorId }) });
      expect([size, res.status]).toEqual([size, 200]);
      const shot = lastShot();
      sizes.push([size, shot.init?.width, shot.init?.height]);
      const text = drawnText(shot.element);
      expect([size, text]).toEqual([size, `${[...A.name][0]} ${A.name} ${NOTICE_INTRO} 팬꾹으로 선물 보내기 fankkuk.kr/rt_notice`]);
      for (const bad of [...forbidden(orders), "선물은 팬꾹으로 받아요", "승인한 선물만 받습니다"]) expect([size, bad, text.includes(bad)]).toEqual([size, bad, false]);
    }
    expect(sizes).toEqual([
      ["square", 1080, 1080],
      ["story", 1080, 1920],
      ["wide", 1200, 675],
    ]);
  });

  it("INV-E10 S10 (실패경로): 링크용 아이디가 없거나 본인 확인 전이면 공지 이미지를 만들지 않는다 — 정해진 크기 밖도 거부", async () => {
    const get = (id: string, q: string) => noticeGet(new Request(`http://app.test/api/notice/${id}${q}`), { params: Promise.resolve({ id }) });
    expect((await get(A.creatorId, "?size=square")).status).toBe(404);
    await setHandleOk(A.login, "rt_notice_x");
    for (const q of ["", "?size=big", "?size=SQUARE"]) expect([q, (await get(A.creatorId, q)).status]).toEqual([q, 400]);
    expect((await get(C.creatorId, "?size=square")).status).toBe(404);
    expect((await get("not-a-uuid", "?size=square")).status).toBe(404);
    expect(captured.shots).toEqual([]);
  });

  it("INV-E10 (실패경로): 공지 이미지 크기 검사는 DB 를 읽기 전이다 — 없는 크리에이터여도 크기가 틀리면 400", async () => {
    const nobody = "00000000-0000-4000-b000-0000000000ff";
    const get = (q: string) => noticeGet(new Request(`http://app.test/api/notice/${nobody}${q}`), { params: Promise.resolve({ id: nobody }) });
    expect((await get("?size=big")).status).toBe(400);
    expect((await get("?size=square")).status).toBe(404);
  });

  it("INV-E10: 공지 이미지 쿼리가 size·download 꼴이 아니면 정해진 주소로 넘기고(307, 캐시 안 함) 그리지 않는다", async () => {
    await setHandleOk(A.login, "rt_notice_q");
    const get = (q: string) => noticeGet(new Request(`http://app.test/api/notice/${A.creatorId}${q}`), { params: Promise.resolve({ id: A.creatorId }) });
    for (const [q, to] of [
      ["?size=square&utm=x", "?size=square"],
      ["?size=story&download=0", "?size=story"],
      ["?download=1&size=wide", "?size=wide&download=1"],
      ["?size=wide&download=1&v=2", "?size=wide&download=1"],
    ] as const) {
      const res = await get(q);
      const loc = new URL(res.headers.get("location") ?? "", "http://app.test");
      expect([q, res.status, loc.pathname + loc.search, res.headers.get("cache-control")]).toEqual([q, 307, `/api/notice/${A.creatorId}${to}`, "no-store"]);
    }
    expect(captured.shots).toEqual([]);
  });

  it("INV-E10: 내려받기(download=1)는 캐시하지 않고 파일로 — 바로 열기는 짧게 캐시한다. 글꼴은 시안 굵기 넷(500·600·700·800)을 넘긴다", async () => {
    await setHandleOk(A.login, "rt_notice_dl");
    const get = (q: string) => noticeGet(new Request(`http://app.test/api/notice/${A.creatorId}${q}`), { params: Promise.resolve({ id: A.creatorId }) });
    const dl = await get("?size=story&download=1");
    expect([dl.status, dl.headers.get("cache-control"), dl.headers.get("content-disposition")]).toEqual([200, "no-store", 'attachment; filename="fankkuk-notice-story.png"']);
    const fonts = (lastShot().init as { fonts?: { weight: number }[] } | undefined)?.fonts ?? [];
    expect(fonts.map((f) => f.weight)).toEqual([500, 600, 700, 800]);
    const view = await get("?size=story");
    expect([view.status, view.headers.get("cache-control"), view.headers.get("content-disposition")]).toEqual([200, "public, max-age=300", null]);
  });

  it("INV-E10 S10: 팬덤 심볼을 고르면 미리보기 라우트는 심볼 판(v=s{판})으로 그리고, 프로필 사진 판 주소는 심볼 판으로 넘긴다", async () => {
    const square = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#88e" } }).jpeg().toBuffer();
    const viewer = { userId: A.id, role: "creator" as const };
    for (let i = 0; i < 2; i += 1) {
      expect(await saveCreatorImage({ admin: adminClient(), viewer }, "symbol", new Blob([new Uint8Array(square)], { type: "image/jpeg" }), { rightsChecked: true })).toMatchObject({ ok: true });
    }
    expect(await savePreviewPick({ client: await linkClient(A.login), viewer }, { pick: "symbol" })).toEqual({ ok: true });
    const at = (q: string) => previewGet(new Request(`http://app.test/api/og/${A.creatorId}${q}`), { params: Promise.resolve({ id: A.creatorId }) });
    const moved = await at("?v=0");
    expect([moved.status, new URL(moved.headers.get("location") ?? "", "http://app.test").search]).toEqual([307, "?v=s2"]);
    const res = await at("?v=s2");
    expect(res.status).toBe(200);
    expect(drawnText(lastShot().element)).toBe(`${A.name} 승인한 선물만 받습니다 팬꾹`);
  });
});

describe("미리보기 이미지 주소의 판(v)과 캐시 (INV-E9)", () => {
  it("INV-E9: 주소의 v 가 지금 사진 판과 다르거나 없으면 지금 판 주소로 넘기고 그리지 않는다", async () => {
    psql(`update public.creators set photo_version = 3, photo_path = id::text || '/3.webp' where id = '${A.creatorId}'`); // 판은 사진 경로의 번호다
    for (const query of ["?v=1", "", "?v=abc"]) {
      const res = await previewGet(new Request(`http://app.test/api/og/${A.creatorId}${query}`), { params: Promise.resolve({ id: A.creatorId }) });
      expect([query, res.status, new URL(res.headers.get("location") ?? "", "http://app.test").pathname + new URL(res.headers.get("location") ?? "", "http://app.test").search]).toEqual([
        query,
        307,
        `/api/og/${A.creatorId}?v=3`,
      ]);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(captured.shots).toEqual([]);
  });

  it("INV-E9: 주소의 v 가 지금 사진 판과 같으면 그리고, 공유 캐시가 오래 들고 있게 한다", async () => {
    psql(`update public.creators set photo_version = 3, photo_path = id::text || '/3.webp' where id = '${A.creatorId}'`); // 판은 사진 경로의 번호다
    const res = await previewGet(new Request(`http://app.test/api/og/${A.creatorId}?v=3`), { params: Promise.resolve({ id: A.creatorId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/^public, .*s-maxage=\d{6,}/);
  });

  it("INV-E9 (실패경로): 본인 확인 전·없는 크리에이터는 404", async () => {
    const res = await previewGet(new Request(`http://app.test/api/og/${C.creatorId}?v=0`), { params: Promise.resolve({ id: C.creatorId }) });
    expect(res.status).toBe(404);
  });
});
