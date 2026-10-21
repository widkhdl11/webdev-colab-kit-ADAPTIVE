import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestAccount, removeTestAccounts, type TestAccount, FIXTURE_PASSWORD } from "./account-fixtures";
import { resetLink, setHandleOk, verifyCreator } from "./creator-link-helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";
import { giftBoxes, resetReplySettings } from "./gift-reply-helpers";
import { deleteTestBlocks, deleteTestOrders, psql, signedInClient } from "./helpers";
import { allStoredObjects, clearGiftPhotos, jpegWithGps, kstDateDaysAgo, paidOrder, photoFiles, sessionCookie } from "./together-helpers";

// 함께한 시간 화면·사진 라우트를 떠 있는 개발 서버(기본 http://localhost:3000, FK_TEST_APP_URL)에 실제 HTTP 로 연다
// (docs/specs/together.md INV-F1·F2·F5·F6, 「내 선물」 묶음). 로그인은 시험 계정으로 받은 세션 쿠키를 Cookie 머리줄에 싣는다.
// 개발 서버는 이 시험과 같은 로컬 Supabase 를 본다. 서버가 꺼져 있으면 실패다.
// 팬은 시드 계정이 아니라 새로 만든 시험 계정 둘 — 시드 팬에게는 다른 크리에이터에게 보낸 시드 주문이 있어 「크리에이터 한 명」을 만들 수 없다.

const APP = process.env.FK_TEST_APP_URL ?? "http://localhost:3000";
const A = CV.haru;
const B = CV.summer;
const IDS = [A, B].map((c) => `'${c.creatorId}'`).join(", ");
const HANDLE = "tg_haru_page";
/** 상자 값 — 화면에 나오면 금액이 새어 나간 것이다. */
const BOX_PRICE = "6,900";

let fanA: TestAccount;
let fanB: TestAccount;
const cookies = new Map<string, string>();

type Who = "fanA" | "fanB" | "creator" | "operator";

async function cookieOf(who: Who): Promise<string> {
  const hit = cookies.get(who);
  if (hit) return hit;
  const c =
    who === "creator"
      ? await sessionCookie(`${A.login}@fankkuk.test`, "fankkuk-local-1234")
      : who === "operator"
        ? await sessionCookie("fankkuk_staff@fankkuk.test", "fankkuk-local-1234")
        : await sessionCookie((who === "fanA" ? fanA : fanB).loginEmail, FIXTURE_PASSWORD);
  cookies.set(who, c);
  return c;
}

async function open(path: string, who: Who | null): Promise<Response> {
  const headers: Record<string, string> = { accept: "text/html" };
  if (who) headers.cookie = await cookieOf(who);
  return fetch(`${APP}${path}`, { redirect: "manual", headers });
}

async function html(path: string, who: Who): Promise<string> {
  const res = await open(path, who);
  expect(res.status, path).toBe(200);
  return res.text();
}

/** 넘기기 응답의 상태와 넘어갈 경로(+물음표 뒤). */
async function redirectOf(path: string, who: Who | null): Promise<[number, string]> {
  const res = await open(path, who);
  const loc = res.headers.get("location");
  const u = loc ? new URL(loc, APP) : null;
  return [res.status, u ? `${u.pathname}${u.search}` : ""];
}

/** 화면 HTML 안의 보이는 글자 — 태그·스크립트를 걷어 낸다. */
function visibleText(page: string): string {
  return page
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    // React 가 이어진 글자 조각 사이에 넣는 빈 주석 — 화면에서는 붙어 보인다
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

async function upload(orderNo: string, who: "fanA" | "fanB" | null, bytes: Buffer): Promise<Response> {
  const form = new FormData();
  form.append("photo", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), "gift.jpg");
  const headers: Record<string, string> = { origin: APP };
  if (who) headers.cookie = await cookieOf(who);
  return fetch(`${APP}/api/gifts/photo/${orderNo}`, { method: "POST", body: form, headers, redirect: "manual" });
}

function follow(fanId: string): void {
  psql(`insert into public.follows (fan_id, creator_id) values ('${fanId}', '${A.creatorId}') on conflict do nothing`);
}

beforeAll(async () => {
  try {
    await fetch(APP, { redirect: "manual" });
  } catch {
    throw new Error(`개발 서버(${APP})가 떠 있어야 한다 — npm run dev 로 띄운 뒤 실행한다`);
  }
  createCvAccounts();
  fanA = await createTestAccount({ tag: "tgfana" });
  fanB = await createTestAccount({ tag: "tgfanb" });
}, 60_000);
beforeEach(async () => {
  deleteTestOrders();
  deleteTestBlocks();
  resetCv();
  resetLink();
  resetReplySettings(IDS);
  await clearGiftPhotos([fanA.userId, fanB.userId]);
  verifyCreator(A.creatorId, "cvt-tgr-a");
  verifyCreator(B.creatorId, "cvt-tgr-b");
  await setHandleOk(A.login, HANDLE);
  psql(`update public.creators set resume_on = null, birthday_month = null, birthday_day = null where id in (${IDS})`);
});
afterAll(async () => {
  deleteTestOrders();
  deleteTestBlocks();
  resetLink();
  psql(`update public.creators set resume_on = null, birthday_month = null, birthday_day = null where id in (${IDS})`);
  if (fanA && fanB) await clearGiftPhotos([fanA.userId, fanB.userId]);
  removeTestAccounts();
  dropCvAccounts();
});

describe("함께한 시간 화면 — 본인만 (INV-F1)", () => {
  it("INV-F1 S1: 보낸 팬은 링크 주소로 자기 기록을 본다 — 이름·처음 선물한 날·숫자", async () => {
    paidOrder(fanA.userId, A.creatorId, "now() - interval '3 days'");
    giftBoxes(fanA.userId, A.creatorId, 1);
    const text = visibleText(await html(`/gifts/with/${HANDLE}`, "fanA"));
    expect(text).toContain(`${A.name}님과 함께한 시간`);
    expect(text).toContain("나만 볼 수 있어요");
    expect(text).toMatch(/함께한 선물 2\s*개/);
    expect(text).toContain(kstDateDaysAgo(5).replaceAll("-", "."));
  });

  it("INV-F1 S1 (실패경로): 다른 팬·그 크리에이터가 같은 주소를 열면 없는 페이지, 로그인 안 함은 로그인으로", async () => {
    paidOrder(fanA.userId, A.creatorId, "now() - interval '3 days'");
    for (const who of ["fanB", "creator"] as const) {
      const res = await open(`/gifts/with/${HANDLE}`, who);
      expect(res.status, who).toBe(404);
      expect(visibleText(await res.text()), who).not.toContain("함께한 시간");
      // ID 주소는 기록을 읽기 전에 공개 링크 주소로 넘긴다(링크 주소는 크리에이터 페이지 주소라 공개다) — 넘겨진 주소에서 없는 페이지
      expect(await redirectOf(`/gifts/with/${A.creatorId}`, who), `${who} id`).toEqual([307, `/gifts/with/${HANDLE}`]);
    }
    const [status, to] = await redirectOf(`/gifts/with/${HANDLE}`, null);
    expect(status).toBe(307);
    expect(to).toBe(`/login?next=/gifts/with/${HANDLE}`);
  });

  it("INV-F1·F2 (실패경로): 운영자 세션으로 함께한 시간 화면과 사진 주소를 열면 404", async () => {
    const orderNo = paidOrder(fanA.userId, A.creatorId, "now() - interval '3 days'");
    expect((await upload(orderNo, "fanA", await jpegWithGps(640, 480))).status).toBe(200);
    for (const path of [`/gifts/with/${HANDLE}`, `/gifts/with/${A.creatorId}`]) {
      const res = await open(path, "operator");
      expect(res.status, path).toBe(404);
      expect(visibleText(await res.text()), path).not.toContain("함께한 시간");
    }
    const photo = await open(`/api/gifts/photo/${orderNo}`, "operator");
    expect(photo.status).toBe(404);
    expect(photo.headers.get("location")).toBeNull();
  });

  it("INV-F1: 크리에이터 ID 주소로 열면 링크 주소로 넘긴다 · 꼴이 틀린 주소는 없는 페이지", async () => {
    paidOrder(fanA.userId, A.creatorId, "now() - interval '3 days'");
    expect(await redirectOf(`/gifts/with/${A.creatorId}`, "fanA")).toEqual([307, `/gifts/with/${HANDLE}`]);
    expect((await open("/gifts/with/NOT-A-HANDLE", "fanA")).status).toBe(404);
  });
});

describe("「내 선물」 크리에이터별 묶음", () => {
  it("INV-J14 S14b: 크리에이터가 한 명이어도 보낸 선물은 넘기지 않고 묶음 하나 — 묶음 머리가 그 함께한 시간으로 간다(action-center INV-J14, 2026-10-21)", async () => {
    paidOrder(fanA.userId, A.creatorId, "now() - interval '3 days'");
    const res = await open("/gifts", "fanA");
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(visibleText(page)).toContain("보낸 선물");
    expect(page).toContain(`href="/gifts/with/${HANDLE}"`);
  });

  it("INV-F1 (실패경로): 본인 확인이 풀린 크리에이터는 링크 주소가 열리지 않으니 묶음 머리가 ID 주소로 가고, 그 주소는 열린다", async () => {
    paidOrder(fanA.userId, A.creatorId, "now() - interval '3 days'");
    psql(`begin; set local session_replication_role = replica; update public.creators set identity_verified = false where id = '${A.creatorId}'; commit;`);
    expect(await html("/gifts", "fanA")).toContain(`href="/gifts/with/${A.creatorId}"`);
    expect(visibleText(await html(`/gifts/with/${A.creatorId}`, "fanA"))).toContain(`${A.name}님과 함께한 시간`);
  });

  it("INV-J14 S14: 크리에이터가 둘이면 크리에이터마다 묶음 머리가 함께한 시간으로 간다", async () => {
    paidOrder(fanA.userId, A.creatorId, "now() - interval '3 days'");
    paidOrder(fanA.userId, B.creatorId, "now() - interval '1 days'");
    const page = await html("/gifts", "fanA");
    expect(page).toContain(`href="/gifts/with/${HANDLE}"`);
    expect(page).toContain(`href="/gifts/with/${B.creatorId}"`);
  });
});

describe("다음 기념일 칸·선물 보내기 (INV-F5)", () => {
  function birthdayInDays(days: number): void {
    psql(
      `update public.creators set birthday_month = extract(month from public.receiving_today() + ${days})::smallint,
         birthday_day = extract(day from public.receiving_today() + ${days})::smallint where id = '${A.creatorId}'`,
    );
  }

  it("INV-F5 S5: 크리에이터가 쉬는 중이면 기념일 칸에 「{날짜}부터 다시 받아요」, 선물 보내기 버튼은 없다", async () => {
    paidOrder(fanA.userId, A.creatorId, "now() - interval '3 days'");
    follow(fanA.userId);
    birthdayInDays(12);
    psql(`update public.creators set resume_on = public.receiving_today() + 5 where id = '${A.creatorId}'`);
    const resume = psql(`select to_char(public.receiving_today() + 5, 'FMMM"월" FMDD"일"')`);
    const page = await html(`/gifts/with/${HANDLE}`, "fanA");
    const text = visibleText(page);
    expect(text).toContain("생일 D-12");
    expect(text).toContain(`${resume}부터 다시 받아요`);
    expect(page).not.toContain(`/gifts/new?creator=${A.creatorId}`);
  });

  it("INV-F5 (실패경로): 받는 중이면 같은 칸에 선물 보내기 버튼이 있고 「다시 받아요」는 없다", async () => {
    paidOrder(fanA.userId, A.creatorId, "now() - interval '3 days'");
    follow(fanA.userId);
    birthdayInDays(12);
    const page = await html(`/gifts/with/${HANDLE}`, "fanA");
    expect(page).toContain(`href="/gifts/new?creator=${A.creatorId}"`);
    expect(visibleText(page)).not.toContain("다시 받아요");
  });

  it("INV-F5 (decline-block INV-D7): 크리에이터가 그 팬을 차단해도 버튼을 숨기지 않고 기록도 그대로다", async () => {
    paidOrder(fanA.userId, A.creatorId, "now() - interval '3 days'");
    follow(fanA.userId);
    birthdayInDays(12);
    psql(`insert into public.creator_blocks (creator_id, sender_id) values ('${A.creatorId}', '${fanA.userId}')`);
    const page = await html(`/gifts/with/${HANDLE}`, "fanA");
    expect(page).toContain(`href="/gifts/new?creator=${A.creatorId}"`);
    expect(visibleText(page)).toMatch(/함께한 선물 1\s*개/);
    expect(visibleText(page)).not.toContain("차단");
  });
});

describe("「선물 보내기」 — 크리에이터 페이지와 같은 판정 (INV-F5)", () => {
  /** 화면의 보내기 자리: 「선물 보내기」 링크가 있는가 · 「팔로우하고 선물 보내기」 버튼이 있는가. 없는 페이지면 둘 다 없음. */
  async function sendSpot(path: string): Promise<[boolean, boolean] | "missing"> {
    const res = await open(path, "fanA");
    if (res.status === 404) return "missing";
    expect(res.status, path).toBe(200);
    const page = await res.text();
    return [page.includes(`href="/gifts/new?creator=${A.creatorId}"`), page.includes(`aria-label="${A.name}님 팔로우하고 선물 보내기"`)];
  }
  const spotOf = (r: [boolean, boolean] | "missing"): [boolean, boolean] => (r === "missing" ? [false, false] : r);

  const states: { name: string; setup: () => void; expected: [boolean, boolean]; togetherPath: string }[] = [
    { name: "팔로우함·받는 중", setup: () => follow(fanA.userId), expected: [true, false], togetherPath: `/gifts/with/${HANDLE}` },
    { name: "팔로우 안 함", setup: () => undefined, expected: [false, true], togetherPath: `/gifts/with/${HANDLE}` },
    {
      name: "쉬는 중",
      setup: () => {
        follow(fanA.userId);
        psql(`update public.creators set resume_on = public.receiving_today() + 5 where id = '${A.creatorId}'`);
      },
      expected: [false, false],
      togetherPath: `/gifts/with/${HANDLE}`,
    },
    {
      // 본인 확인이 풀린 크리에이터 — 크리에이터 페이지가 없다. 함께한 시간은 ID 주소로 남고 버튼은 없다
      name: "본인 확인 전",
      setup: () => {
        follow(fanA.userId);
        psql(`begin; set local session_replication_role = replica; update public.creators set identity_verified = false where id = '${A.creatorId}'; commit;`);
      },
      expected: [false, false],
      togetherPath: `/gifts/with/${A.creatorId}`,
    },
  ];

  for (const st of states) {
    it(`INV-F5 (실패경로): ${st.name} — 함께한 시간과 크리에이터 페이지의 보내기 자리가 같다`, async () => {
      paidOrder(fanA.userId, A.creatorId, "now() - interval '3 days'");
      psql(
        `update public.creators set birthday_month = extract(month from public.receiving_today() + 12)::smallint,
           birthday_day = extract(day from public.receiving_today() + 12)::smallint where id = '${A.creatorId}'`,
      );
      st.setup();
      const creatorPage = spotOf(await sendSpot(`/${HANDLE}`));
      const together = await sendSpot(st.togetherPath);
      expect(together, "함께한 시간은 기록이 있으니 열린다").not.toBe("missing");
      expect(creatorPage, "크리에이터 페이지").toEqual(st.expected);
      expect(together, "함께한 시간").toEqual(creatorPage);
    });
  }
});

describe("특별 카드 화면 (INV-F4)", () => {
  it("INV-F4 S4: 선물 10개 화면에 「10번째 선물이에요」가 딱 한 번", async () => {
    for (let i = 10; i >= 1; i--) paidOrder(fanA.userId, A.creatorId, `now() - interval '${i} days'`);
    const text = visibleText(await html(`/gifts/with/${HANDLE}`, "fanA"));
    expect(text.split("10번째 선물이에요").length - 1).toBe(1);
    expect(text).not.toContain("30번째 선물이에요");
  });
});

describe("화면에 금액·시각 없음 (INV-F6)", () => {
  it("INV-F6 S6 (실패경로): 원본 HTML 전체(스크립트 포함)에 등록 시각·상자 값 칸 이름과 ISO 시각 꼴이 없다", async () => {
    giftBoxes(fanA.userId, A.creatorId, 2);
    paidOrder(fanA.userId, A.creatorId, "now() - interval '3 days'");
    const page = await html(`/gifts/with/${HANDLE}`, "fanA");
    expect(page).toContain("함께한 시간");
    for (const leak of ["registered_at", "registeredAt", "price_krw", "priceKrw", "shipped_at", "replied_at"]) expect(page, leak).not.toContain(leak);
    expect(page).not.toMatch(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/);
  });

  it("INV-F6 S6 (실패경로): 출고 상자가 있는 기록 화면에도 상자 값이 나오지 않는다", async () => {
    giftBoxes(fanA.userId, A.creatorId, 2);
    const text = visibleText(await html(`/gifts/with/${HANDLE}`, "fanA"));
    expect(text).toContain("상자 2개");
    expect(text).not.toContain(BOX_PRICE);
    expect(text).not.toContain("6900");
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("사진 라우트 (INV-F2)", () => {
  it("INV-F2 S2b: 개발 서버로 올린 위치 정보 사진 — 저장 파일에 사진 정보가 없고, 본인은 짧은 서명 주소로 넘겨받아 연다", async () => {
    const orderNo = paidOrder(fanA.userId, A.creatorId, "now() - interval '1 day'");
    const before = new Set(allStoredObjects());
    const up = await upload(orderNo, "fanA", await jpegWithGps());
    expect(up.status).toBe(200);
    expect(up.headers.get("cache-control")).toBe("no-store");
    expect(await photoFiles(fanA.userId)).toHaveLength(1);
    // 모든 버킷을 통틀어 늘어난 파일은 선물 사진 webp 하나뿐이다 — 원본은 어디에도 저장되지 않는다
    const added = allStoredObjects().filter((o) => !before.has(o));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(new RegExp(`^gift-photos/${fanA.userId}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.webp$`));
    const res = await open(`/api/gifts/photo/${orderNo}`, "fanA");
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const signed = res.headers.get("location") ?? "";
    expect(signed).toMatch(/\/storage\/v1\/object\/sign\/gift-photos\//);
    expect(signed).toMatch(/[?&]token=/);
    // 서명 주소의 토큰(JWT)을 풀어 유효 시간을 본다 — 짧게(60초 이하)
    const token = new URL(signed).searchParams.get("token") ?? "";
    const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { iat: number; exp: number };
    expect(claims.exp - claims.iat).toBeGreaterThan(0);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(60);
    const img = await fetch(signed);
    expect(img.status).toBe(200);
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    // 화면의 선물 카드에 사진이 나온다(본인 화면)
    expect(await html(`/gifts/with/${HANDLE}`, "fanA")).toContain(`/api/gifts/photo/${orderNo}?v=1`);
  });

  it("INV-F2 S2 (실패경로): 다른 팬·크리에이터가 사진 주소를 열면 404, 로그인 안 함은 401 — 서명 주소를 받지 못한다", async () => {
    const orderNo = paidOrder(fanA.userId, A.creatorId, "now() - interval '1 day'");
    expect((await upload(orderNo, "fanA", await jpegWithGps(640, 480))).status).toBe(200);
    for (const who of ["fanB", "creator"] as const) {
      const res = await open(`/api/gifts/photo/${orderNo}`, who);
      expect(res.status, who).toBe(404);
      expect(res.headers.get("location"), who).toBeNull();
    }
    const anon = await open(`/api/gifts/photo/${orderNo}`, null);
    expect(anon.status).toBe(401);
    expect(anon.headers.get("location")).toBeNull();
  });

  it("INV-F2 (실패경로): 다른 팬은 남의 주문에 사진을 올리거나 지울 수 없고, 다른 사이트에서 온 요청은 거부된다", async () => {
    const orderNo = paidOrder(fanA.userId, A.creatorId, "now() - interval '1 day'");
    expect((await upload(orderNo, "fanB", await jpegWithGps(640, 480))).status).toBe(404);
    expect((await upload(orderNo, null, await jpegWithGps(640, 480))).status).toBe(401);
    const cross = await fetch(`${APP}/api/gifts/photo/${orderNo}`, {
      method: "DELETE",
      headers: { origin: "https://evil.example", cookie: await cookieOf("fanA") },
    });
    expect(cross.status).toBe(403);
    expect(await photoFiles(fanA.userId)).toEqual([]);
    expect((await upload(orderNo, "fanA", await jpegWithGps(640, 480))).status).toBe(200);
    const del = await fetch(`${APP}/api/gifts/photo/${orderNo}`, { method: "DELETE", headers: { origin: APP, cookie: await cookieOf("fanB") } });
    expect(del.status).toBe(404);
    expect(await photoFiles(fanA.userId)).toHaveLength(1);
    const own = await fetch(`${APP}/api/gifts/photo/${orderNo}`, { method: "DELETE", headers: { origin: APP, cookie: await cookieOf("fanA") } });
    expect(own.status).toBe(200);
    expect(await photoFiles(fanA.userId)).toEqual([]);
  });

  it("INV-F2: 사진은 크리에이터 화면에 나오지 않는다 — 받은 선물 목록 응답에 사진 주소가 없다", async () => {
    const [box] = giftBoxes(fanA.userId, A.creatorId, 1);
    expect((await upload(box!.orderNo, "fanA", await jpegWithGps(640, 480))).status).toBe(200);
    const creatorClient = await signedInClient(A.login);
    const r = await creatorClient.rpc("my_received_boxes");
    expect(r.error).toBeNull();
    expect(JSON.stringify(r.data)).not.toMatch(/gift-photos|photo/);
    const page = await html("/creator/requests", "creator");
    expect(page).not.toContain("/api/gifts/photo/");
  });
});
