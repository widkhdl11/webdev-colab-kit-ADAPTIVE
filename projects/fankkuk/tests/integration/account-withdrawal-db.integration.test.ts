import { afterEach, describe, expect, it } from "vitest";
import { createTestAccount, removeTestAccounts, type TestAccount } from "./account-fixtures";
import { adminClient, anonClient, approveRpc, deleteTestOrders, ensureApprovalAddress, payTestOrder, psql, psqlError, registerTestOrder, signedInClient } from "./helpers";

// 회원 탈퇴 — 가명 처리(my-account INV-A15 S15~S15c) · 탈퇴 뒤 서명 기록(approval-signature INV-S14 S14·S14b) ·
// 탈퇴한 크리에이터(INV-S15 S15~S15c). 개인정보 구역 쪽은 manual/0025 가 적용돼 있어야 한다.

const made: { pseudonyms: string[]; creatorIds: string[] } = { pseudonyms: [], creatorIds: [] };

afterEach(() => {
  deleteTestOrders();
  psql(
    [
      "begin; set local session_replication_role = replica;",
      made.creatorIds.length ? `delete from pii.creator_addresses where creator_id in (${made.creatorIds.map((i) => `'${i}'`).join(",")});` : "",
      made.creatorIds.length ? `delete from public.creators where id in (${made.creatorIds.map((i) => `'${i}'`).join(",")});` : "",
      made.pseudonyms.length ? `delete from public.account_withdrawals where pseudonym_id in (${made.pseudonyms.map((i) => `'${i}'`).join(",")});` : "",
      made.pseudonyms.length ? `delete from public.profiles where id in (${made.pseudonyms.map((i) => `'${i}'`).join(",")});` : "",
      "commit;",
    ].join(" "),
  );
  made.pseudonyms = [];
  made.creatorIds = [];
  removeTestAccounts();
});

const owner = () => signedInClient("fankkuk_admin");

async function withdraw(loginId: string) {
  const r = await (await owner()).rpc("withdraw_account", { p_login_id: loginId });
  const pseudonym = (r.data as { pseudonym?: string } | null)?.pseudonym;
  if (pseudonym) made.pseudonyms.push(pseudonym);
  return r;
}

const handleOf = (a: TestAccount) => a.loginId;

/** 시험 계정 하나를 확인된 크리에이터로 — 크리에이터 행·받는 주소 자리 표시 */
function makeCreator(a: TestAccount): string {
  const creatorId = psql(
    `begin; set local session_replication_role = replica;
     update public.profiles set role = 'creator' where id = '${a.userId}';
     insert into public.creators (profile_id, slug, name, channel, channel_title, category, intro, alias, identity_verified, searchable, x_handle, fan_name)
     values ('${a.userId}', '${a.loginId.replaceAll("_", "-")}', '시험크리에이터', 'https://www.youtube.com/@it', '시험 채널', 'game', '소개', '별명', true, true, 'it_x', '팬이름')
     returning id;
     commit;`,
  )
    .split("\n")
    .find((l) => /^[0-9a-f-]{36}$/.test(l))!;
  made.creatorIds.push(creatorId);
  psql(`insert into public.creator_handles (handle, creator_id) values ('${handleOf(a)}', '${creatorId}')`);
  return creatorId;
}

/** 결제·승인까지 끝난 주문을 만들고 상태를 끝난 쪽(출고)으로 둔다 */
async function shippedOrder(who: { senderId?: string; creatorId?: string }): Promise<{ orderId: string; requestId: string }> {
  const o = await registerTestOrder(1, who);
  const requestId = await payTestOrder(o);
  const ap = await approveRpc(requestId);
  if (ap.error) throw new Error(`승인 실패: ${ap.error.message}`);
  psql(`begin; set local session_replication_role = replica; update public.orders set status = 'shipped', shipped_at = now() where id = '${o.orderId}'; commit;`);
  return { orderId: o.orderId, requestId };
}

const profileRows = (id: string) => Number(psql(`select count(*) from public.profiles where id = '${id}'`));
const authRows = (id: string) => Number(psql(`select count(*) from auth.users where id = '${id}'`));
const contactRows = (id: string) => Number(psql(`select count(*) from pii.account_contacts where account_id = '${id}'`));
const fanOf = (orderId: string) => psql(`select fan_id from public.orders where id = '${orderId}'`);

describe("탈퇴 처리 — 가명 처리 (my-account INV-A15)", () => {
  it("INV-A15 (S15): 진행 중인 일이 없는 팬을 대표가 탈퇴 처리하면 닉네임·연락처·로그인 계정이 지워지고, 끝난 주문 둘에는 같은 가명 식별자만 남는다", async () => {
    const fan = await createTestAccount({ tag: "wdfan", email: "wd.fan@example.com", phone: "01090001111" });
    const a = await shippedOrder({ senderId: fan.userId });
    const b = await shippedOrder({ senderId: fan.userId });
    // 그 번호의 본인 확인 기록 · 주소 등록 기록(고칠 수 없는 표)도 개인정보 구역에서 지운다
    psql(`insert into pii.phone_verifications (phone, verified_at) values ('01090001111', now()); insert into pii.fan_address_events (account_id, event) values ('${fan.userId}', 'registered')`);
    const r = await withdraw(fan.loginId);
    expect(r.error).toBeNull();
    const pseudonym = (r.data as { pseudonym: string }).pseudonym;
    expect(pseudonym).not.toBe(fan.userId);
    expect([profileRows(fan.userId), authRows(fan.userId), contactRows(fan.userId)]).toEqual([0, 0, 0]);
    expect(Number(psql(`select count(*) from pii.phone_verifications where phone = '01090001111'`))).toBe(0);
    expect(Number(psql(`select count(*) from pii.fan_address_events where account_id in ('${fan.userId}', '${pseudonym}')`))).toBe(0);
    expect([fanOf(a.orderId), fanOf(b.orderId)]).toEqual([pseudonym, pseudonym]);
    expect(psql(`select nickname || '|' || (withdrawn_at is not null) || '|' || role from public.profiles where id = '${pseudonym}'`)).toBe("탈퇴한 회원|true|fan");
    expect(Number(psql(`select count(*) from public.account_withdrawals where pseudonym_id = '${pseudonym}'`))).toBe(1);
    // 가명 식별자로 원래 계정을 되짚을 칸이 없다 — 원래 계정 ID 가 어느 줄에도 남지 않는다
    expect(Number(psql(`select count(*) from public.orders where fan_id = '${fan.userId}'`))).toBe(0);
  });

  it("INV-A15: 가명 계정 때문에 계정 행이 로그인 계정 없이도 있을 수 있게 됐지만, 탈퇴하지 않은 계정은 로그인 계정 없이 만들 수 없고 로그인 계정을 지우면 계정 행도 지워진다", async () => {
    const fan = await createTestAccount({ tag: "wdlogin", phone: "01090009997" });
    expect(psqlError(`insert into public.profiles (id, login_id, nickname, role) values (gen_random_uuid(), 'it_wd_nologin', 'it_wd_nologin', 'fan')`)).toContain("로그인 계정");
    expect((await adminClient().auth.admin.deleteUser(fan.userId)).error).toBeNull();
    expect([profileRows(fan.userId), contactRows(fan.userId)]).toEqual([0, 0]);
  });

  it("INV-A15 (S15b, 실패경로): 진행 중인 선물이 있으면 거부(55000)되고 아무것도 지워지지 않는다. 대표가 아닌 사람(직원·팬·크리에이터)이 부르면 거부(42501)", async () => {
    const fan = await createTestAccount({ tag: "wdopen", phone: "01090002222" });
    const o = await registerTestOrder(1, { senderId: fan.userId });
    await payTestOrder(o);
    const r = await withdraw(fan.loginId);
    expect(r.error?.code).toBe("55000");
    expect([profileRows(fan.userId), authRows(fan.userId), contactRows(fan.userId)]).toEqual([1, 1, 1]);
    expect(fanOf(o.orderId)).toBe(fan.userId);

    for (const login of ["fankkuk_staff", "byeolbit_fan", "haru_creator"]) {
      const c = await signedInClient(login);
      expect((await c.rpc("withdraw_account", { p_login_id: fan.loginId })).error?.code).toBe("42501");
    }
    expect(profileRows(fan.userId)).toBe(1);
  });

  it("INV-A15 · payment INV-M15·M22: 결제하지 않고 닫힌 주문은 진행 중인 선물이 아니다 — 이어 하기가 되는 24시간 안의 승인 거절 주문은 막고, 24시간이 지나 닫힌 주문만 남으면 탈퇴된다", async () => {
    const fan = await createTestAccount({ tag: "wdunpaid", phone: "01090003333" });
    const declined = await registerTestOrder(1, { senderId: fan.userId });
    psql(`update public.payments set status = 'failed', settled_at = now() where order_id = '${declined.orderId}'`);
    const abandoned = await registerTestOrder(1, { senderId: fan.userId });
    const ago25h = (orderId: string) =>
      backdate(`update public.orders set created_at = now() - interval '25 hours' where id = '${orderId}'; update public.payments set created_at = now() - interval '25 hours' where order_id = '${orderId}'`);
    ago25h(abandoned.orderId);
    psql(`begin; select set_config('request.jwt.claims', '{"role":"service_role"}', true); select public.office_run_expiry('${abandoned.orderNo}'); commit;`);
    expect(psql(`select status from public.payments where order_id = '${abandoned.orderId}'`)).toBe("failed");
    expect(psql(`select status from public.orders where id = '${abandoned.orderId}'`)).toBe("pending_payment");

    expect((await withdraw(fan.loginId)).error?.code).toBe("55000");
    ago25h(declined.orderId);
    // 24시간이 지나도 승인 중(결과 모름)인 결제는 INV-M19 가 정리할 때까지 진행 중이다
    const stuck = await registerTestOrder(1, { senderId: fan.userId });
    ago25h(stuck.orderId);
    psql(`update public.payments set status = 'confirming', confirming_at = now() where order_id = '${stuck.orderId}'`);
    expect((await withdraw(fan.loginId)).error?.code).toBe("55000");
    psql(`update public.payments set status = 'failed', settled_at = now() where order_id = '${stuck.orderId}'`);
    const r = await withdraw(fan.loginId);
    expect(r.error).toBeNull();
    expect(fanOf(abandoned.orderId)).toBe((r.data as { pseudonym: string }).pseudonym);
  });

  it("signup INV-U6 (실패경로): 탈퇴하지 않은 계정은 아이디를 withdrawn_ 로 시작하게 바꿀 수 없다(FKU03). 이미 그런 아이디인 줄도 닉네임은 고칠 수 있고, 탈퇴 처리는 가명 아이디를 만든다", async () => {
    const a = await createTestAccount({ tag: "wdresv", phone: "01090005555" });
    expect(psqlError(`update public.profiles set login_id = 'withdrawn_shared' where id = '${a.userId}'`)).toContain("탈퇴 처리가 쓰는 아이디");
    expect(psqlError(`update public.profiles set login_id = 'withdrawnfan${Math.floor(Math.random() * 9000 + 1000)}' where id = '${a.userId}'`)).toBeNull();
    backdate(`update public.profiles set login_id = 'withdrawn_legacy${Math.floor(Math.random() * 9000 + 1000)}' where id = '${a.userId}'`);
    expect(psqlError(`update public.profiles set nickname = '예약${Math.floor(Math.random() * 9000 + 1000)}' where id = '${a.userId}'`)).toBeNull();
    const fan = await createTestAccount({ tag: "wdresv2", phone: "01090005556" });
    const r = await withdraw(fan.loginId);
    expect(r.error).toBeNull();
    expect(psql(`select login_id from public.profiles where id = '${(r.data as { pseudonym: string }).pseudonym}'`)).toMatch(/^withdrawn_[0-9a-f]{16}$/);
  });

  it("INV-A15 · reverse-gift INV-R15: 결제가 닫힌 역조공 보내기의 몫은 진행 중인 역조공이 아니다 — 승인 중인 보내기의 몫은 받는 팬을 막고, 닫히면 팬·크리에이터 둘 다 탈퇴된다", async () => {
    const acc = await createTestAccount({ tag: "wdrgcr", phone: "01090004444" });
    const creatorId = makeCreator(acc);
    const fan = await createTestAccount({ tag: "wdrgfan", phone: "01090004445" });
    const toss = `pay_test_rg_wd${Math.floor(Math.random() * 900000 + 100000)}`;
    try {
      backdate(
        `insert into public.revgift_sends (sender_id, creator_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, status, confirming_at) values ('${acc.userId}', '${creatorId}', '${toss}', 1, 0, 0, 0, 1, 'confirming', now());
         insert into public.revgift_shares (send_id, seq, order_no, fan_id, tier, amount_krw, shipping_fee_krw) select id, 1, 'RG-IT${toss.slice(-6)}', '${fan.userId}', 'small', 1, 0 from public.revgift_sends where toss_order_id = '${toss}'`,
      );
      expect((await withdraw(fan.loginId)).error?.code).toBe("55000");
      psql(`update public.revgift_sends set status = 'failed' where toss_order_id = '${toss}'`);
      const f = await withdraw(fan.loginId);
      const c = await withdraw(acc.loginId);
      expect([f.error, c.error]).toEqual([null, null]);
    } finally {
      backdate(`delete from public.revgift_shares where send_id in (select id from public.revgift_sends where toss_order_id = '${toss}'); delete from public.revgift_sends where toss_order_id = '${toss}'`);
    }
  });

  it("INV-A15 (S15c, 실패경로): 탈퇴 처리 도중 기록 하나의 가명 바꾸기가 실패하면 계정·연락처·주문이 그대로 남는다(일부만 지운 상태가 없다)", async () => {
    const fan = await createTestAccount({ tag: "wdatom", phone: "01090003333" });
    const a = await shippedOrder({ senderId: fan.userId });
    psql(
      `create or replace function public.it_fail_fan_move() returns trigger language plpgsql as $$ begin raise exception 'it: 가명 바꾸기 실패'; end $$;
       create trigger it_fail_fan_move before update of fan_id on public.orders for each row execute function public.it_fail_fan_move();`,
    );
    try {
      const r = await withdraw(fan.loginId);
      expect(r.error).not.toBeNull();
    } finally {
      psql("drop trigger if exists it_fail_fan_move on public.orders; drop function if exists public.it_fail_fan_move();");
    }
    expect([profileRows(fan.userId), authRows(fan.userId), contactRows(fan.userId)]).toEqual([1, 1, 1]);
    expect(fanOf(a.orderId)).toBe(fan.userId);
    // 같이 쓰는 「탈퇴한 회원」 계정(자동 삭제가 쓰는 고정 ID) 말고는 가명 계정이 생기지 않았다
    expect(Number(psql(`select count(*) from public.profiles where nickname = '탈퇴한 회원' and id <> 'ffffffff-0000-4000-8000-000000000001'`))).toBe(0);
  });
});

describe("탈퇴한 크리에이터 (approval-signature INV-S14·S15)", () => {
  it("INV-S14 (S14): 승인한 주문이 있는 크리에이터를 탈퇴 처리하면 서명 기록에 원문 해시·주문·시각이 남고 서명자 식별값·원문은 비며, 계정은 가명이다", async () => {
    const acc = await createTestAccount({ tag: "wdcre", phone: "01090004444" });
    const creatorId = makeCreator(acc);
    const { requestId } = await shippedOrder({ creatorId });
    const before = psql(`select encode(extensions.digest(convert_to(signed_content, 'UTF8'), 'sha256'), 'hex') || '|' || signed_at from public.approval_signatures where request_id = '${requestId}'`);
    const r = await withdraw(acc.loginId);
    expect(r.error).toBeNull();
    const after = psql(
      `select coalesce(content_hash, '') || '|' || signed_at || '|' || (signed_content is null) || '|' || (signer_id is null) from public.approval_signatures where request_id = '${requestId}'`,
    );
    expect(after).toBe(`${before}|true|true`);
    expect([profileRows(acc.userId), authRows(acc.userId)]).toEqual([0, 0]);
  });

  it("INV-S14 (S14b, 실패경로): 탈퇴 처리된 서명 기록은 그 뒤에도 고치거나 지울 수 없고, 가명 계정으로 탈퇴를 다시 부르면 거부된다", async () => {
    const acc = await createTestAccount({ tag: "wdsig", phone: "01090005555" });
    const creatorId = makeCreator(acc);
    const { requestId } = await shippedOrder({ creatorId });
    const r = await withdraw(acc.loginId);
    expect(r.error).toBeNull();
    expect(psqlError(`update public.approval_signatures set content_hash = 'x' where request_id = '${requestId}'`)).not.toBeNull();
    expect(psqlError(`delete from public.approval_signatures where request_id = '${requestId}'`)).not.toBeNull();
    const pseudoLogin = psql(`select login_id from public.profiles where id = '${(r.data as { pseudonym: string }).pseudonym}'`);
    expect((await withdraw(pseudoLogin)).error?.code).toBe("P0002");
  });

  it("INV-S15 (S15): 끝난 주문만 있는 크리에이터를 탈퇴 처리하면 주소 봉투가 지워지고, 크리에이터 행은 남아 「탈퇴한 크리에이터」·계정 없음·찾기 노출 꺼짐이 된다", async () => {
    const acc = await createTestAccount({ tag: "wdaddr", phone: "01090006666" });
    const creatorId = makeCreator(acc);
    await shippedOrder({ creatorId });
    expect(Number(psql(`select count(*) from pii.creator_addresses where creator_id = '${creatorId}'`))).toBe(1);
    const r = await withdraw(acc.loginId);
    expect(r.error).toBeNull();
    expect(Number(psql(`select count(*) from pii.creator_addresses where creator_id = '${creatorId}'`))).toBe(0);
    expect(
      psql(
        `select name || '|' || (profile_id is null) || '|' || (withdrawn_at is not null) || '|' || searchable || '|' || identity_verified || '|' || coalesce(x_handle, '-') || '|' || coalesce(fan_name, '-') || '|' || channel from public.creators where id = '${creatorId}'`,
      ),
    ).toBe("탈퇴한 크리에이터|true|true|false|false|-|-|");
    // 크리에이터 페이지가 「탈퇴한 크리에이터입니다.」를 그릴 근거 — 링크 주소·ID 로 물으면 탈퇴, 활동 중인 하루는 아님
    const anon = anonClient();
    expect((await anon.rpc("withdrawn_creator", { p_handle: handleOf(acc) })).data).toBe(true);
    expect((await anon.rpc("withdrawn_creator", { p_creator: creatorId })).data).toBe(true);
    expect((await anon.rpc("withdrawn_creator", { p_creator: "00000000-0000-4000-b000-000000000001" })).data).toBe(false);
  });

  it("INV-S15 (S15b, 실패경로): 크리에이터 앞으로 진행 중 주문이 남아 있으면 탈퇴 처리가 거부되고 주소·계정이 그대로다", async () => {
    const acc = await createTestAccount({ tag: "wdcopen", phone: "01090007777" });
    const creatorId = makeCreator(acc);
    const o = await registerTestOrder(1, { creatorId });
    ensureApprovalAddress(await payTestOrder(o));
    expect((await withdraw(acc.loginId)).error?.code).toBe("55000");
    expect(Number(psql(`select count(*) from pii.creator_addresses where creator_id = '${creatorId}'`))).toBe(1);
    expect(profileRows(acc.userId)).toBe(1);
  });

  it("INV-S15 (S15c, 실패경로): 탈퇴한 크리에이터 앞으로 주문을 등록하거나 승인 요청 줄을 직접 넣으면 거부되고 아무것도 생기지 않는다", async () => {
    const acc = await createTestAccount({ tag: "wdblock", phone: "01090008888" });
    const creatorId = makeCreator(acc);
    const old = await shippedOrder({ creatorId });
    expect((await withdraw(acc.loginId)).error).toBeNull();
    const before = Number(psql(`select count(*) from public.orders where creator_id = '${creatorId}'`));
    await expect(registerTestOrder(1, { creatorId })).rejects.toThrow();
    expect(Number(psql(`select count(*) from public.orders where creator_id = '${creatorId}'`))).toBe(before);
    expect(
      psqlError(`insert into public.approval_requests (request_id, order_id, payload, created_at) values ('apr_ITWDBLOCK', '${old.orderId}', 'x', now())`),
    ).not.toBeNull();
    expect((await adminClient().from("approval_requests").select("id").eq("request_id", "apr_ITWDBLOCK")).data).toEqual([]);
  });

  it("INV-S15 (S15c, 실패경로): 등록 함수를 거치지 않고 표에 바로 넣어도 — 탈퇴한 크리에이터 앞 주문 · 탈퇴한 팬의 주문 · 탈퇴한 크리에이터의 역조공 · 탈퇴한 팬 앞 역조공 몫 — 모두 「탈퇴한 회원」으로 거부된다", async () => {
    const acc = await createTestAccount({ tag: "wdrow", phone: "01090009999" });
    const creatorId = makeCreator(acc);
    await shippedOrder({ creatorId });
    const fan = await createTestAccount({ tag: "wdrowfan", phone: "01090009998" });
    await shippedOrder({ senderId: fan.userId });
    const c = await withdraw(acc.loginId);
    const f = await withdraw(fan.loginId);
    expect([c.error, f.error]).toEqual([null, null]);
    const fanPseudonym = (f.data as { pseudonym: string }).pseudonym;
    const order = (fanId: string, toCreator: string) =>
      `insert into public.orders (order_no, fan_id, creator_id, item_kind, has_electronics_or_metal, status) values ('FC-TWDROW${Math.floor(Math.random() * 90 + 10)}', '${fanId}', '${toCreator}', '시험 선물', false, 'pending_payment')`;
    expect(psqlError(order("00000000-0000-4000-a000-000000000001", creatorId))).toContain("탈퇴한 회원");
    expect(psqlError(order(fanPseudonym, "00000000-0000-4000-b000-000000000001"))).toContain("탈퇴한 회원");
    expect(
      psqlError(
        `insert into public.revgift_sends (sender_id, creator_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw) values ('00000000-0000-4000-a000-000000000011', '${creatorId}', 'pay_it_wdrow', 1, 0, 0, 0, 1)`,
      ),
    ).toContain("탈퇴한 회원");
    expect(
      psqlError(
        `insert into public.revgift_shares (send_id, seq, order_no, fan_id, tier, amount_krw, shipping_fee_krw) values (gen_random_uuid(), 1, 'RG-ITWD1', '${fanPseudonym}', 'small', 1, 0)`,
      ),
    ).toContain("탈퇴한 회원");
  });
});

// 기간 지난 가명 기록 자동 삭제 — my-account INV-A16 (S16~S16c) · approval-signature INV-S14 (S14c).
// 기간은 DB 시각 기준이라 시험은 기록의 시각을 거꾸로 돌려 둔다(고칠 수 없는 표라 트리거를 끄고).
const purge = () => JSON.parse(psql("select public.retention_purge()")) as Record<string, number>;
const backdate = (sql: string) => psql(`begin; set local session_replication_role = replica; ${sql}; commit;`);
const inquiryRows = (id: string) => Number(psql(`select count(*) from public.inquiries where id = '${id}'`));
function addInquiry(authorId: string, answered: boolean): string {
  return psql(
    answered
      ? `insert into public.inquiries (author_id, kind, title, body, status, answer, answered_at) values ('${authorId}', 'account', '시험 문의', '본문', 'answered', '답', now()) returning id`
      : `insert into public.inquiries (author_id, kind, title, body) values ('${authorId}', 'account', '시험 문의', '본문') returning id`,
  )
    .split("\n")
    .find((l) => /^[0-9a-f-]{36}$/.test(l))!;
}

describe("기간 지난 가명 기록 자동 삭제 (my-account INV-A16 · approval-signature S14c)", () => {
  it("INV-A15 (실패경로): 탈퇴·자동 삭제 안쪽 함수(트리거 끄기·진행 중인 일·끝난 주문·마지막 기록 시각)는 서버 키·로그인 키·익명 키 누구도 부를 수 없다 — 서명 표 보호가 꺼진 채 남지 않는다", async () => {
    for (const client of [adminClient(), anonClient(), await owner()]) {
      const toggled = await client.rpc("withdrawal_toggle_append_only", { p_table: "public.approval_signatures", p_enable: false });
      expect(toggled.error).not.toBeNull();
      const open = await client.rpc("account_has_open_work", { p_account: "ffffffff-0000-4000-8000-000000000001", p_creator: null });
      expect(open.error).not.toBeNull();
      expect((await client.rpc("order_is_finished", { p_order: "ffffffff-0000-4000-8000-000000000001" })).error).not.toBeNull();
      expect((await client.rpc("order_ended_at", { p_order: "ffffffff-0000-4000-8000-000000000001" })).error).not.toBeNull();
    }
    expect(psql(`select count(*) from pg_trigger where tgrelid = 'public.approval_signatures'::regclass and not tgisinternal and tgenabled = 'D'`)).toBe("0");
  });

  it("INV-A15: 탈퇴한 팬이 쓴 1:1 문의(답이 달린 것 포함)는 지워지지 않고 가명 계정의 문의로 남는다 — 3년 보관 대상이라서", async () => {
    const fan = await createTestAccount({ tag: "wdinq", phone: "01090006666" });
    const answered = addInquiry(fan.userId, true);
    const open = addInquiry(fan.userId, false);
    const r = await withdraw(fan.loginId);
    expect(r.error).toBeNull();
    const pseudonym = (r.data as { pseudonym: string }).pseudonym;
    expect(psql(`select string_agg(author_id::text, ',' order by id) from public.inquiries where id in ('${answered}', '${open}')`)).toBe(`${pseudonym},${pseudonym}`);
    expect(psql(`select answer from public.inquiries where id = '${answered}'`)).toBe("답");
  });

  it("INV-A16 (S16·S16b): 탈퇴한 사람이 쓴 문의는 쓴 지 3년 1일이면 지워지고 하루 덜 된 것은 남는다. 탈퇴하지 않은 회원의 3년 1일 된 문의는 남는다", async () => {
    const fan = await createTestAccount({ tag: "wdold", phone: "01090007777" });
    const member = await createTestAccount({ tag: "wdkeep", phone: "01090008888" });
    const old = addInquiry(fan.userId, true);
    const recent = addInquiry(fan.userId, false);
    const memberOld = addInquiry(member.userId, false);
    expect((await withdraw(fan.loginId)).error).toBeNull();
    backdate(`update public.inquiries set created_at = now() - interval '3 years 1 day' where id in ('${old}', '${memberOld}'); update public.inquiries set created_at = now() - interval '3 years' + interval '1 day' where id = '${recent}'`);
    const counts = purge();
    expect(counts.inquiries).toBeGreaterThanOrEqual(1);
    expect([inquiryRows(old), inquiryRows(recent), inquiryRows(memberOld)]).toEqual([0, 1, 1]);
  });

  it("INV-S14 (S14c): 크리에이터만 탈퇴한 주문 — 마지막 기록이 5년 1일 전이면 서명 기록은 지워지고 주문은 남는다. 서명이 5년 1일 전이어도 주문의 마지막 기록이 4년 364일 전이면 남는다(서명한 때부터 세면 법정 5년을 못 채운다). 탈퇴하지 않은 크리에이터의 서명은 남는다", async () => {
    const fan = await createTestAccount({ tag: "wdsgf", phone: null });
    const gone = await createTestAccount({ tag: "wdsg1", phone: "01090009991" });
    const member = await createTestAccount({ tag: "wdsg3", phone: "01090009993" });
    const goneCreator = makeCreator(gone);
    const a = await shippedOrder({ senderId: fan.userId, creatorId: goneCreator });
    const b = await shippedOrder({ senderId: fan.userId, creatorId: goneCreator });
    const c = await shippedOrder({ senderId: fan.userId, creatorId: makeCreator(member) });
    expect((await withdraw(gone.loginId)).error).toBeNull();
    ageOrder(a.orderId, "5 years 1 day");
    ageOrder(c.orderId, "5 years 1 day");
    // b: 서명은 5년 1일 전, 주문의 마지막 기록(출고)은 4년 364일 전
    ageOrder(b.orderId, "5 years - 1 day");
    backdate(`update public.approval_signatures set signed_at = now() - interval '5 years 1 day' where request_id = '${b.requestId}'`);
    const counts = purge();
    expect(counts.signatures).toBeGreaterThanOrEqual(1);
    const sigRows = (req: string) => Number(psql(`select count(*) from public.approval_signatures where request_id = '${req}'`));
    expect([sigRows(a.requestId), sigRows(b.requestId), sigRows(c.requestId)]).toEqual([0, 1, 1]);
    expect(orderRows(a.orderId).startsWith("1,")).toBe(true);
    // 지운 뒤에도 서명 표는 다시 「고치거나 지울 수 없다」 — 끈 트리거가 다시 켜져 있다
    expect(psqlError(`delete from public.approval_signatures where request_id = '${b.requestId}'`)).not.toBeNull();
  });

  it("INV-A16 (S16c, 실패경로): 같은 날 두 번 돌면 두 번째는 지울 것이 없고 오류가 나지 않는다. 돌 때마다 지운 건수가 한 줄씩 기록된다", async () => {
    const fan = await createTestAccount({ tag: "wdtwice", phone: "01090009994" });
    const old = addInquiry(fan.userId, false);
    expect((await withdraw(fan.loginId)).error).toBeNull();
    backdate(`update public.inquiries set created_at = now() - interval '3 years 1 day' where id = '${old}'`);
    const before = Number(psql("select count(*) from public.retention_purge_runs"));
    const first = purge();
    const second = purge();
    expect(first.inquiries).toBeGreaterThanOrEqual(1);
    expect(Object.values(second).every((n) => n === 0)).toBe(true);
    expect(Number(psql("select count(*) from public.retention_purge_runs"))).toBe(before + 2);
  });

  it("INV-A16: 자동 삭제 작업이 매일 한 번 예약돼 있고, 팬·크리에이터·익명은 앱 경로로 부를 수 없다", async () => {
    expect(psql(`select schedule || '|' || command from cron.job where jobname = 'fankkuk-retention'`)).toBe("30 18 * * *|select public.retention_purge()");
    const fanClient = await signedInClient("byeolbit_fan");
    // 대표·서버 키도 못 부른다 — 예약 작업 실행자만
    for (const client of [fanClient, anonClient(), await owner(), adminClient()]) {
      const r = await client.rpc("retention_purge");
      expect(r.error).not.toBeNull();
    }
  });
});

// 주문 기록 — 카드 d123 「추천대로(A)」: 둘 다 탈퇴한 주문만 통째로 지우고, 한쪽이 회원이면 주문은 남기고
// 탈퇴한 쪽 칸을 모두가 같이 쓰는 「탈퇴한 회원」·「탈퇴한 크리에이터」로 바꾼다. 기간은 그 주문의 마지막 기록 시각부터.
const SHARED_FAN = "ffffffff-0000-4000-8000-000000000001";
const SHARED_CREATOR = "ffffffff-0000-4000-8000-000000000002";
/** 주문과 그 결제·환불·취소·상자·서명의 시각을 모두 거꾸로 민다 — 「마지막 기록」이 now() - shift 가 된다 */
function ageOrder(orderId: string, shift: string, only: "all" | "keep-payments" = "all") {
  const cols = "created_at, registered_at, approved_at, received_at, inspected_at, shipped_at, delivered_at, fan_send_ack_at, fan_not_sent_at";
  const sets = (list: string) => list.split(", ").map((c) => `${c} = ${c} - interval '${shift}'`).join(", ");
  backdate(
    [
      `update public.orders set ${sets(cols)} where id = '${orderId}'`,
      only === "all" ? `update public.payments set ${sets("created_at, settled_at, expired_at, confirming_at, review_at")} where order_id = '${orderId}'` : "select 1",
      `update public.office_parcels set ${sets("received_at, labeled_at, inspected_at, printed_at, shipped_at, return_printed_at, returned_at, created_at, hold_at, hold_closed_at, return_waiting_at, return_confirmed_at")} where box_id in (select id from public.boxes where order_id = '${orderId}')`,
      `update public.approval_signatures set signed_at = signed_at - interval '${shift}' where request_id in (select request_id from public.approval_requests where order_id = '${orderId}')`,
    ].join("; "),
  );
}
const orderRows = (orderId: string) =>
  psql(
    `select (select count(*) from public.orders where id = '${orderId}') || ',' || (select count(*) from public.payments where order_id = '${orderId}') || ',' ||
       (select count(*) from public.approval_requests where order_id = '${orderId}') || ',' || (select count(*) from public.boxes where order_id = '${orderId}') || ',' ||
       (select count(*) from public.decrypt_log where order_id = '${orderId}')`,
  );
/** 주소 열람 기록 한 줄(고칠 수 없는 표) — 지울 때 이것도 함께 지워지는지 보려고 */
const addDecryptLog = (orderId: string) =>
  psql(`insert into public.decrypt_log (order_id, requester_id, result, deny_reason) select '${orderId}', id, 'denied', 'not_owner' from public.profiles where login_id = 'fankkuk_admin'`);

describe("기간 지난 주문 기록 자동 삭제 (my-account INV-A16, 카드 d123)", () => {
  async function bothWithdrawnOrder(tag: string) {
    const fan = await createTestAccount({ tag: `${tag}f`, phone: null });
    const cre = await createTestAccount({ tag: `${tag}c`, phone: null });
    const o = await shippedOrder({ senderId: fan.userId, creatorId: makeCreator(cre) });
    addDecryptLog(o.orderId);
    expect((await withdraw(fan.loginId)).error).toBeNull();
    expect((await withdraw(cre.loginId)).error).toBeNull();
    return o;
  }

  it("INV-A16 (S16): 팬·크리에이터 둘 다 탈퇴했고 마지막 기록이 5년 1일 전인 주문은 결제·승인 요청·상자·주소 열람 기록까지 지워진다", async () => {
    const o = await bothWithdrawnOrder("wdo1");
    expect(orderRows(o.orderId)).toBe("1,1,1,1,1");
    ageOrder(o.orderId, "5 years 1 day");
    const counts = purge();
    expect(counts.orders).toBeGreaterThanOrEqual(1);
    expect(orderRows(o.orderId)).toBe("0,0,0,0,0");
    // 지운 뒤 「고치거나 지울 수 없다」 트리거는 다시 켜져 있다
    expect(psql(`select count(*) from pg_trigger where tgname = 'decrypt_log_no_update' and tgenabled = 'D'`)).toBe("0");
  });

  it("INV-A16 (S16b): 둘 다 탈퇴했어도 마지막 기록이 5년보다 하루 덜 됐으면 남는다", async () => {
    const o = await bothWithdrawnOrder("wdo2");
    ageOrder(o.orderId, "5 years - 1 day");
    purge();
    expect(orderRows(o.orderId)).toBe("1,1,1,1,1");
  });

  it("INV-A16 (S16b, 실패경로): 주문 칸은 5년 1일 전이어도 결제 기록이 그 뒤면 결제 때부터 센다 — 남는다", async () => {
    const o = await bothWithdrawnOrder("wdo3");
    // 결제 시각만 그대로 두고 나머지(주문·상자·서명)는 5년 1일 전으로
    ageOrder(o.orderId, "5 years 1 day", "keep-payments");
    purge();
    expect(orderRows(o.orderId).startsWith("1,")).toBe(true);
  });

  it("INV-A16 (d123): 팬만 탈퇴한 5년 1일 된 주문은 남고, 팬 칸은 가명 식별자 대신 같이 쓰는 「탈퇴한 회원」이 된다", async () => {
    const fan = await createTestAccount({ tag: "wdo4f", phone: null });
    const cre = await createTestAccount({ tag: "wdo4c", phone: null });
    const o = await shippedOrder({ senderId: fan.userId, creatorId: makeCreator(cre) });
    const r = await withdraw(fan.loginId);
    const pseudonym = (r.data as { pseudonym: string }).pseudonym;
    expect(fanOf(o.orderId)).toBe(pseudonym);
    ageOrder(o.orderId, "5 years 1 day");
    const counts = purge();
    expect(counts.unlinked).toBeGreaterThanOrEqual(1);
    expect(orderRows(o.orderId).startsWith("1,")).toBe(true);
    expect(fanOf(o.orderId)).toBe(SHARED_FAN);
    // 이미 바꾼 주문은 다음 회차에 다시 세지 않는다(S16c)
    expect(purge().unlinked).toBe(0);
    // 크리에이터(회원)의 서명 기록은 그대로다
    expect(psql(`select count(*) from public.approval_signatures where request_id = '${o.requestId}' and signed_content is not null`)).toBe("1");
  });

  it("INV-A16 (d123): 크리에이터만 탈퇴한 5년 1일 된 주문은 남고, 크리에이터 칸이 같이 쓰는 「탈퇴한 크리에이터」가 된다. 하루 덜 된 주문은 그대로다", async () => {
    const fan = await createTestAccount({ tag: "wdo5f", phone: null });
    const cre = await createTestAccount({ tag: "wdo5c", phone: null });
    const creatorId = makeCreator(cre);
    const old = await shippedOrder({ senderId: fan.userId, creatorId });
    const recent = await shippedOrder({ senderId: fan.userId, creatorId });
    expect((await withdraw(cre.loginId)).error).toBeNull();
    ageOrder(old.orderId, "5 years 1 day");
    ageOrder(recent.orderId, "5 years - 1 day");
    purge();
    const creatorOf = (id: string) => psql(`select creator_id from public.orders where id = '${id}'`);
    expect([creatorOf(old.orderId), creatorOf(recent.orderId)]).toEqual([SHARED_CREATOR, creatorId]);
    expect(fanOf(old.orderId)).toBe(fan.userId);
  });
});

// 역조공 기록 — 같은 규칙(카드 d123)을 보내기에 맞춘다. 보내기 하나에 몫(받는 팬)이 여럿이라, 5년은 보내기 전체가 끝난 때
// (모든 몫·결제·열람 기록 가운데 마지막)부터 센다. 크리에이터·팬 둘 다 탈퇴한 몫은 지우고, 한쪽만이면 같이 쓰는 표시로 바꾼다.
// 크리에이터가 탈퇴했고 몫이 다 지워진 보내기는 지운다. 보내기·몫은 실제 흐름 대신 표에 바로 넣는다.
const RG_TOSS = "pay_test_rg_wd";
function makeSend(creator: { profileId: string; creatorId: string }, shares: { fanId: string; open?: boolean }[]): { sendId: string; shareIds: string[] } {
  const toss = `${RG_TOSS}${rand(8)}`;
  const out = psql(
    `begin; set local session_replication_role = replica;
     insert into public.revgift_sends (sender_id, creator_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, status, payment_key, settled_at)
       values ('${creator.profileId}', '${creator.creatorId}', '${toss}', ${shares.length}, 0, 0, 0, ${shares.length}, 'done', 'pk_${toss}', now());
     ${shares
       .map(
         (s, i) =>
           `insert into public.revgift_shares (send_id, seq, order_no, fan_id, tier, amount_krw, shipping_fee_krw, reply, replied_at, received_at, inspected_at, shipped_at)
              select id, ${i + 1}, 'RG-IT${rand(6)}', '${s.fanId}', 'small', 1, 1, ${s.open ? "'waiting', null, null, null, null" : "'accepted', now(), now(), now(), now()"} from public.revgift_sends where toss_order_id = '${toss}';`,
       )
       .join("\n")}
     commit;
     select id from public.revgift_sends where toss_order_id = '${toss}';
     select id from public.revgift_shares where send_id = (select id from public.revgift_sends where toss_order_id = '${toss}') order by seq;`,
  )
    .split("\n")
    .filter((l) => /^[0-9a-f-]{36}$/.test(l));
  return { sendId: out[0], shareIds: out.slice(1) };
}
/** 몫의 주소 열람 기록(고칠 수 없는 표) — 지울 때 함께 지워지는지, 그 시각도 「마지막 기록」인지 보려고 */
const addShareDecryptLog = (shareId: string) =>
  psql(`insert into public.revgift_decrypt_log (share_id, requester_id, result, deny_reason) select '${shareId}', id, 'denied', 'not_owner' from public.profiles where login_id = 'fankkuk_admin'`);
/** 몫의 사무실 상자(발송됨)와 검수 기록, nicknameOf 를 주면 그 계정을 닉네임 일치로 잡은 보류 상자 줄 — 상자 기록도 지우거나 바꾸는지 보려고 */
function addShareParcel(shareId: string, nicknameOf?: string): string {
  const staff = STAFF();
  const parcel = idLine(
    psql(
      `begin; set local session_replication_role = replica;
       insert into public.office_parcels (share_id, state, received_at, inspected_at, shipped_at, outbound_waybill_no)
         values ('${shareId}', 'shipped', now(), now(), now(), '9${rand(12)}') returning id;
       commit;`,
    ),
  );
  psql(
    `begin; set local session_replication_role = replica;
     insert into public.office_inspections (parcel_id, inspected_by, outcome, bluetooth, rf, metal) values ('${parcel}', '${staff}', 'return', 'clear', 'clear', 'clear');
     ${nicknameOf ? `insert into public.office_unmatched (waybill_no, shelf, recorded_by, reason, nickname_profile_id, matched_parcel_id, matched_at) values ('8${rand(11)}', 'A1', '${staff}', 'no_code', '${nicknameOf}', '${parcel}', now());` : ""}
     commit;`,
  );
  return parcel;
}
const shareParcelRows = (sendId: string) =>
  psql(
    `select (select count(*) from public.office_parcels op join public.revgift_shares s on s.id = op.share_id where s.send_id = '${sendId}') || ',' ||
       (select count(*) from public.office_inspections i join public.office_parcels op on op.id = i.parcel_id join public.revgift_shares s on s.id = op.share_id where s.send_id = '${sendId}')`,
  );
function ageSend(sendId: string, shift: string, only: "all" | "keep-logs" = "all") {
  const sets = (list: string) => list.split(", ").map((c) => `${c} = ${c} - interval '${shift}'`).join(", ");
  const parcels = `select op.id from public.office_parcels op join public.revgift_shares s on s.id = op.share_id where s.send_id = '${sendId}'`;
  backdate(
    [
      `update public.office_parcels set ${sets("created_at, received_at, inspected_at, shipped_at")} where id in (${parcels})`,
      `update public.office_inspections set at = at - interval '${shift}' where parcel_id in (${parcels})`,
      `update public.office_unmatched set ${sets("arrived_at, matched_at")} where matched_parcel_id in (${parcels})`,
      `update public.revgift_sends set ${sets("created_at, settled_at")} where id = '${sendId}'`,
      `update public.revgift_shares set ${sets("replied_at, received_at, inspected_at, shipped_at")} where send_id = '${sendId}'`,
      only === "all" ? `update public.revgift_decrypt_log set at = at - interval '${shift}' where share_id in (select id from public.revgift_shares where send_id = '${sendId}')` : "select 1",
    ].join("; "),
  );
}
const sendRows = (sendId: string) =>
  psql(
    `select (select count(*) from public.revgift_sends where id = '${sendId}') || ',' || (select count(*) from public.revgift_shares where send_id = '${sendId}') || ',' ||
       (select count(*) from public.revgift_decrypt_log l join public.revgift_shares s on s.id = l.share_id where s.send_id = '${sendId}')`,
  );
const cleanSends = () =>
  backdate(
    `delete from public.office_unmatched where matched_parcel_id in (select op.id from public.office_parcels op join public.revgift_shares s on s.id = op.share_id join public.revgift_sends d on d.id = s.send_id where d.toss_order_id like '${RG_TOSS}%');
     delete from public.office_inspections where parcel_id in (select op.id from public.office_parcels op join public.revgift_shares s on s.id = op.share_id join public.revgift_sends d on d.id = s.send_id where d.toss_order_id like '${RG_TOSS}%');
     delete from public.office_parcels where share_id in (select s.id from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id where d.toss_order_id like '${RG_TOSS}%');
     delete from public.revgift_decrypt_log where share_id in (select s.id from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id where d.toss_order_id like '${RG_TOSS}%');
     delete from public.revgift_shares where send_id in (select id from public.revgift_sends where toss_order_id like '${RG_TOSS}%');
     delete from public.revgift_sends where toss_order_id like '${RG_TOSS}%'`,
  );

describe("기간 지난 역조공 기록 자동 삭제 (my-account INV-A16, 카드 d123)", () => {
  afterEach(() => cleanSends());

  async function sendTo(tag: string, fanCount: number, opts: { openLast?: boolean } = {}) {
    const cre = await createTestAccount({ tag: `${tag}c`, phone: null });
    const creatorId = makeCreator(cre);
    const fans = [];
    for (let i = 0; i < fanCount; i += 1) fans.push(await createTestAccount({ tag: `${tag}f${i}`, phone: null }));
    const s = makeSend(
      { profileId: cre.userId, creatorId },
      fans.map((f, i) => ({ fanId: f.userId, open: opts.openLast === true && i === fanCount - 1 })),
    );
    s.shareIds.forEach(addShareDecryptLog);
    return { cre, creatorId, fans, ...s };
  }
  const pseudonymOf = async (loginId: string) => {
    const r = await withdraw(loginId);
    expect(r.error).toBeNull();
    return (r.data as { pseudonym: string }).pseudonym;
  };

  it("INV-A16 (S16·d123): 5년 1일 된 보내기 — 크리에이터·팬 둘 다 탈퇴한 몫은 열람 기록까지 지워지고, 회원인 팬의 몫은 남아 보내기의 크리에이터·보낸 사람이 같이 쓰는 표시가 된다. 그 팬도 탈퇴하면 보내기까지 지워진다", async () => {
    const s = await sendTo("wdg1", 2);
    addShareParcel(s.shareIds[0]);
    const fanGone = await pseudonymOf(s.fans[0].loginId);
    const creGone = await pseudonymOf(s.cre.loginId);
    ageSend(s.sendId, "5 years 1 day");
    const counts = purge();
    expect(counts.revgift_shares).toBeGreaterThanOrEqual(1);
    expect(sendRows(s.sendId)).toBe("1,1,1");
    expect(shareParcelRows(s.sendId)).toBe("0,0");
    expect(psql(`select fan_id from public.revgift_shares where send_id = '${s.sendId}'`)).toBe(s.fans[1].userId);
    expect(psql(`select creator_id || ',' || sender_id from public.revgift_sends where id = '${s.sendId}'`)).toBe(`${SHARED_CREATOR},${SHARED_FAN}`);
    expect([referencesTo(fanGone), referencesTo(creGone)]).toEqual([[], []]);
    expect(psql(`select count(*) from pg_trigger where tgname = 'revgift_decrypt_log_no_update' and tgenabled = 'D'`)).toBe("0");
    // 이미 바꾼 보내기는 다음 회차에 다시 세지 않는다
    expect(purge().revgift_unlinked).toBe(0);

    await pseudonymOf(s.fans[1].loginId);
    purge();
    expect(sendRows(s.sendId)).toBe("0,0,0");
  });

  it("INV-A16 (d123): 팬만 탈퇴한 5년 1일 된 보내기 — 몫과 사무실 상자는 남고, 몫의 팬 칸과 상자 기록의 닉네임 일치 칸이 같이 쓰는 「탈퇴한 회원」이 된다. 크리에이터 칸은 그대로다", async () => {
    const s = await sendTo("wdg5", 1);
    addShareParcel(s.shareIds[0], s.fans[0].userId);
    const fanGone = await pseudonymOf(s.fans[0].loginId);
    ageSend(s.sendId, "5 years 1 day");
    expect(purge().revgift_unlinked).toBe(1);
    expect(sendRows(s.sendId)).toBe("1,1,1");
    expect(shareParcelRows(s.sendId)).toBe("1,1");
    expect(psql(`select fan_id from public.revgift_shares where send_id = '${s.sendId}'`)).toBe(SHARED_FAN);
    expect(psql(`select creator_id from public.revgift_sends where id = '${s.sendId}'`)).toBe(s.creatorId);
    expect(referencesTo(fanGone)).toEqual([]);
  });

  it("INV-A16 (S16b): 둘 다 탈퇴했어도 보내기의 마지막 기록이 5년보다 하루 덜 됐으면 그대로다", async () => {
    const s = await sendTo("wdg2", 1);
    const fanGone = await pseudonymOf(s.fans[0].loginId);
    await pseudonymOf(s.cre.loginId);
    ageSend(s.sendId, "5 years - 1 day");
    purge();
    expect(sendRows(s.sendId)).toBe("1,1,1");
    expect(psql(`select fan_id from public.revgift_shares where send_id = '${s.sendId}'`)).toBe(fanGone);
  });

  it("INV-A16 (S16b, 실패경로): 다른 기록은 5년 1일 전이어도 주소 열람 기록이 최근이면 그때부터 센다 — 남는다", async () => {
    const s = await sendTo("wdg3", 1);
    await pseudonymOf(s.fans[0].loginId);
    await pseudonymOf(s.cre.loginId);
    ageSend(s.sendId, "5 years 1 day", "keep-logs");
    purge();
    expect(sendRows(s.sendId)).toBe("1,1,1");
  });

  it("INV-A16 (실패경로): 아직 끝나지 않은 몫(수락 대기)이 있는 보내기는 5년 1일 전이어도 손대지 않는다 — 탈퇴한 팬의 몫도 가명 그대로", async () => {
    const s = await sendTo("wdg4", 2, { openLast: true });
    const fanGone = await pseudonymOf(s.fans[0].loginId);
    ageSend(s.sendId, "5 years 1 day");
    purge();
    expect(sendRows(s.sendId)).toBe("1,2,2");
    expect(psql(`select fan_id from public.revgift_shares where send_id = '${s.sendId}' and seq = 1`)).toBe(fanGone);
  });
});

// 코드 리뷰(2026-10-23) 반영 — 사무실 상자가 있는 주문. 상자 기록은 실제 흐름 대신 표에 바로 넣는다(시험 대상은 탈퇴·자동 삭제다).
const STAFF = () => psql(`select id from public.profiles where login_id = 'fankkuk_staff'`);
const rand = (digits: number) => String(Math.floor(Math.random() * 10 ** digits)).padStart(digits, "0");
const idLine = (out: string) => out.split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l))!;

/** 주문의 첫 상자의 사무실 상자(결제 때 「도착 기다림」으로 생긴 줄)를 반송·처분으로 두고 그 기록(검수·크리에이터 확인 질문과 답·답 기록·보류 상자 잇기·처분)을 붙이고 주문을 「검수 완료」로 둔다 */
function officeTrail(orderId: string, o: { fanId: string; creatorProfileId: string; state: "returned" | "disposed" }): string {
  const staff = STAFF();
  const wb = `9${rand(12)}`;
  const parcel = idLine(
    psql(
      `begin; set local session_replication_role = replica;
       update public.office_parcels set state = '${o.state}', received_at = now(), inspected_at = now(),
              return_waybill_no = ${o.state === "returned" ? `'${wb}'` : "null"}, returned_at = ${o.state === "returned" ? "now()" : "null"}
        where box_id = (select b.id from public.boxes b where b.order_id = '${orderId}' order by b.id limit 1) returning id;
       commit;`,
    ),
  );
  const unmatched = idLine(
    psql(
      `begin; set local session_replication_role = replica;
       insert into public.office_inspections (parcel_id, inspected_by, outcome, bluetooth, rf, metal) values ('${parcel}', '${staff}', 'return', 'clear', 'clear', 'clear');
       insert into public.office_creator_checks (parcel_id, kind, answer, answered_at, answered_by) values ('${parcel}', 'confirm', 'return', now(), '${o.creatorProfileId}');
       insert into public.office_creator_check_events (parcel_id, action, actor) values ('${parcel}', 'cancel', '${o.creatorProfileId}');
       ${o.state === "disposed" ? `insert into public.office_disposals (parcel_id, disposed_by) values ('${parcel}', '${staff}');` : ""}
       insert into public.office_unmatched (waybill_no, shelf, recorded_by, reason, nickname_profile_id, matched_parcel_id, matched_at)
         values ('${wb.slice(0, 12)}', 'A1', '${staff}', 'no_code', '${o.fanId}', '${parcel}', now()) returning id;
       commit;`,
    ),
  );
  psql(
    `begin; set local session_replication_role = replica;
     insert into public.office_held_links (unmatched_id, parcel_id, account_id, linked_by, contents_checked) values ('${unmatched}', '${parcel}', '${o.fanId}', '${staff}', true);
     update public.orders set status = 'inspected', shipped_at = null, inspection_result = 'returned', inspected_at = now() where id = '${orderId}';
     commit;`,
  );
  return parcel;
}
function ageOffice(parcel: string, shift: string) {
  backdate(
    [
      `update public.office_inspections set at = at - interval '${shift}' where parcel_id = '${parcel}'`,
      `update public.office_creator_checks set asked_at = asked_at - interval '${shift}', answered_at = answered_at - interval '${shift}' where parcel_id = '${parcel}'`,
      `update public.office_creator_check_events set at = at - interval '${shift}' where parcel_id = '${parcel}'`,
      `update public.office_held_links set linked_at = linked_at - interval '${shift}' where parcel_id = '${parcel}'`,
      `update public.office_unmatched set arrived_at = arrived_at - interval '${shift}', matched_at = matched_at - interval '${shift}' where matched_parcel_id = '${parcel}'`,
    ].join("; "),
  );
}
const officeRows = (parcel: string) =>
  psql(
    `select (select count(*) from public.office_parcels where id = '${parcel}') || ',' || (select count(*) from public.office_inspections where parcel_id = '${parcel}') || ',' ||
       (select count(*) from public.office_creator_checks where parcel_id = '${parcel}') || ',' || (select count(*) from public.office_held_links where parcel_id = '${parcel}') || ',' ||
       (select count(*) from public.office_unmatched where matched_parcel_id = '${parcel}')`,
  );
/** 계정을 가리키는 칸 전부(public)에서 이 계정 ID 가 나오는 칸 — 탈퇴 처리 기록(account_withdrawals)은 뺀다 */
function referencesTo(profileId: string): string[] {
  const cols = psql(
    `select c.conrelid::regclass || '.' || a.attname from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and array_length(c.conkey, 1) = 1 and c.conrelid <> 'public.account_withdrawals'::regclass`,
  ).split("\n");
  return cols.filter((col) => {
    const dot = col.lastIndexOf(".");
    return Number(psql(`select count(*) from ${col.slice(0, dot)} where ${col.slice(dot + 1)} = '${profileId}'`)) > 0;
  });
}

describe("자동 삭제 — 사무실 상자가 있는 주문 (코드 리뷰 반영, my-account INV-A15·A16 · 카드 d123)", () => {
  it("INV-A15·A16: 상자가 모두 반송돼 주문 상태가 「검수 완료」에 머문 주문은 끝난 주문이다 — 팬·크리에이터가 탈퇴할 수 있고, 5년 1일 뒤 상자 기록까지 지워진다", async () => {
    const fan = await createTestAccount({ tag: "wdr1f", phone: null });
    const cre = await createTestAccount({ tag: "wdr1c", phone: null });
    const o = await shippedOrder({ senderId: fan.userId, creatorId: makeCreator(cre) });
    const parcel = officeTrail(o.orderId, { fanId: fan.userId, creatorProfileId: cre.userId, state: "returned" });
    expect(psql(`select status from public.orders where id = '${o.orderId}'`)).toBe("inspected");
    expect((await withdraw(fan.loginId)).error).toBeNull();
    expect((await withdraw(cre.loginId)).error).toBeNull();
    ageOrder(o.orderId, "5 years 1 day");
    ageOffice(parcel, "5 years 1 day");
    expect(purge().orders).toBeGreaterThanOrEqual(1);
    expect(orderRows(o.orderId)).toBe("0,0,0,0,0");
    expect(officeRows(parcel)).toBe("0,0,0,0,0");
  });

  it("INV-A15 (실패경로): 상자가 아직 사무실에 있는(검수 완료) 주문은 끝나지 않았다 — 탈퇴가 거부된다", async () => {
    const fan = await createTestAccount({ tag: "wdr2f", phone: null });
    const o = await shippedOrder({ senderId: fan.userId });
    psql(
      `begin; set local session_replication_role = replica;
       update public.office_parcels set state = 'inspected', received_at = now(), inspected_at = now() where box_id in (select b.id from public.boxes b where b.order_id = '${o.orderId}');
       update public.orders set status = 'inspected', shipped_at = null where id = '${o.orderId}'; commit;`,
    );
    expect((await withdraw(fan.loginId)).error?.code).toBe("55000");
  });

  it("카드 d123 (실패경로): 팬만 탈퇴한 5년 1일 된 주문 — 팬의 가명이 주문·상자 기록 어느 칸에도 남지 않는다(같이 쓰는 「탈퇴한 회원」으로)", async () => {
    const fan = await createTestAccount({ tag: "wdr3f", phone: null });
    const cre = await createTestAccount({ tag: "wdr3c", phone: null });
    const o = await shippedOrder({ senderId: fan.userId, creatorId: makeCreator(cre) });
    const parcel = officeTrail(o.orderId, { fanId: fan.userId, creatorProfileId: cre.userId, state: "returned" });
    const pseudonym = ((await withdraw(fan.loginId)).data as { pseudonym: string }).pseudonym;
    expect(referencesTo(pseudonym).sort()).toEqual(["office_held_links.account_id", "office_unmatched.nickname_profile_id", "orders.fan_id"]);
    ageOrder(o.orderId, "5 years 1 day");
    ageOffice(parcel, "5 years 1 day");
    purge();
    expect(referencesTo(pseudonym)).toEqual([]);
    expect(officeRows(parcel)).toBe("1,1,1,1,1");
    expect(psql(`select answered_by from public.office_creator_checks where parcel_id = '${parcel}'`)).toBe(cre.userId);
  });

  it("카드 d123 (실패경로): 크리에이터만 탈퇴한 5년 1일 된 주문 — 크리에이터의 가명(확인 답·답 기록)도 어느 칸에도 남지 않는다", async () => {
    const fan = await createTestAccount({ tag: "wdr4f", phone: null });
    const cre = await createTestAccount({ tag: "wdr4c", phone: null });
    const o = await shippedOrder({ senderId: fan.userId, creatorId: makeCreator(cre) });
    const parcel = officeTrail(o.orderId, { fanId: fan.userId, creatorProfileId: cre.userId, state: "returned" });
    const pseudonym = ((await withdraw(cre.loginId)).data as { pseudonym: string }).pseudonym;
    expect(referencesTo(pseudonym).sort()).toEqual(["office_creator_check_events.actor", "office_creator_checks.answered_by"]);
    ageOrder(o.orderId, "5 years 1 day");
    ageOffice(parcel, "5 years 1 day");
    purge();
    expect(referencesTo(pseudonym)).toEqual([]);
    expect(fanOf(o.orderId)).toBe(fan.userId);
  });

  it("INV-A16 (실패경로): 처분 시각도 「마지막 기록」이다 — 다른 기록은 5년 1일 전이어도 처분이 최근이면 남고, 처분도 5년 1일 전이면 지워진다", async () => {
    const fan = await createTestAccount({ tag: "wdr5f", phone: null });
    const cre = await createTestAccount({ tag: "wdr5c", phone: null });
    const o = await shippedOrder({ senderId: fan.userId, creatorId: makeCreator(cre) });
    const parcel = officeTrail(o.orderId, { fanId: fan.userId, creatorProfileId: cre.userId, state: "disposed" });
    expect((await withdraw(fan.loginId)).error).toBeNull();
    expect((await withdraw(cre.loginId)).error).toBeNull();
    ageOrder(o.orderId, "5 years 1 day");
    ageOffice(parcel, "5 years 1 day");
    purge();
    expect(orderRows(o.orderId).startsWith("1,")).toBe(true);
    backdate(`update public.office_disposals set at = at - interval '5 years 1 day' where parcel_id = '${parcel}'`);
    purge();
    expect(orderRows(o.orderId)).toBe("0,0,0,0,0");
  });

  it("INV-A16 (실패경로): 보류 상자가 이어진 시각도 「마지막 기록」이다 — 다른 기록은 5년 1일 전이어도 그것이 최근이면 남는다", async () => {
    const fan = await createTestAccount({ tag: "wdr6f", phone: null });
    const cre = await createTestAccount({ tag: "wdr6c", phone: null });
    const o = await shippedOrder({ senderId: fan.userId, creatorId: makeCreator(cre) });
    const parcel = officeTrail(o.orderId, { fanId: fan.userId, creatorProfileId: cre.userId, state: "returned" });
    expect((await withdraw(fan.loginId)).error).toBeNull();
    expect((await withdraw(cre.loginId)).error).toBeNull();
    ageOrder(o.orderId, "5 years 1 day");
    ageOffice(parcel, "5 years 1 day");
    backdate(`update public.office_unmatched set matched_at = now() where matched_parcel_id = '${parcel}'; update public.office_held_links set linked_at = now() - interval '5 years 1 day' where parcel_id = '${parcel}'`);
    purge();
    expect(orderRows(o.orderId).startsWith("1,")).toBe(true);
  });

  it("카드 d123: 탈퇴 때 가명으로 옮기는 칸 목록이 바뀌면 이 시험이 알린다 — 새 칸은 자동 삭제의 「같이 쓰는 표시로 바꾸기」와 함께 본다", () => {
    const moved = psql(
      `select c.conrelid::regclass || '.' || a.attname from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'f' and c.connamespace = 'public'::regnamespace and c.confrelid = 'public.profiles'::regclass
         and c.confdeltype <> 'c' and array_length(c.conkey, 1) = 1
         and c.conrelid not in ('public.creators'::regclass, 'public.account_withdrawals'::regclass) order by 1`,
    ).split("\n");
    expect(moved).toEqual(MOVED_PROFILE_COLUMNS);
  });
});

// 탈퇴 때 가명으로 옮기는 칸(지우면 함께 지워지는 칸 말고). 자동 삭제가 주문 줄을 남길 때 주문·상자에 달린 칸의 가명을 같이 쓰는 「탈퇴한 회원」으로 바꾼다.
// 운영자가 누른 기록(…_by·operator_id 등)은 탈퇴하는 회원을 가리키지 않는다. 칸이 늘면 이 목록과 retention_purge 의 바꾸는 칸을 같이 고친다.
const MOVED_PROFILE_COLUMNS = [
  "banner_changes.acted_by",
  "banners.created_by",
  "banners.updated_by",
  "creator_blocks.sender_id",
  "creator_channel_claims.account_id",
  "creator_verification_applications.account_id",
  "creator_verification_events.acted_by",
  "creator_verification_unlocks.account_id",
  "creator_verification_unlocks.acted_by",
  "inquiries.answered_by",
  "inquiry_restriction_events.acted_by",
  "inquiry_restrictions.restricted_by",
  "notices.author_id",
  "notices.updated_by",
  "office_code_inputs.operator_id",
  "office_creator_check_events.actor",
  "office_creator_checks.answered_by",
  "office_disposals.disposed_by",
  "office_envelope_shreds.shredded_by",
  "office_held_links.account_id",
  "office_held_links.linked_by",
  "office_inspections.inspected_by",
  "office_label_pending.operator_id",
  "office_not_mine_reports.reported_by",
  "office_parcels.hold_closed_by",
  "office_police_handovers.handed_by",
  "office_share_moves.moved_by",
  "office_storage_claims.decided_by",
  "office_unmatched.nickname_profile_id",
  "office_unmatched.recorded_by",
  "office_unmatched.returned_by",
  "office_unmatched_look_edits.edited_by",
  "order_cancellations.canceled_by",
  "orders.fan_id",
  "owner_setting.owner_user_id",
  "prohibited_item_changes.changed_by",
  "refunds.requested_by",
  "revgift_sends.sender_id",
  "revgift_shares.fan_id",
  "review_cancels.requested_by",
  "tier_price_changes.changed_by",
];
