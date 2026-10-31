import { afterEach, describe, expect, it } from "vitest";
import { loginLinksOf } from "@/entities/session/api/login-links";
import { loginLinkTokenHash, newLoginLinkToken } from "@/entities/session/model/login-link";
import { adminClient, anonClient, deleteTestOrders, holdRowLock, psql, SEED, signedInClient } from "./helpers";
import { paidGift } from "./office-helpers";

// 1회용 로그인 토큰 — DB 층 (docs/specs/link-login.md INV-K1·K2).
// 시각이 걸린 시험(S1d)은 기다리지 않고 토큰 줄의 만든 시각·만료 시각을 같이 당겨 「그만큼 시간이 흐른 상태」를 만든다.
// 유효 시간은 숫자로 쓰지 않고 DB 함수(login_link_ttl)에서 읽는다.

const OUTBOX = "public.notification_outbox";
const TEMPLATES = "public.notification_kakao_templates";
const TOKENS = "public.login_link_tokens";
const FAILURES = "public.login_link_failures";
const HARU_ACCOUNT = SEED.creatorProfileId;

afterEach(() => {
  deleteTestOrders();
  psql(`delete from ${OUTBOX}; delete from ${TEMPLATES}; delete from ${TOKENS}; delete from ${FAILURES};`);
});

/** 하루에게 결제된 선물 하나 → 카카오 승인 요청 줄을 「보내는 중」으로 꺼낸 상태. 그 줄 id */
async function sendingKakaoApprovalRow(): Promise<string> {
  psql(`insert into ${TEMPLATES} (kind, template_code) values ('approval_request', 'TPL_APPROVAL') on conflict (kind) do nothing`);
  const g = await paidGift();
  const id = psql(`select id from ${OUTBOX} where order_id = '${g.orderId}' and kind = 'approval_request' and channel = 'kakao'`);
  expect(id).not.toBe("");
  psql(`update ${OUTBOX} set next_attempt_at = case when id = '${id}' then now() - interval '1 minute' else now() + interval '1 day' end where status = 'pending'`);
  const r = await adminClient().rpc("notification_claim", { p_limit: 5 });
  if (r.error) throw new Error(`notification_claim 실패: ${r.error.message}`);
  expect(psql(`select status from ${OUTBOX} where id = '${id}'`)).toBe("sending");
  return id;
}

async function issued(outboxId: string): Promise<{ token: string; hash: string }> {
  const token = await loginLinksOf(adminClient()).issue(outboxId);
  if (!token) throw new Error("발급되지 않았다");
  return { token, hash: loginLinkTokenHash(token) };
}

const consume = (hash: string) => loginLinksOf(adminClient()).consume(hash);
const ttlSeconds = () => Number(psql(`select extract(epoch from public.login_link_ttl())::int`));
const failures = () => psql(`select hash_prefix || '|' || reason from ${FAILURES} order by id`);

/** 토큰 줄의 만든 시각·만료 시각을 seconds 만큼 과거로 */
function ageToken(hash: string, seconds: number): void {
  psql(`update ${TOKENS} set created_at = created_at - make_interval(secs => ${seconds}), expires_at = expires_at - make_interval(secs => ${seconds}) where token_hash = '${hash}'`);
}

describe("INV-K1: 보내는 순간 받는 크리에이터 계정 하나에 묶이고, 해시만 저장된다", () => {
  it("INV-K1 (S1): 보내는 중인 카카오 승인 요청 줄로 발급하면 그 줄의 받는 계정(하루)에 묶이고 만료는 만든 시각 + 30분", async () => {
    const row = await sendingKakaoApprovalRow();
    const { hash } = await issued(row);
    expect(psql(`select account_id from ${TOKENS} where token_hash = '${hash}'`)).toBe(HARU_ACCOUNT);
    expect(psql(`select account_id from ${OUTBOX} where id = '${row}'`)).toBe(HARU_ACCOUNT);
    expect(Number(psql(`select extract(epoch from expires_at - created_at)::int from ${TOKENS} where token_hash = '${hash}'`))).toBe(ttlSeconds());
    expect(ttlSeconds()).toBe(30 * 60);
    expect(psql(`select used_at is null from ${TOKENS} where token_hash = '${hash}'`)).toBe("t");
  });

  it("INV-K1 (S3): 토큰 표의 칸은 해시·계정·만든 시각·만료 시각·쓴 시각뿐이고, 어느 칸에도 원문이 없다", async () => {
    const row = await sendingKakaoApprovalRow();
    const { token } = await issued(row);
    expect(psql(`select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'login_link_tokens'`)).toBe(
      "token_hash,account_id,created_at,expires_at,used_at",
    );
    expect(psql(`select count(*) from ${TOKENS} t where t::text like '%${token}%'`)).toBe("0");
    expect(psql(`select count(*) from ${OUTBOX} o where o::text like '%${token}%'`)).toBe("0");
  });

  it("INV-K1 (S1e, 실패경로): 발급 함수는 줄 id 와 해시만 받는다 — 계정을 고르는 인자가 없고, 토큰 표를 쓰는 다른 함수도 없다", () => {
    expect(psql(`select pg_get_function_identity_arguments('public.login_link_issue'::regproc)`)).toBe("p_outbox_id uuid, p_token_hash text");
    expect(psql(`select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc like '%login_link_tokens%'`)).toBe(
      "login_link_consume,login_link_issue",
    );
  });

  it("INV-K1 (S1e, 실패경로): 이메일 줄·대기 줄(보내는 중 아님)·다른 종류 줄로는 발급되지 않는다", async () => {
    const row = await sendingKakaoApprovalRow();
    const orderId = psql(`select order_id from ${OUTBOX} where id = '${row}'`);
    const emailRow = psql(`select id from ${OUTBOX} where order_id = '${orderId}' and kind = 'approval_request' and channel = 'email'`);
    expect(psql(`select status from ${OUTBOX} where id = '${emailRow}'`)).toBe("pending");
    const links = loginLinksOf(adminClient());
    expect(await links.issue(emailRow)).toBeNull();
    // 같은 카카오 줄이 끝나면(보냄) 더는 발급되지 않는다
    psql(`update ${OUTBOX} set status = 'sent', finished_at = now(), claimed_at = null where id = '${row}'`);
    expect(await links.issue(row)).toBeNull();
    expect(await links.issue("00000000-0000-4000-a000-0000000000ff")).toBeNull();
    expect(psql(`select count(*) from ${TOKENS}`)).toBe("0");
  });

  it("INV-K1 (S1e): 다른 크리에이터(모모)의 승인 요청 줄에서 나온 토큰은 모모 계정으로만", async () => {
    psql(`insert into ${TEMPLATES} (kind, template_code) values ('approval_request', 'TPL_APPROVAL') on conflict (kind) do nothing`);
    const momo = await paidGift(1, "00000000-0000-4000-b000-000000000002");
    const id = psql(`select id from ${OUTBOX} where order_id = '${momo.orderId}' and kind = 'approval_request' and channel = 'kakao'`);
    psql(`update ${OUTBOX} set next_attempt_at = case when id = '${id}' then now() - interval '1 minute' else now() + interval '1 day' end where status = 'pending'`);
    await adminClient().rpc("notification_claim", { p_limit: 5 });
    const { hash } = await issued(id);
    expect(await consume(hash)).toBe("00000000-0000-4000-a000-000000000012");
  });

  it("INV-K1 (실패경로): 화면 쪽 키는 표를 읽지 못하고 두 함수를 부르지 못한다. 앱 서버 키도 표에 직접 닿지 않는다", async () => {
    const row = await sendingKakaoApprovalRow();
    const { hash } = await issued(row);
    const fan = await signedInClient("byeolbit_fan");
    for (const client of [anonClient(), fan]) {
      expect((await client.rpc("login_link_issue", { p_outbox_id: row, p_token_hash: newLoginLinkToken().hash })).error).not.toBeNull();
      expect((await client.rpc("login_link_consume", { p_token_hash: hash })).error).not.toBeNull();
      expect((await client.from("login_link_tokens").select("*")).error).not.toBeNull();
      expect((await client.from("login_link_failures").select("*")).error).not.toBeNull();
    }
    expect((await adminClient().from("login_link_tokens").select("*")).error).not.toBeNull();
    expect((await adminClient().from("login_link_tokens").insert({ token_hash: newLoginLinkToken().hash, account_id: HARU_ACCOUNT, expires_at: new Date().toISOString() })).error).not.toBeNull();
    expect(psql(`select used_at is null from ${TOKENS} where token_hash = '${hash}'`)).toBe("t");
  });

  it("INV-K1 (실패경로): 해시 꼴이 아닌 값(원문 등)은 발급 함수가 받지 않는다", async () => {
    const row = await sendingKakaoApprovalRow();
    const r = await adminClient().rpc("login_link_issue", { p_outbox_id: row, p_token_hash: newLoginLinkToken().token });
    expect(r.error).not.toBeNull();
    expect(psql(`select count(*) from ${TOKENS}`)).toBe("0");
  });
});

describe("INV-K2: 토큰은 한 번만 쓰인다", () => {
  it("INV-K2 (S1·S1b): 첫 쓰기는 계정 id 와 쓴 시각, 둘째는 null 과 실패 기록 「이미 씀」(해시 앞 8자)", async () => {
    const { hash } = await issued(await sendingKakaoApprovalRow());
    expect(await consume(hash)).toBe(HARU_ACCOUNT);
    expect(psql(`select used_at is not null from ${TOKENS} where token_hash = '${hash}'`)).toBe("t");
    expect(await consume(hash)).toBeNull();
    expect(failures()).toBe(`${hash.slice(0, 8)}|used`);
  });

  it("INV-K2 (실패경로): 없는 토큰은 null 과 「없음」 — 해시 앞 8자만 남긴다", async () => {
    const { token, hash } = newLoginLinkToken();
    expect(await consume(hash)).toBeNull();
    expect(failures()).toBe(`${hash.slice(0, 8)}|unknown`);
    expect(psql(`select count(*) from ${FAILURES} f where f::text like '%${hash}%' or f::text like '%${token}%'`)).toBe("0");
  });

  it("INV-K2 · INV-K1 (S1d): 만든 지 29분 59초면 쓰인다", async () => {
    const { hash } = await issued(await sendingKakaoApprovalRow());
    ageToken(hash, ttlSeconds() - 1);
    expect(await consume(hash)).toBe(HARU_ACCOUNT);
  });

  it("INV-K2 · INV-K1 (S1d, 실패경로): 만든 지 30분이면 쓰이지 않고 「만료」, 쓴 시각도 남지 않는다", async () => {
    const { hash } = await issued(await sendingKakaoApprovalRow());
    ageToken(hash, ttlSeconds());
    expect(await consume(hash)).toBeNull();
    expect(failures()).toBe(`${hash.slice(0, 8)}|expired`);
    expect(psql(`select used_at is null from ${TOKENS} where token_hash = '${hash}'`)).toBe("t");
  });

  it("INV-K2 (S1c, 동시): 같은 토큰 쓰기 둘이 동시에 와도 계정 id 를 받는 것은 하나", async () => {
    const { hash } = await issued(await sendingKakaoApprovalRow());
    const lock = await holdRowLock(`select 1 from ${TOKENS} where token_hash = '${hash}' for update`, 1);
    const both = Promise.all([consume(hash), consume(hash)]);
    await lock.released;
    const results = await both;
    expect(results.filter((r) => r === HARU_ACCOUNT)).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(failures()).toBe(`${hash.slice(0, 8)}|used`);
  });

  it("INV-K2 (실패경로): 해시 꼴이 아니면 null — 실패 기록도 남기지 않는다(앱은 늘 해시를 보낸다)", async () => {
    expect(await consume("not-a-hash")).toBeNull();
    expect(failures()).toBe("");
  });
});
