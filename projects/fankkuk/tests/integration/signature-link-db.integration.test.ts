import { afterEach, describe, expect, it } from "vitest";
import { createTestAccount, device, removeTestAccounts, type TestAccount } from "./account-fixtures";
import { adminClient, anonClient, deleteTestOrders, followForTest, linkTestSignature, psql, SEED } from "./helpers";

// 승인 서명 연결하기 — approval-signature INV-S16 (S16·S16b·S16c) · creator-link INV-E15 (S15). manual/0027 이 적용돼 있어야 한다.
// 앱의 서명 창구 대신 같은 DB 함수를 서비스 키로 부른다 — 시험 창구(fake)는 저장된 원문을 그대로 돌려주므로 그 값을 넣는다.

const made: string[] = [];

afterEach(() => {
  deleteTestOrders();
  if (made.length) {
    const ids = made.map((i) => `'${i}'`).join(",");
    psql(
      `begin; delete from pii.signature_link_requests where creator_id in (${ids}); delete from pii.signature_links where creator_id in (${ids});
       set local session_replication_role = replica; delete from public.follows where creator_id in (${ids}); delete from public.creators where id in (${ids}); commit;`,
    );
  }
  made.length = 0;
  removeTestAccounts();
});

/** 채널 확인을 마친(확인됨) 크리에이터 — 승인 서명은 연결 전 */
async function newCreator(): Promise<{ account: TestAccount; creatorId: string }> {
  const account = await createTestAccount({ tag: `sl${Math.random().toString(36).slice(2, 8)}` });
  const creatorId = psql(
    `begin; set local session_replication_role = replica;
     update public.profiles set role = 'creator' where id = '${account.userId}';
     insert into public.creators (profile_id, slug, name, channel, identity_verified, searchable)
     values ('${account.userId}', '${account.loginId.replaceAll("_", "-")}', '시험연결', 'https://www.youtube.com/@itlink', true, true) returning id;
     commit;`,
  )
    .split("\n")
    .find((l) => /^[0-9a-f-]{36}$/.test(l))!;
  made.push(creatorId);
  return { account, creatorId };
}

function envelope(): Record<string, unknown> {
  const b64 = (n: number) => Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString("base64");
  return { v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: b64(256), iv: b64(12), ciphertext: b64(48) };
}

const ipHash = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");

async function start(actorId: string, env = envelope(), method = "fake", ip = ipHash()) {
  const r = await adminClient().rpc("start_signature_link", { p_actor_id: actorId, p_envelope: env, p_method: method, p_ip_hash: ip });
  if (r.error) throw new Error(`start_signature_link: ${r.error.message}`);
  return (r.data as { result: string; request_id: string | null; payload: string | null }[])[0]!;
}

async function settle(actorId: string, requestId: string, signed: string | null, outcome = "signed") {
  const r = await adminClient().rpc("settle_signature_link", { p_actor_id: actorId, p_request_id: requestId, p_outcome: outcome, p_signed_content: signed, p_method: "fake" });
  if (r.error) throw new Error(`settle_signature_link: ${r.error.message}`);
  return (r.data as { result: string; linked_at: string | null }[])[0]!;
}

async function orderTo(creatorId: string) {
  followForTest(SEED.fanId, creatorId);
  return adminClient().rpc("register_order", {
    p_fan_id: SEED.fanId,
    p_creator_id: creatorId,
    p_order_no: `FC-T${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    p_item_kind: "시험 선물",
    p_has_electronics_or_metal: false,
    p_tiers: ["small"],
    p_toss_order_id: `pay_test_${Math.random().toString(36).slice(2, 14)}`,
    p_goods_krw: 0,
    p_service_fee_krw: 1400,
    p_inspection_fee_krw: 1500,
    p_shipping_fee_krw: 4000,
    p_amount_krw: 6900,
  });
}

const linked = async (creatorId: string) => (await anonClient().rpc("creator_signature_linked", { p_creator: creatorId })).data;

describe("INV-S16: 승인 서명 연결", () => {
  it("INV-S16 S16: 시험 서명이 저장된 원문과 같으면 연결되고, DB 의 세 값은 봉투(암호문)뿐이다", async () => {
    const c = await newCreator();
    const env = envelope();
    const req = await start(c.account.userId, env);
    expect(req.result).toBe("started");
    expect(req.payload).toMatch(new RegExp(`^fankkuk-signature-link:v1\\|req=${req.request_id}\\|at=`));
    expect(await linked(c.creatorId)).toBe(false);
    const done = await settle(c.account.userId, req.request_id!, req.payload);
    expect(done.result).toBe("linked");
    expect(await linked(c.creatorId)).toBe(true);
    // 저장된 것은 봉투 그대로 + 방식 + 때 — 평문 칸이 없다
    expect(psql(`select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'pii' and table_name = 'signature_links'`)).toBe(
      "creator_id,envelope,linked_at,method",
    );
    expect(JSON.parse(psql(`select envelope::text from pii.signature_links where creator_id = '${c.creatorId}'`))).toEqual(env);
    expect(psql(`select method from pii.signature_links where creator_id = '${c.creatorId}'`)).toBe("fake");
    // 같은 결과가 다시 와도 처음 결과 그대로
    expect((await settle(c.account.userId, req.request_id!, req.payload)).result).toBe("linked");
  });

  it("INV-S16: 본인 읽기는 연결 여부와 연결한 때만 — 봉투·방식은 나오지 않는다. 공개 읽기는 참/거짓 하나", async () => {
    const c = await newCreator();
    const req = await start(c.account.userId);
    await settle(c.account.userId, req.request_id!, req.payload);
    const me = await device(c.account.loginEmail);
    const mine = await me.rpc("my_signature_link");
    expect(mine.error).toBeNull();
    const row = (mine.data as Record<string, unknown>[])[0]!;
    expect(Object.keys(row).sort()).toEqual(["linked", "linked_at"]);
    expect(row.linked).toBe(true);
    expect(await linked(c.creatorId)).toBe(true);
    // 화면 쪽 키로는 연결 요청·결과 함수를 부를 수 없다
    expect((await me.rpc("start_signature_link", { p_actor_id: c.account.userId, p_envelope: envelope(), p_method: "fake", p_ip_hash: ipHash() })).error).not.toBeNull();
    expect((await anonClient().rpc("settle_signature_link", { p_actor_id: c.account.userId, p_request_id: req.request_id, p_outcome: "signed", p_signed_content: req.payload, p_method: "fake" })).error).not.toBeNull();
  });

  it("INV-S16 S16c (실패경로): 원문이 다르면·창구가 실패로 답하면·10분이 지나면 연결되지 않는다", async () => {
    const c = await newCreator();
    const a = await start(c.account.userId);
    expect((await settle(c.account.userId, a.request_id!, `${a.payload}x`)).result).toBe("failed");
    // 실패한 요청은 맞는 원문이 와도 되살아나지 않는다
    expect((await settle(c.account.userId, a.request_id!, a.payload)).result).toBe("failed");
    const b = await start(c.account.userId);
    expect((await settle(c.account.userId, b.request_id!, null, "failed")).result).toBe("failed");
    const d = await start(c.account.userId);
    psql(`update pii.signature_link_requests set requested_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute' where id = '${d.request_id}'`);
    expect((await settle(c.account.userId, d.request_id!, d.payload)).result).toBe("expired");
    expect(await linked(c.creatorId)).toBe(false);
  });

  it("INV-S16 S16c (실패경로): 남의 요청에 서명을 붙이거나 앞 요청을 새 요청 뒤에 끝내도 연결되지 않는다", async () => {
    const c = await newCreator();
    const other = await newCreator();
    const req = await start(c.account.userId);
    expect((await settle(other.account.userId, req.request_id!, req.payload)).result).toBe("not_found");
    const next = await start(c.account.userId);
    expect((await settle(c.account.userId, req.request_id!, req.payload)).result).toBe("failed");
    expect((await settle(c.account.userId, next.request_id!, next.payload)).result).toBe("linked");
    expect(await linked(other.creatorId)).toBe(false);
  });

  it("INV-S16 (실패경로): 봉인 형식이 아닌 값(평문 이름·번호)은 거부, 팬은 not_creator", async () => {
    const c = await newCreator();
    const plain = await adminClient().rpc("start_signature_link", {
      p_actor_id: c.account.userId,
      p_envelope: { name: "정재원", birth: "19900115", phone: "01012345678" },
      p_method: "fake",
      p_ip_hash: ipHash(),
    });
    expect(plain.error?.code).toBe("22023");
    expect((await start(SEED.fanId)).result).toBe("not_creator");
    expect(psql(`select count(*) from pii.signature_link_requests where creator_id = '${c.creatorId}'`)).toBe("0");
  });

  it("INV-S16 (실패경로): 한 시간에 다섯 번까지 — 여섯 번째는 too_many", async () => {
    const c = await newCreator();
    for (let i = 0; i < 5; i++) expect((await start(c.account.userId)).result).toBe("started");
    expect((await start(c.account.userId)).result).toBe("too_many");
  });

  it("INV-S16 (실패경로): 한 시간이 지났어도 하루 다섯 번을 넘으면 too_many_day (한국 시간 0시 직후 1시간 안에는 이 시험이 hour 한도에 걸릴 수 있다)", async () => {
    const c = await newCreator();
    for (let i = 0; i < 5; i++) expect((await start(c.account.userId)).result).toBe("started");
    psql(
      `update pii.signature_link_requests set requested_at = greatest(date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul', now() - interval '61 minutes'), expires_at = greatest(date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul', now() - interval '61 minutes') + interval '10 minutes' where creator_id = '${c.creatorId}'`,
    );
    expect((await start(c.account.userId)).result).toBe("too_many_day");
  });

  it("INV-S16 (실패경로): 같은 접속 주소는 크리에이터가 달라도 하루 스무 번까지 — 스물한 번째는 too_many_day, 다른 주소는 받는다", async () => {
    const ip = ipHash();
    const creators = [await newCreator(), await newCreator(), await newCreator(), await newCreator(), await newCreator()];
    for (const c of creators.slice(0, 4)) for (let i = 0; i < 5; i++) expect((await start(c.account.userId, envelope(), "fake", ip)).result).toBe("started");
    expect((await start(creators[4]!.account.userId, envelope(), "fake", ip)).result).toBe("too_many_day");
    expect((await start(creators[4]!.account.userId)).result).toBe("started");
    // 접속 주소는 해시 꼴만 받는다
    const raw = await adminClient().rpc("start_signature_link", { p_actor_id: creators[4]!.account.userId, p_envelope: envelope(), p_method: "fake", p_ip_hash: "127.0.0.1" });
    expect(raw.error?.code).toBe("22023");
  });

  it("INV-S16: 본인 대기 요청 읽기 — 기한 안의 가장 새 요청 ID 와 기한만, 남의 것·끝난 것은 없다", async () => {
    const c = await newCreator();
    const other = await newCreator();
    const me = await device(c.account.loginEmail);
    const none = await me.rpc("my_pending_signature_link");
    expect(none.error).toBeNull();
    expect(none.data).toEqual([]);
    await start(c.account.userId);
    const b = await start(c.account.userId);
    await start(other.account.userId);
    const rows = (await me.rpc("my_pending_signature_link")).data as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(["expires_at", "request_id"]);
    expect(rows[0]!.request_id).toBe(b.request_id);
    await settle(c.account.userId, b.request_id!, b.payload);
    expect((await me.rpc("my_pending_signature_link")).data).toEqual([]);
    expect((await anonClient().rpc("my_pending_signature_link")).data ?? []).toEqual([]);
  });

  it("INV-S16: 다시 연결하면 새 서명이 검증될 때까지 전 연결 그대로, 검증되면 새 봉투로 바뀐다", async () => {
    const c = await newCreator();
    const first = envelope();
    const a = await start(c.account.userId, first);
    await settle(c.account.userId, a.request_id!, a.payload);
    const second = envelope();
    const b = await start(c.account.userId, second);
    expect(JSON.parse(psql(`select envelope::text from pii.signature_links where creator_id = '${c.creatorId}'`))).toEqual(first);
    await settle(c.account.userId, b.request_id!, b.payload);
    expect(JSON.parse(psql(`select envelope::text from pii.signature_links where creator_id = '${c.creatorId}'`))).toEqual(second);
  });
});

describe("INV-S16 S16b: 연결 전 크리에이터 앞 주문 거부", () => {
  it("INV-S16 S16b (실패경로): 연결 전이면 주문 생성 함수가 FKS16 으로 거부, 주문이 생기지 않는다", async () => {
    const c = await newCreator();
    const r = await orderTo(c.creatorId);
    expect(r.error?.code).toBe("FKS16");
    expect(psql(`select count(*) from public.orders where creator_id = '${c.creatorId}'`)).toBe("0");
  });

  it("INV-S16 S16b: 연결하면 주문이 들어간다", async () => {
    const c = await newCreator();
    const req = await start(c.account.userId);
    await settle(c.account.userId, req.request_id!, req.payload);
    expect((await orderTo(c.creatorId)).error).toBeNull();
  });

  it("INV-S16: 시드 크리에이터는 시험 서명(fake)으로 연결된 채 시작한다", () => {
    expect(psql(`select method from pii.signature_links where creator_id = '${SEED.haruCreatorId}'`)).toBe("fake");
  });

  it("INV-S16 (실패경로): 테스트 도우미로 연결한 줄을 지우면 다시 거부된다(트리거가 표를 실제로 본다)", async () => {
    const c = await newCreator();
    linkTestSignature(c.creatorId);
    expect((await orderTo(c.creatorId)).error).toBeNull();
    deleteTestOrders();
    psql(`delete from pii.signature_links where creator_id = '${c.creatorId}'`);
    expect((await orderTo(c.creatorId)).error?.code).toBe("FKS16");
  });
});

describe("INV-S16·INV-S15: 탈퇴하면 연결 정보를 지운다", () => {
  it("INV-S16 (실패경로): 크리에이터가 탈퇴로 표시되면 연결 봉투와 요청 줄이 같은 처리에서 사라진다", async () => {
    const c = await newCreator();
    const req = await start(c.account.userId);
    await settle(c.account.userId, req.request_id!, req.payload);
    await start(c.account.userId);
    psql(`update public.creators set withdrawn_at = now() where id = '${c.creatorId}'`);
    expect(psql(`select count(*) from pii.signature_links where creator_id = '${c.creatorId}'`)).toBe("0");
    expect(psql(`select count(*) from pii.signature_link_requests where creator_id = '${c.creatorId}'`)).toBe("0");
  });
});

describe("INV-E15: 링크 페이지 공개 읽기", () => {
  it("INV-E15 S15: 공개 읽기는 연결 전 false, 연결 뒤 true — 등록 정보는 돌려주지 않는다", async () => {
    const c = await newCreator();
    const before = await anonClient().rpc("creator_signature_linked", { p_creator: c.creatorId });
    expect(before.error).toBeNull();
    expect(before.data).toBe(false);
    const req = await start(c.account.userId);
    await settle(c.account.userId, req.request_id!, req.payload);
    expect((await anonClient().rpc("creator_signature_linked", { p_creator: c.creatorId })).data).toBe(true);
  });
});
