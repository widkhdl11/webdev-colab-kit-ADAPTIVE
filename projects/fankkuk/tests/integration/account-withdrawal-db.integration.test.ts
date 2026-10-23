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
    expect(Number(psql(`select count(*) from public.profiles where nickname = '탈퇴한 회원'`))).toBe(0);
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
