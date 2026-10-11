import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPhotos, linkClient, resetLink, verifyCreator } from "./creator-link-helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";
import { FAN_X, FAN_Y, giftBoxes, kstTodayAt, resetReplySettings } from "./gift-reply-helpers";
import { anonClient, deleteTestOrders, psql } from "./helpers";

// 답장 공유 카드 라우트 (docs/specs/gift-reply.md INV-G9 S9, INV-G4·G6 의 카드 쪽).
// 라우트 함수(GET /api/gifts/reply-card/{상자 ID})를 직접 부른다. 요청한 사람의 세션만 시험 계정의 로그인 클라이언트로 바꾸고
// (로그인 안 함 = 로그인 안 한 클라이언트), 주인 확인·답장 읽기는 로컬 DB 에 실제로 한다. 그림 그리기(next/og)는 진짜를 쓰되,
// 라우트가 그리라고 넘긴 화면 조각을 옆에서 받아 글자로 펼친다 — PNG 에서 글자를 읽을 수 없어서다.
// 로그인 안 한 요청은 떠 있는 개발 서버(기본 http://localhost:3000, FK_TEST_APP_URL)에도 실제 HTTP 로 보내 본다.

const captured = vi.hoisted(() => ({ shots: [] as unknown[], client: null as SupabaseClient | null }));

vi.mock("next/og", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/og")>();
  class CapturingImageResponse extends actual.ImageResponse {
    constructor(...args: ConstructorParameters<typeof actual.ImageResponse>) {
      super(...args);
      captured.shots.push(args[0]);
    }
  }
  return { ...actual, ImageResponse: CapturingImageResponse };
});
vi.mock("@/shared/api/supabase/detached", () => ({
  createPublicReadSupabase: () => anonClient(),
  readPublicStorageBase: () => process.env.FK_TEST_API_URL ?? "",
}));
vi.mock("@/shared/api/supabase/server", () => ({
  createRequestSupabase: async () => captured.client ?? anonClient(),
}));

const { GET } = await import("@/app/api/gifts/reply-card/[boxId]/route");

const APP = process.env.FK_TEST_APP_URL ?? "http://localhost:3000";
const A = CV.haru;
const B = CV.summer;
const IDS = [A, B].map((c) => `'${c.creatorId}'`).join(", ");
const LINE = "손편지 읽고 한참 웃었어요";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** login 이 null 이면 로그인 안 한 요청. */
async function card(login: string | null, boxId: string, query = "size=square"): Promise<Response> {
  captured.client = login ? await linkClient(login) : null;
  return GET(new Request(`http://app.test/api/gifts/reply-card/${boxId}?${query}`), { params: Promise.resolve({ boxId }) });
}

/** 라우트가 마지막으로 그리라고 넘긴 화면 조각의 글자 — 사진·로고(img)는 뺀다. */
function lastDrawnText(): string {
  const element = captured.shots.at(-1);
  if (!isValidElement(element)) throw new Error("라우트가 화면 조각을 넘기지 않았다");
  return renderToStaticMarkup(element as ReactElement)
    .replace(/<img[^>]*>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function replyWith(login: string, boxId: string, phrase: string, line: string | null): Promise<void> {
  const r = await (await linkClient(login)).rpc("confirm_gift_box", { p_box_id: boxId, p_phrase: phrase, p_line: line });
  if (r.error) throw new Error(`답장 실패: ${r.error.code}`);
}

beforeAll(() => {
  createCvAccounts();
}, 60_000);
beforeEach(async () => {
  deleteTestOrders();
  resetCv();
  resetLink();
  await clearPhotos();
  resetReplySettings(IDS);
  verifyCreator(A.creatorId, "cvt-card-a");
  verifyCreator(B.creatorId, "cvt-card-b");
  captured.shots.length = 0;
  captured.client = null;
});
afterAll(async () => {
  deleteTestOrders();
  resetReplySettings(IDS);
  resetLink();
  await clearPhotos();
  dropCvAccounts();
});

describe("INV-G9: 공유 카드는 그 선물을 보낸 팬 본인만", () => {
  it("INV-G9 S9 (실패경로): 로그인 없이 부르면 401 이고 그리지 않는다 — 개발 서버에 실제 HTTP 로 보내도 401", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    await replyWith(A.login, box.boxId, "touched", LINE);
    const res = await card(null, box.boxId);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(captured.shots).toEqual([]);
    let http: Response;
    try {
      http = await fetch(`${APP}/api/gifts/reply-card/${box.boxId}?size=square`, { redirect: "manual" });
    } catch {
      throw new Error(`개발 서버(${APP})가 떠 있어야 한다 — npm run dev 로 띄운 뒤 실행한다`);
    }
    expect(http.status).toBe(401);
  });

  it("INV-G9 S9 (실패경로): 다른 팬·그 선물을 받은 크리에이터가 부르면 404 이고 그리지 않는다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    await replyWith(A.login, box.boxId, "touched", LINE);
    expect((await card(FAN_Y.login, box.boxId)).status).toBe(404);
    expect((await card(A.login, box.boxId)).status).toBe(404);
    expect(captured.shots).toEqual([]);
  });

  it("INV-G9: 보낸 팬 본인이 부르면 200 PNG 이미지 — 그려지는 글자는 크리에이터 이름·답장 문구·한 줄·날짜·팬꾹뿐(주문번호·물품·닉네임 없음)", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    await replyWith(A.login, box.boxId, "touched", LINE);
    psql(`begin; set local session_replication_role = replica; update public.gift_replies set replied_at = ${kstTodayAt("12:00")} where box_id = '${box.boxId}'; commit;`);
    const today = psql("select to_char(public.receiving_today(), 'YYYY.MM.DD')");
    for (const size of ["square", "wide"] as const) {
      const res = await card(FAN_X.login, box.boxId, `size=${size}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("cache-control")).toBe("no-store");
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect([...bytes.slice(0, 8)]).toEqual(PNG_SIGNATURE);
      // PNG 머리(IHDR)의 가로·세로 — 정사각 1080×1080 · X 용 가로 1200×675
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect([view.getUint32(16), view.getUint32(20)]).toEqual(size === "square" ? [1080, 1080] : [1200, 675]);
      const text = lastDrawnText();
      // 사진이 없으면 기본 이미지(이름 첫 글자) — 이름·문구·한 줄·날짜·로고 글자
      expect(text).toBe(
        size === "square"
          ? `${[...A.name][0]} ${A.name}님이 남긴 감사 답장 정성이 느껴져서 감동이에요 ${LINE} ${today} 팬꾹`
          : `${[...A.name][0]} ${A.name}님이 남긴 감사 답장 ${today} 팬꾹 정성이 느껴져서 감동이에요 ${LINE}`,
      );
      for (const bad of [box.orderNo, "시험 선물", FAN_X.nickname, FAN_X.login]) expect([bad, text.includes(bad)]).toEqual([bad, false]);
    }
  });

  it("INV-G9: 닉네임을 고르지 않으면 팬 닉네임이 그려지지 않고, 고르면(name=1) 「{닉네임}님께」가 그려진다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    await replyWith(A.login, box.boxId, "thanks", null);
    expect((await card(FAN_X.login, box.boxId, "size=square")).status).toBe(200);
    expect(lastDrawnText()).not.toContain(FAN_X.nickname);
    expect((await card(FAN_X.login, box.boxId, "size=square&name=0")).status).toBe(200);
    expect(lastDrawnText()).not.toContain(FAN_X.nickname);
    expect((await card(FAN_X.login, box.boxId, "size=wide&name=1")).status).toBe(200);
    expect(lastDrawnText()).toContain(`${FAN_X.nickname}님께`);
  });

  it("INV-G4: 크리에이터가 지운 답장의 카드는 보낸 팬에게도 404 이고 그리지 않는다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    await replyWith(A.login, box.boxId, "cheered", "지울 답장");
    expect((await card(FAN_X.login, box.boxId)).status).toBe(200);
    captured.shots.length = 0;
    expect((await (await linkClient(A.login)).rpc("delete_gift_reply", { p_box_id: box.boxId })).error).toBeNull();
    const res = await card(FAN_X.login, box.boxId);
    expect(res.status).toBe(404);
    expect(captured.shots).toEqual([]);
  });

  it("INV-G9 (실패경로): 상자 ID 꼴이 아니거나 모양이 정해진 둘이 아니면 400", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    await replyWith(A.login, box.boxId, "thanks", null);
    expect((await card(FAN_X.login, "not-a-box")).status).toBe(400);
    expect((await card(FAN_X.login, box.boxId, "size=story")).status).toBe(400);
    expect(captured.shots).toEqual([]);
  });
});
