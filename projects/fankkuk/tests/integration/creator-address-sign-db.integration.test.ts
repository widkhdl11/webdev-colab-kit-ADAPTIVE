import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminClient, linkTestSignature, psql, psqlError, seedCreatorAddress } from "./helpers";
import { sampleEnvelope } from "./revgift-helpers";
import { createTestCreator, removeTestCreator, TEST_CREATOR } from "./test-creator";

// 크리에이터 주소 저장 서명 — 요청 줄·결과 적기·가입 갈음·한도 (address-protection INV-P22 ①~⑤, S22~S22e). supabase/manual/0040 을 적용해야 돈다(manual/0040 뒤).
// 앱 서버가 부르는 순서 그대로 서비스 키로 부른다: start_creator_address_sign → record_creator_address_sign_tx → (창구 결과) → settle_creator_address_sign.
// 시험 전용 크리에이터(test-creator.ts — 승인 서명 연결 fake 가 있다)의 칸만 쓰고, 끝나면 그 크리에이터를 통째로 지운다.

const CREATOR_ID = TEST_CREATOR.creatorId;
const ACTOR = TEST_CREATOR.profileId;

type StartRow = { result: string; request_id: string | null; payload: string | null; expires_at: string | null; envelope: unknown; creator_id: string | null };

const admin = () => adminClient();
async function start(envelope: unknown, opts: { label?: string; region?: string; resend?: boolean; method?: string } = {}): Promise<StartRow> {
  const { data, error } = await admin().rpc("start_creator_address_sign", {
    p_actor_id: ACTOR,
    p_envelope: envelope,
    p_label: opts.label ?? "home",
    p_region: opts.region ?? "none",
    p_method: opts.method ?? "fake",
    p_resend: opts.resend ?? false,
  });
  if (error) throw new Error(`요청 함수 오류: ${error.code} ${error.message}`);
  return (data as StartRow[])[0]!;
}
const recordTx = async (id: string) => (await admin().rpc("record_creator_address_sign_tx", { p_actor_id: ACTOR, p_request_id: id, p_tx_id: `fake-${id}` })).data;
async function settle(id: string, outcome: string, content: string | null, method = "fake"): Promise<string> {
  const { data, error } = await admin().rpc("settle_creator_address_sign", { p_actor_id: ACTOR, p_request_id: id, p_outcome: outcome, p_signed_content: content, p_method: method });
  if (error) throw new Error(`결과 함수 오류: ${error.code}`);
  return (data as { result: string }[])[0]!.result;
}

const storedEnvelope = () => psql(`select coalesce(envelope::text, '-') from pii.creator_addresses where creator_id = '${CREATOR_ID}'`);
const eventCount = () => Number(psql(`select count(*) from pii.creator_address_events where creator_id = '${CREATOR_ID}'`));
const lastEvent = () => psql(`select event || '|' || method || '|' || coalesce(sign_request_id::text, '-') from pii.creator_address_events where creator_id = '${CREATOR_ID}' order by at desc, id desc limit 1`);
const requestRow = (id: string) => psql(`select state || '|' || (envelope is null)::text from pii.creator_address_sign_requests where id = '${id}'`);
const clearRequests = () => psql(`delete from pii.creator_address_sign_requests where creator_id = '${CREATOR_ID}'`);
const clearAddress = () => psql(`delete from pii.creator_addresses where creator_id = '${CREATOR_ID}'`);
const clearSignup = () => psql(`delete from pii.signup_sign_requests where creator_id = '${CREATOR_ID}'`);
/** 가입 3단계 서명이 검증되고 계정에 쓰인 줄(used)을 「지금 − ago」에 끝난 것으로 넣는다 — 갈음 판정 재료(INV-P22 ④) */
function signupVerified(ago: string): string {
  const id = psql("select gen_random_uuid()");
  psql(
    `insert into pii.signup_sign_requests (id, ticket, creator_id, phone_hash, ip_hash, envelope, payload, method, requested_at, expires_at, state, finished_at)
     values ('${id}', gen_random_uuid(), '${CREATOR_ID}', repeat('a', 64), repeat('b', 64), null,
             'fankkuk-signature-link:v1|req=${id}|at=2026-11-17T00:00:00.000Z', 'fake',
             now() - interval '${ago}' - interval '1 minute', now() - interval '${ago}' + interval '4 minutes', 'used', now() - interval '${ago}')`,
  );
  return id;
}
/** 갈음 시간 경계 — 함수 본문의 값을 그대로 읽는다(시험에 숫자를 따로 적지 않게) */
const signupWindowMinutes = () =>
  Number(psql("select substring(prosrc from 'r.finished_at > v_now - interval ''([0-9]+) minutes''') from pg_proc where proname = 'start_creator_address_sign'"));

beforeAll(() => {
  removeTestCreator();
  createTestCreator();
});
beforeEach(() => {
  clearRequests();
  clearSignup();
  linkTestSignature(CREATOR_ID);
});
afterAll(() => {
  clearSignup();
  removeTestCreator();
});

describe("INV-P22 ①②: 요청으로는 저장하지 않고, 검증된 서명 결과로만 저장한다 (manual/0040 뒤)", () => {
  it("INV-P22 S22: 주소가 있는 크리에이터가 새 주소로 요청하면 주소 칸 그대로·요청 줄 하나(봉인·원문·5분) → signed 로 적으면 새 봉인·기록 한 줄(changed, fake, 요청 ID)·요청 끝남·봉인 지움", async () => {
    clearAddress();
    const old = sampleEnvelope();
    seedCreatorAddress(CREATOR_ID, ACTOR, old);
    const before = eventCount();
    const next = sampleEnvelope();

    const r = await start(next, { label: "studio" });
    expect(r.result).toBe("started");
    expect(r.creator_id).toBe(CREATOR_ID);
    expect(r.envelope).not.toBeNull(); // 연결 봉투 — 서명 대상 지정
    expect(JSON.stringify(r.envelope)).not.toBe(JSON.stringify(next));
    expect(JSON.parse(storedEnvelope())).toEqual(old);
    expect(eventCount()).toBe(before);
    const id = r.request_id!;
    expect(psql(`select (envelope = '${JSON.stringify(next)}'::jsonb)::text || '|' || state || '|' || (expires_at - requested_at)::text from pii.creator_address_sign_requests where id = '${id}'`)).toBe("true|pending|00:05:00");
    // 원문: 등록/변경 · 요청 ID · 요청 시각 · 이름표 — 주소 값이 없다
    expect(r.payload).toMatch(new RegExp(`^팬꾹 배송지 변경\\n요청 ID: ${id}\\n요청 시각: [0-9T:.Z-]+\\n주소 별칭: 작업실$`));
    expect(r.payload).not.toContain(String(next.ciphertext));

    expect(await recordTx(id)).toBe("recorded");
    expect(await settle(id, "signed", r.payload)).toBe("saved");
    expect(JSON.parse(storedEnvelope())).toEqual(next);
    expect(psql(`select label from pii.creator_addresses where creator_id = '${CREATOR_ID}'`)).toBe("studio");
    expect(eventCount()).toBe(before + 1);
    expect(lastEvent()).toBe(`changed|fake|${id}`);
    expect(requestRow(id)).toBe("saved|true");
  });

  it("INV-P22 S22: 주소가 없으면 원문은 「등록」, 저장 기록은 registered", async () => {
    clearAddress();
    const r = await start(sampleEnvelope());
    expect(r.payload).toMatch(/^팬꾹 배송지 등록\n/);
    await recordTx(r.request_id!);
    expect(await settle(r.request_id!, "signed", r.payload)).toBe("saved");
    expect(lastEvent()).toBe(`registered|fake|${r.request_id}`);
  });

  it("INV-P22 ② S22a (실패경로): 서명 거절 · 5분 지남 · 서명된 원문이 다름 — 주소 칸 그대로, 기록 없음, 요청 줄의 봉인 주소 지움", async () => {
    clearAddress();
    const old = sampleEnvelope();
    seedCreatorAddress(CREATOR_ID, ACTOR, old);
    const before = eventCount();

    const rejected = await start(sampleEnvelope(), { resend: true });
    await recordTx(rejected.request_id!);
    expect(await settle(rejected.request_id!, "rejected", null)).toBe("rejected");
    expect(requestRow(rejected.request_id!)).toBe("rejected|true");

    const late = await start(sampleEnvelope(), { resend: true });
    await recordTx(late.request_id!);
    psql(`update pii.creator_address_sign_requests set requested_at = requested_at - interval '6 minutes', expires_at = expires_at - interval '6 minutes' where id = '${late.request_id}'`);
    // 서명된 원문을 그대로 내도 기한이 지났으면 저장하지 않는다
    expect(await settle(late.request_id!, "signed", late.payload)).toBe("expired");
    expect(requestRow(late.request_id!)).toBe("expired|true");

    const mismatch = await start(sampleEnvelope(), { resend: true });
    await recordTx(mismatch.request_id!);
    expect(await settle(mismatch.request_id!, "signed", `${mismatch.payload} `)).toBe("failed");
    expect(requestRow(mismatch.request_id!)).toBe("failed|true");

    expect(JSON.parse(storedEnvelope())).toEqual(old);
    expect(eventCount()).toBe(before);
  });

  it("INV-P22 ② S22a (실패경로): 결과 확인 전 읽기에서 기한이 지났으면 expired 로 끝내고 봉인을 지운다 — 원문을 돌려주지 않는다", async () => {
    const r = await start(sampleEnvelope());
    psql(`update pii.creator_address_sign_requests set requested_at = requested_at - interval '6 minutes', expires_at = expires_at - interval '6 minutes' where id = '${r.request_id}'`);
    const { data } = await admin().rpc("creator_address_sign_request", { p_actor_id: ACTOR, p_request_id: r.request_id });
    expect(data).toEqual([{ state: "expired", payload: null, method: null, gateway_tx_id: null }]);
    expect(requestRow(r.request_id!)).toBe("expired|true");
  });

  it("INV-P22 ② (실패경로): 거래 ID 가 없거나(게이트웨이를 거치지 않음) 방식이 요청 때와 다르면 저장하지 않는다", async () => {
    clearAddress();
    const noTx = await start(sampleEnvelope());
    expect(await settle(noTx.request_id!, "signed", noTx.payload)).toBe("failed");
    const other = await start(sampleEnvelope(), { resend: true });
    await recordTx(other.request_id!);
    expect(await settle(other.request_id!, "signed", other.payload, "kakao")).toBe("method_refused");
    // 방식이 다르면 그 자리에서 끝낸다 — 봉인이 기한까지 남지 않는다(보안 리뷰 낮음)
    expect(requestRow(other.request_id!)).toBe("failed|true");
    expect(storedEnvelope()).toBe("");
  });

  it("INV-P13 (실패경로): 탈퇴한 크리에이터의 요청은 거래 ID 적기·읽기·끝내기 모두 없는 요청과 같다", async () => {
    const r = await start(sampleEnvelope());
    psql(`begin; set local session_replication_role = replica; update public.creators set withdrawn_at = now() where id = '${CREATOR_ID}'; commit;`);
    try {
      expect(await recordTx(r.request_id!)).toBe("not_found");
      expect((await admin().rpc("creator_address_sign_request", { p_actor_id: ACTOR, p_request_id: r.request_id })).data).toEqual([{ state: "not_found", payload: null, method: null, gateway_tx_id: null }]);
      expect((await admin().rpc("close_creator_address_sign", { p_actor_id: ACTOR, p_request_id: r.request_id })).data).toBe("not_found");
    } finally {
      psql(`begin; set local session_replication_role = replica; update public.creators set withdrawn_at = null where id = '${CREATOR_ID}'; commit;`);
    }
  });

  it("INV-P22 (실패경로): 표에 직접 넣어도 끝난 줄은 봉인 주소를 가질 수 없다", async () => {
    const r = await start(sampleEnvelope());
    expect(psqlError(`update pii.creator_address_sign_requests set state = 'failed', finished_at = now() where id = '${r.request_id}'`)).not.toBeNull();
  });
});

describe("INV-P22 ③: 기다리는 요청 하나 · 1시간 5번", () => {
  it("INV-P22 S22b: 같은 봉인 주소로 다시 누르면 같은 요청(pending) — 새 줄이 생기지 않는다. 「다시 보내기」(resend)는 앞 요청을 끝내고 새로", async () => {
    const env = sampleEnvelope();
    const first = await start(env);
    const again = await start(env);
    expect(again.result).toBe("pending");
    expect(again.request_id).toBe(first.request_id);
    expect(again.envelope).toBeNull();
    const resent = await start(env, { resend: true });
    expect(resent.result).toBe("started");
    expect(resent.request_id).not.toBe(first.request_id);
    expect(requestRow(first.request_id!)).toBe("superseded|true");
    expect(psql(`select count(*) from pii.creator_address_sign_requests where creator_id = '${CREATOR_ID}' and state = 'pending'`)).toBe("1");
  });

  it("INV-P22 S22b (실패경로): 같은 크리에이터 1시간 안 다섯 번 뒤 여섯 번째는 요청 없음·한도 답", async () => {
    for (let i = 0; i < 5; i += 1) expect((await start(sampleEnvelope(), { resend: true })).result).toBe("started");
    const rows = psql(`select count(*) from pii.creator_address_sign_requests where creator_id = '${CREATOR_ID}'`);
    expect((await start(sampleEnvelope(), { resend: true })).result).toBe("too_many");
    expect(psql(`select count(*) from pii.creator_address_sign_requests where creator_id = '${CREATOR_ID}'`)).toBe(rows);
  });

  it("INV-P22 S22b (실패경로): 1시간이 지났어도 오늘(한국 시간) 다섯 번이면 하루 한도 답", async () => {
    for (let i = 0; i < 5; i += 1) await start(sampleEnvelope(), { resend: true });
    // 다섯 줄을 1시간 전으로 — 단 오늘 안(자정 직후에 돌리면 어제로 넘어가므로, 오늘 0시와 1시간 전 중 늦은 때로)
    psql(
      `update pii.creator_address_sign_requests set requested_at = greatest(now() - interval '61 minutes', date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
              expires_at = greatest(now() - interval '61 minutes', date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') + interval '5 minutes'
        where creator_id = '${CREATOR_ID}'`,
    );
    const r = await start(sampleEnvelope(), { resend: true });
    expect(["too_many_day", "too_many"]).toContain(r.result);
    if (psql("select (now() - (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')) > interval '61 minutes'") === "t") expect(r.result).toBe("too_many_day");
  });
});

describe("INV-P22 ④: 가입 3단계 서명 직후 첫 등록은 갈음", () => {
  it("INV-P22 S22c: 가입 서명 확인 3분 뒤·주소 없음 → 요청 없이 저장, 기록 방식 signup(가입 서명 요청 ID)", async () => {
    clearAddress();
    const signupId = signupVerified("3 minutes");
    const env = sampleEnvelope();
    const r = await start(env);
    expect(r.result).toBe("saved_signup");
    expect(r.request_id).toBeNull();
    expect(JSON.parse(storedEnvelope())).toEqual(env);
    expect(lastEvent()).toBe(`registered|signup|${signupId}`);
    expect(psql(`select count(*) from pii.creator_address_sign_requests where creator_id = '${CREATOR_ID}'`)).toBe("0");
  });

  it("INV-P22 S22c (실패경로): 정한 시간(+1분) 뒤의 첫 등록은 서명 요청으로 간다", async () => {
    clearAddress();
    signupVerified(`${signupWindowMinutes() + 1} minutes`);
    expect((await start(sampleEnvelope())).result).toBe("started");
    expect(storedEnvelope()).toBe("");
  });

  it("INV-P22 S22c (실패경로): 이미 주소가 있으면 가입 서명 직후라도 서명 요청으로 간다", async () => {
    clearAddress();
    const old = sampleEnvelope();
    seedCreatorAddress(CREATOR_ID, ACTOR, old);
    signupVerified("3 minutes");
    expect((await start(sampleEnvelope())).result).toBe("started");
    expect(JSON.parse(storedEnvelope())).toEqual(old);
  });

  it("INV-P22 S22c (실패경로): 검증만 되고 계정에 쓰이지 않은 가입 서명(verified)·다른 크리에이터의 가입 서명은 갈음 재료가 아니다", async () => {
    clearAddress();
    const id = signupVerified("3 minutes");
    psql(`update pii.signup_sign_requests set state = 'verified' where id = '${id}'`);
    expect((await start(sampleEnvelope())).result).toBe("started");
    clearRequests();
    psql(`update pii.signup_sign_requests set state = 'used', creator_id = gen_random_uuid() where id = '${id}'`);
    expect((await start(sampleEnvelope())).result).toBe("started");
    expect(storedEnvelope()).toBe("");
  });
});

describe("INV-P22 ①·⑤: 연결 없음 · 방식", () => {
  it("INV-P22 S22d (실패경로): 승인 서명 연결이 없는 크리에이터는 요청 없음·not_linked", async () => {
    psql(`delete from pii.signature_links where creator_id = '${CREATOR_ID}'`);
    const r = await start(sampleEnvelope());
    expect(r.result).toBe("not_linked");
    expect(psql(`select count(*) from pii.creator_address_sign_requests where creator_id = '${CREATOR_ID}'`)).toBe("0");
  });

  it("INV-P22 ⑤ (실패경로): 가짜 서명 허용 줄이 없는 DB(운영)에서는 fake 요청을 받지 않는다", () => {
    const out = psql(
      `begin; delete from public.local_dev_flags; select result from public.start_creator_address_sign('${ACTOR}'::uuid, '${JSON.stringify(sampleEnvelope())}'::jsonb, 'home', 'none', 'fake', false); rollback;`,
    );
    expect(out.split("\n")).toContain("method_refused");
  });
});

describe("INV-P22 강제 위치: 서버 키로도 검증된 요청 없이는 주소를 못 쓴다", () => {
  it("INV-P22 S22e (실패경로): 옛 바로 저장 함수는 없고, 주소 칸을 쓰는 내부 함수는 서비스 키에 실행 권한이 없다 — 주소 칸 그대로", async () => {
    clearAddress();
    const old = sampleEnvelope();
    seedCreatorAddress(CREATOR_ID, ACTOR, old);
    const r = await admin().rpc("set_creator_address", { p_actor_id: ACTOR, p_envelope: sampleEnvelope(), p_label: "home", p_region: "none", p_method: "fake" });
    expect(r.error).not.toBeNull();
    expect(psql("select has_function_privilege('service_role', 'pii.write_creator_address(uuid, uuid, jsonb, text, text, text, uuid)', 'execute')")).toBe("f");
    expect(psql("select has_function_privilege('authenticated', 'pii.write_creator_address(uuid, uuid, jsonb, text, text, text, uuid)', 'execute')")).toBe("f");
    const viaSchema = await admin().schema("pii").rpc("write_creator_address", {
      p_creator_id: CREATOR_ID, p_actor_id: ACTOR, p_envelope: sampleEnvelope(), p_label: "home", p_region: "none", p_method: "fake", p_sign_request_id: CREATOR_ID,
    });
    expect(viaSchema.error).not.toBeNull();
    expect(JSON.parse(storedEnvelope())).toEqual(old);
  });

  it("INV-P22 S22e (실패경로): 없는 요청 ID 로 signed 를 적어도 not_found — 주소 칸 그대로", async () => {
    clearAddress();
    expect(await settle(psql("select gen_random_uuid()"), "signed", "팬꾹 배송지 등록")).toBe("not_found");
    expect(storedEnvelope()).toBe("");
  });

  it("INV-P13 (실패경로): 남의 요청은 읽기·적기 모두 없는 요청과 같다", async () => {
    const r = await start(sampleEnvelope());
    await recordTx(r.request_id!);
    const other = "00000000-0000-4000-a000-000000000011"; // 시드 크리에이터 하루
    expect((await admin().rpc("creator_address_sign_request", { p_actor_id: other, p_request_id: r.request_id })).data).toEqual([{ state: "not_found", payload: null, method: null, gateway_tx_id: null }]);
    expect((await admin().rpc("settle_creator_address_sign", { p_actor_id: other, p_request_id: r.request_id, p_outcome: "signed", p_signed_content: r.payload, p_method: "fake" })).data).toEqual([{ result: "not_found" }]);
    expect(requestRow(r.request_id!)).toBe("pending|false");
  });
});
