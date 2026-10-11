import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseTogetherGifts, parseTogetherSummaries } from "@/entities/together/api/together-reads";
import { specialMoments } from "@/entities/together/model/special-moment";
import { removeGiftPhoto, saveGiftPhoto, signGiftPhoto } from "@/features/gift-photo/model/save-gift-photo";
import { linkClient, resetLink, verifyCreator } from "./creator-link-helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";
import { FAN_X, FAN_Y, giftBoxes, resetReplySettings } from "./gift-reply-helpers";
import { adminClient, anonClient, deleteTestOrders, psql, psqlError } from "./helpers";
import { clearGiftPhotos, GIFT_PHOTO_BUCKET, jpegWithGps, kstDateDaysAgo, kstDaysAgoAt, orderIdOf, paidOrder, photoFiles } from "./together-helpers";

// 함께한 시간 — DB 읽기 함수·사진 저장 (docs/specs/together.md INV-F1·F2·F3·F4·F6).
// 읽기는 시험 계정의 로그인 클라이언트로 실제 함수를 부른다. 사진은 서버의 사진 저장 경로(saveGiftPhoto)를 실제 저장소로 돌리고,
// 저장된 파일을 서버 키로 내려받아 사진 정보가 남았는지 연다.

const A = CV.haru;
const B = CV.summer;
const IDS = [A, B].map((c) => `'${c.creatorId}'`).join(", ");

async function rpcOk<T>(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await client.rpc(fn, args);
  if (r.error) throw new Error(`${fn} 실패: ${r.error.code} ${r.error.message}`);
  return r.data as T;
}

async function summaryOf(login: string, creatorId: string | null) {
  return parseTogetherSummaries(await rpcOk(await linkClient(login), "my_together", { p_creator_id: creatorId }));
}

async function giftsOf(login: string, creatorId: string) {
  return parseTogetherGifts(await rpcOk(await linkClient(login), "my_together_gifts", { p_creator_id: creatorId }));
}

async function reply(boxId: string, phrase = "thanks"): Promise<void> {
  await rpcOk(await linkClient(A.login), "confirm_gift_box", { p_box_id: boxId, p_phrase: phrase, p_line: null });
}

function viewerOf(f: { id: string }) {
  return { userId: f.id, role: "fan" as const };
}

async function photoDeps(login: string, f: { id: string }) {
  return { admin: adminClient(), client: await linkClient(login), viewer: viewerOf(f) };
}

function jpegBlob(buf: Buffer): Blob {
  return new Blob([new Uint8Array(buf)], { type: "image/jpeg" });
}

beforeAll(() => {
  createCvAccounts();
}, 60_000);
beforeEach(async () => {
  deleteTestOrders();
  resetCv();
  resetLink();
  resetReplySettings(IDS);
  await clearGiftPhotos([FAN_X.id, FAN_Y.id]);
  verifyCreator(A.creatorId, "cvt-tg-a");
  verifyCreator(B.creatorId, "cvt-tg-b");
});
afterAll(async () => {
  deleteTestOrders();
  resetLink();
  await clearGiftPhotos([FAN_X.id, FAN_Y.id]);
  dropCvAccounts();
});

describe("개인 기록 숫자 (INV-F3)", () => {
  it("INV-F3 S3: 결제 3·결제 대기 1·취소 1·거절 1, 답장 2(지운 답장 1 더) → 함께한 선물 4·받은 답장 2", async () => {
    const shipped = [giftBoxes(FAN_X.id, A.creatorId, 1)[0]!, giftBoxes(FAN_X.id, A.creatorId, 1)[0]!, giftBoxes(FAN_X.id, A.creatorId, 1)[0]!];
    insertPending();
    const canceled = paidOrder(FAN_X.id, A.creatorId, "now() - interval '3 days'", "canceled");
    paidOrder(FAN_X.id, A.creatorId, "now() - interval '2 days'", "rejected");
    await reply(shipped[0]!.boxId, "thanks");
    await reply(shipped[1]!.boxId, "love_it");
    await reply(shipped[2]!.boxId, "touched");
    await rpcOk(await linkClient(A.login), "delete_gift_reply", { p_box_id: shipped[2]!.boxId });
    // 취소된 주문의 상자에 남은 답장 줄 — 세지 않는다(그 주문은 함께한 선물이 아니다)
    psql(
      `begin; set local session_replication_role = replica;
       with b as (insert into public.boxes (order_id, seq, declared_tier, price_krw, shipping_fee_krw, inspection_fee_krw)
                  select id, 1, 'small', 6900, 4000, 2900 from public.orders where order_no = '${canceled}' returning id, order_id)
       insert into public.gift_replies (box_id, order_id, phrase, replied_at) select id, order_id, 'thanks', now() from b;
       commit;`,
    );
    // 다른 팬이 같은 크리에이터에게, 같은 팬이 다른 크리에이터에게 보낸 주문은 섞이지 않는다
    paidOrder(FAN_Y.id, A.creatorId, "now() - interval '1 day'");
    paidOrder(FAN_X.id, B.creatorId, "now() - interval '1 day'");

    const [s] = await summaryOf(FAN_X.login, A.creatorId);
    expect(s).toMatchObject({ creatorId: A.creatorId, creatorName: A.name, giftCount: 4, replyCount: 2 });
    expect((await giftsOf(FAN_X.login, A.creatorId)).length).toBe(4);
  });

  function insertPending(): void {
    // 결제 대기 — 등록 시각이 없다(결제가 끝나지 않았다)
    paidOrderRaw(FAN_X.id, A.creatorId);
  }
  function paidOrderRaw(fanId: string, creatorId: string): void {
    psql(
      `begin; set local session_replication_role = replica;
       insert into public.orders (order_no, fan_id, creator_id, item_kind, has_electronics_or_metal, status, registered_at)
       values ('FC-TGP${Date.now().toString(36).toUpperCase().slice(-5)}', '${fanId}', '${creatorId}', '시험 선물', false, 'pending_payment', null);
       commit;`,
    );
  }

  it("INV-F3: 처음 선물한 날은 한국 시간 날짜다 — 한국 시간 00:30 주문은 그날이고(UTC 로 자르면 전날), 그날이 1일째다", async () => {
    paidOrder(FAN_X.id, A.creatorId, kstDaysAgoAt(10, "00:30"));
    paidOrder(FAN_X.id, A.creatorId, kstDaysAgoAt(3, "13:00"));
    const [s] = await summaryOf(FAN_X.login, A.creatorId);
    expect(s!.firstGiftOn).toBe(kstDateDaysAgo(10));
    expect(s!.dayCount).toBe(11);
    const gifts = await giftsOf(FAN_X.login, A.creatorId);
    expect(gifts.map((g) => g.registeredOn).sort()).toEqual([kstDateDaysAgo(10), kstDateDaysAgo(3)]);
  });

  it("INV-F3 (실패경로): 결제 대기·취소만 있으면 기록이 없다 — 크리에이터 줄 자체가 없다", async () => {
    paidOrder(FAN_X.id, A.creatorId, "now() - interval '1 day'", "canceled");
    psql(
      `begin; set local session_replication_role = replica;
       insert into public.orders (order_no, fan_id, creator_id, item_kind, has_electronics_or_metal, status, registered_at)
       values ('FC-TGQ${Date.now().toString(36).toUpperCase().slice(-5)}', '${FAN_X.id}', '${A.creatorId}', '시험 선물', false, 'rejected', null);
       commit;`,
    );
    expect(await summaryOf(FAN_X.login, A.creatorId)).toEqual([]);
    expect(await giftsOf(FAN_X.login, A.creatorId)).toEqual([]);
  });

  it("INV-F3: 크리에이터를 주지 않으면 내가 선물한 크리에이터마다 한 줄 — 최근에 선물한 크리에이터가 먼저", async () => {
    paidOrder(FAN_X.id, A.creatorId, "now() - interval '5 days'");
    paidOrder(FAN_X.id, B.creatorId, "now() - interval '1 day'");
    paidOrder(FAN_X.id, B.creatorId, "now() - interval '2 days'");
    const rows = (await summaryOf(FAN_X.login, null)).filter((r) => r.creatorId === A.creatorId || r.creatorId === B.creatorId);
    expect(rows.map((r) => [r.creatorId, r.giftCount])).toEqual([
      [B.creatorId, 2],
      [A.creatorId, 1],
    ]);
  });
});

describe("본인만 (INV-F1)", () => {
  it("INV-F1 S1 (실패경로): 다른 팬·그 크리에이터가 같은 크리에이터로 읽으면 빈 결과, 로그인 안 함은 거부", async () => {
    paidOrder(FAN_X.id, A.creatorId, "now() - interval '2 days'");
    expect((await summaryOf(FAN_X.login, A.creatorId)).length).toBe(1);
    expect(await summaryOf(FAN_Y.login, A.creatorId)).toEqual([]);
    expect(await giftsOf(FAN_Y.login, A.creatorId)).toEqual([]);
    expect(await summaryOf(A.login, A.creatorId)).toEqual([]);
    expect(await giftsOf(A.login, A.creatorId)).toEqual([]);
    for (const fn of ["my_together", "my_together_gifts"]) {
      const r = await anonClient().rpc(fn, { p_creator_id: A.creatorId });
      expect(r.error, fn).not.toBeNull();
      expect(r.data ?? []).toEqual([]);
    }
  });

  it("INV-F1 (실패경로): 함수는 팬 ID 를 인자로 받지 않는다 — 남의 ID 를 실어 보낼 칸이 없다", () => {
    const args = psql(
      `select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ',' order by p.proname)
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('my_together', 'my_together_gifts', 'my_gift_photo')`,
    );
    expect(args).toBe("my_gift_photo(p_order_no text),my_together(p_creator_id uuid),my_together_gifts(p_creator_id uuid)");
  });
});

describe("특별 카드 (INV-F4)", () => {
  it("INV-F4 S4: 선물 10개 — 순번은 결제한 순서대로 1~10, 화면 계산으로 10번째만 특별하다", async () => {
    for (let i = 10; i >= 1; i--) paidOrder(FAN_X.id, A.creatorId, `now() - interval '${i} days'`);
    // 취소된 주문은 순번에 끼지 않는다
    paidOrder(FAN_X.id, A.creatorId, "now() - interval '11 days'", "canceled");
    const gifts = await giftsOf(FAN_X.login, A.creatorId);
    expect(gifts.map((g) => g.giftNo)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    const [s] = await summaryOf(FAN_X.login, A.creatorId);
    expect([...specialMoments(gifts, s!.firstGiftOn).entries()]).toEqual([[10, "tenth"]]);
  });

  it("INV-F4 S4 (실패경로): 공유 카드 재료에는 순번·횟수 칸이 없다", () => {
    const cols = psql(`select pg_get_function_result('public.my_gift_reply_card(uuid)'::regprocedure)`);
    expect(cols).not.toMatch(/gift_no|seq|count|_no\b/);
    expect(cols).toMatch(/phrase/);
  });
});

describe("화면 응답에 금액·시각 없음 (INV-F6)", () => {
  it("INV-F6 S6 (실패경로): 읽기 함수가 돌려주는 칸에 금액·시각 칸이 없다 — 날짜는 date 로만", () => {
    for (const fn of ["my_together(uuid)", "my_together_gifts(uuid)"]) {
      const cols = psql(`select pg_get_function_result('public.${fn}'::regprocedure)`);
      expect(cols, fn).not.toMatch(/timestamp|time with|krw|price|amount|fee/i);
      expect(cols, fn).toMatch(/ date/);
    }
  });

  it("INV-F6 S6: 실제 응답의 칸 이름이 정해진 것뿐이다", async () => {
    paidOrder(FAN_X.id, A.creatorId, "now() - interval '1 day'");
    const client = await linkClient(FAN_X.login);
    const [s] = await rpcOk<Record<string, unknown>[]>(client, "my_together", { p_creator_id: A.creatorId });
    const [g] = await rpcOk<Record<string, unknown>[]>(client, "my_together_gifts", { p_creator_id: A.creatorId });
    expect(Object.keys(s!).sort()).toEqual(
      ["creator_handle", "creator_id", "creator_name", "creator_photo_path", "day_count", "first_gift_on", "gift_count", "reply_count"].sort(),
    );
    expect(Object.keys(g!).sort()).toEqual(
      ["anniversary_name", "approved", "box_count", "gift_no", "has_photo", "item_category", "item_kind", "order_no", "outcome", "photo_version", "registered_on", "shipped_on", "stage"].sort(),
    );
  });
});

describe("팬이 올린 선물 사진 (INV-F2)", () => {
  it("INV-F2 S2b: 위치 정보가 든 사진을 올리면 저장된 파일은 사진 정보 없는 webp(긴 변 1280)이고, 원본은 어디에도 없다", async () => {
    const orderNo = paidOrder(FAN_X.id, A.creatorId, "now() - interval '1 day'");
    const r = await saveGiftPhoto(await photoDeps(FAN_X.login, FAN_X), orderNo, jpegBlob(await jpegWithGps()));
    expect(r).toEqual({ ok: true, version: 1 });
    const files = await photoFiles(FAN_X.id);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(new RegExp(`^${FAN_X.id}/${orderIdOf(orderNo)}/[0-9a-f-]{36}\\.webp$`));
    const dl = await adminClient().storage.from(GIFT_PHOTO_BUCKET).download(files[0]!);
    const bytes = Buffer.from(await dl.data!.arrayBuffer());
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([1280, 960]);
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(bytes.includes(Buffer.from("FankkukTestCam"))).toBe(false);
    expect(bytes.includes(Buffer.from("GPS"))).toBe(false);
    const [g] = await giftsOf(FAN_X.login, A.creatorId);
    expect(g!.photo).toEqual({ version: 1 });
  });

  it("INV-F2: 주문당 한 장 — 바꾸면 옛 파일이 지워지고 판이 올라가며, 지우면 파일과 기록이 모두 없어진다", async () => {
    const orderNo = paidOrder(FAN_X.id, A.creatorId, "now() - interval '1 day'");
    const deps = await photoDeps(FAN_X.login, FAN_X);
    await saveGiftPhoto(deps, orderNo, jpegBlob(await jpegWithGps(800, 600)));
    const first = await photoFiles(FAN_X.id);
    expect(await saveGiftPhoto(deps, orderNo, jpegBlob(await jpegWithGps(900, 1200)))).toEqual({ ok: true, version: 2 });
    const second = await photoFiles(FAN_X.id);
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(first[0]);
    // 작은 사진은 키우지 않는다
    const meta = await sharp(Buffer.from(await (await adminClient().storage.from(GIFT_PHOTO_BUCKET).download(second[0]!)).data!.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([900, 1200]);
    expect(await removeGiftPhoto(deps, orderNo)).toEqual({ ok: true, version: null });
    expect(await photoFiles(FAN_X.id)).toEqual([]);
    expect(psql(`select count(*) from public.gift_photos where order_id = '${orderIdOf(orderNo)}'`)).toBe("0");
  });

  it("INV-F2 (실패경로): 다른 팬·크리에이터는 남의 주문에 사진을 올리거나 지우거나 서명 주소를 받을 수 없다", async () => {
    const orderNo = paidOrder(FAN_X.id, A.creatorId, "now() - interval '1 day'");
    await saveGiftPhoto(await photoDeps(FAN_X.login, FAN_X), orderNo, jpegBlob(await jpegWithGps(640, 480)));
    const y = await photoDeps(FAN_Y.login, FAN_Y);
    expect(await saveGiftPhoto(y, orderNo, jpegBlob(await jpegWithGps(640, 480)))).toMatchObject({ ok: false, status: 404 });
    expect(await removeGiftPhoto(y, orderNo)).toMatchObject({ ok: false, status: 404 });
    expect(await signGiftPhoto(y, orderNo)).toEqual({ ok: false, status: 404 });
    const creator = { admin: adminClient(), client: await linkClient(A.login), viewer: { userId: A.id, role: "creator" as const } };
    expect(await signGiftPhoto(creator, orderNo)).toEqual({ ok: false, status: 404 });
    expect(await photoFiles(FAN_X.id)).toHaveLength(1);
    expect(psql(`select version from public.gift_photos where order_id = '${orderIdOf(orderNo)}'`)).toBe("1");
  });

  it("INV-F2 (실패경로): 로그인하지 않았으면 401, 취소된 주문·없는 주문은 404", async () => {
    const canceled = paidOrder(FAN_X.id, A.creatorId, "now() - interval '1 day'", "canceled");
    const deps = await photoDeps(FAN_X.login, FAN_X);
    const blob = jpegBlob(await jpegWithGps(640, 480));
    expect(await saveGiftPhoto({ ...deps, viewer: null }, canceled, blob)).toMatchObject({ ok: false, status: 401 });
    expect(await saveGiftPhoto(deps, canceled, blob)).toMatchObject({ ok: false, status: 404 });
    expect(await saveGiftPhoto(deps, "FC-NOPE99", blob)).toMatchObject({ ok: false, status: 404 });
    expect(await photoFiles(FAN_X.id)).toEqual([]);
  });

  it("INV-F2 (실패경로): 이미지가 아니거나 그림이 너무 크면 저장하지 않는다", async () => {
    const orderNo = paidOrder(FAN_X.id, A.creatorId, "now() - interval '1 day'");
    const deps = await photoDeps(FAN_X.login, FAN_X);
    expect(await saveGiftPhoto(deps, orderNo, new Blob([new TextEncoder().encode("not an image")], { type: "image/jpeg" }))).toMatchObject({ ok: false, status: 400 });
    // 4천만 화소를 넘는 그림(가로 10000 × 세로 4001) — 압축하면 작지만 열어 보면 크다
    const huge = await sharp({ create: { width: 10000, height: 4001, channels: 3, background: "#ffffff" } }).png({ compressionLevel: 9 }).toBuffer();
    expect(await saveGiftPhoto(deps, orderNo, new Blob([new Uint8Array(huge)], { type: "image/png" }))).toMatchObject({ ok: false, status: 400 });
    // gif 는 받지 않는다
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#ffffff" } }).gif().toBuffer();
    expect(await saveGiftPhoto(deps, orderNo, new Blob([new Uint8Array(gif)], { type: "image/gif" }))).toMatchObject({ ok: false, status: 400 });
    expect(await photoFiles(FAN_X.id)).toEqual([]);
  });

  it("INV-F2 S2 (실패경로): 저장소 주소로 바로 열면 거부된다 — 크리에이터·다른 팬·올린 팬 본인 토큰·로그인 안 함·공개 주소 모두", async () => {
    const orderNo = paidOrder(FAN_X.id, A.creatorId, "now() - interval '1 day'");
    await saveGiftPhoto(await photoDeps(FAN_X.login, FAN_X), orderNo, jpegBlob(await jpegWithGps(640, 480)));
    const [path] = await photoFiles(FAN_X.id);
    for (const login of [A.login, FAN_Y.login, FAN_X.login]) {
      const c = await linkClient(login);
      const dl = await c.storage.from(GIFT_PHOTO_BUCKET).download(path!);
      expect(dl.error, login).not.toBeNull();
      const signed = await c.storage.from(GIFT_PHOTO_BUCKET).createSignedUrl(path!, 60);
      expect(signed.error, login).not.toBeNull();
    }
    expect((await anonClient().storage.from(GIFT_PHOTO_BUCKET).download(path!)).error).not.toBeNull();
    const pub = await fetch(anonClient().storage.from(GIFT_PHOTO_BUCKET).getPublicUrl(path!).data.publicUrl);
    expect(pub.status).not.toBe(200);
    // 서버가 만든 짧은 서명 주소는 열린다(본인에게 주는 길)
    const own = await signGiftPhoto(await photoDeps(FAN_X.login, FAN_X), orderNo);
    expect(own.ok).toBe(true);
    if (own.ok) {
      const res = await fetch(own.url);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/webp");
    }
  });

  it("INV-F2 (실패경로): 화면 쪽 키로는 저장소에 올리거나 사진 기록을 쓸 수 없다 — 쓰기는 서버만", async () => {
    const orderNo = paidOrder(FAN_X.id, A.creatorId, "now() - interval '1 day'");
    const x = await linkClient(FAN_X.login);
    const up = await x.storage.from(GIFT_PHOTO_BUCKET).upload(`${FAN_X.id}/${orderIdOf(orderNo)}/x.webp`, new Uint8Array([1, 2, 3]), { contentType: "image/webp" });
    expect(up.error).not.toBeNull();
    const set = await x.rpc("set_gift_photo", { p_order_id: orderIdOf(orderNo), p_path: `${FAN_X.id}/${orderIdOf(orderNo)}/00000000-0000-4000-8000-000000000000.webp` });
    expect(set.error).not.toBeNull();
    expect(psqlError(`set role authenticated; select * from public.gift_photos`)).not.toBeNull();
    expect(psql(`select count(*) from public.gift_photos`)).toBe("0");
    // 저장소 버킷은 비공개다
    expect(psql(`select public from storage.buckets where id = '${GIFT_PHOTO_BUCKET}'`)).toBe("f");
  });

  it("INV-F2 (실패경로): 서버 기록 함수도 그 주문의 팬·주문 폴더가 아닌 경로는 받지 않는다", () => {
    const orderNo = paidOrder(FAN_X.id, A.creatorId, "now() - interval '1 day'");
    const other = paidOrder(FAN_Y.id, A.creatorId, "now() - interval '1 day'");
    const id = orderIdOf(orderNo);
    const err = psqlError(`select public.set_gift_photo('${id}', '${FAN_Y.id}/${orderIdOf(other)}/00000000-0000-4000-8000-000000000000.webp')`);
    expect(err).not.toBeNull();
    expect(psql(`select count(*) from public.gift_photos`)).toBe("0");
  });
});
