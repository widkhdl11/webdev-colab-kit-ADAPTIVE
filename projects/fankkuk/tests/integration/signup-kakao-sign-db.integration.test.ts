import { randomBytes } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { checkCreatorSign, startCreatorSign } from "@/features/signup/model/creator-sign";
import { signUp } from "@/features/signup/model/sign-up";
import type { ApprovalSigner } from "@/shared/api/approval-signer/signer";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import {
  adminClient,
  anonClient,
  deleteTestSignups,
  dummySignupEnvelope,
  phoneKeyEnv,
  psql,
  requestTestPhoneCode,
  signedTestPhone,
  TEST_SIGNUP_PHONE_PREFIX,
  testPhoneBundle,
  testPhoneHash,
  testPhoneKeys,
  verifiedTestPhone,
} from "./helpers";
import { checkPhoneCode, startPhoneVerification } from "@/features/signup/model/phone-verification";
import { readPhoneCodeSecret } from "@/shared/api/phone-verifier/verifier";

// (manual/0037 뒤) 크리에이터 가입 3단계 카카오 서명 — 실제 DB·실제 Supabase Auth 로(signup INV-U19·U20, approval-signature INV-S16 S16e).
// 0037 적용 전에는 서명 함수가 없어 모두 실패한다(「현재 회원가입을 이용할 수 없습니다」 또는 함수 없음). 서명 창구는 가짜(fake)다.
// 시험 계정은 it_ks 로 시작하는 아이디, 0109000 의 7000번대 번호만 쓴다 — 끝나면 지운다.

const dev = { NODE_ENV: "development", ...phoneKeyEnv() };
const TERMS = [
  { key: "age14", version: "2026-10-29" },
  { key: "service", version: "2026-10-01" },
  { key: "privacy", version: "2026-10-01" },
];

let seq = 7000;
function phone(): string {
  seq += 1;
  return `${TEST_SIGNUP_PHONE_PREFIX}${String(seq).padStart(4, "0")}`;
}
const ip = () => randomBytes(32).toString("hex");
const soop = () => psql(`select id from public.creator_tag_options where name = 'SOOP'`);

function signDeps(signer: ApprovalSigner | null = chooseApprovalSigner({ NODE_ENV: "test" })) {
  return { admin: adminClient(), signer, phoneKeys: testPhoneKeys };
}

function creatorBody(loginId: string, p: string, verificationId: string) {
  return {
    role: "creator",
    loginId,
    nickname: loginId.slice(0, 12),
    email: `${loginId.replace("_", ".")}@example.com`,
    password: "long-enough-pw1",
    phone: p,
    terms: { age14: true, service: true, privacy: true, news: false },
    verificationId,
    creator: { tagIds: [soop()], customTag: "" },
  };
}
function fanBody(loginId: string, p: string, verificationId: string) {
  const body: Record<string, unknown> = { ...creatorBody(loginId, p, verificationId), role: "fan" };
  delete body.creator;
  return body;
}
function signUpDeps() {
  return { env: dev, admin: adminClient(), auth: anonClient().auth, getMailer: () => ({ send: async () => {}, appOrigin: "http://127.0.0.1:3311" }) };
}

const creatorOf = (loginId: string) => psql(`select coalesce((select c.id::text from public.creators c join public.profiles p on p.id = c.profile_id where p.login_id = '${loginId}'), '')`);
const linkOf = (creatorId: string) => psql(`select coalesce((select method || '|' || (envelope->>'iv') from pii.signature_links where creator_id = '${creatorId}'), '')`);
const profileCount = (loginId: string) => psql(`select count(*) from public.profiles where login_id = '${loginId}'`);
const requestOf = (ticket: string) => psql(`select state || '|' || (envelope is null) from pii.signup_sign_requests where ticket = '${ticket}'`);

/** 서명 요청만 만든다(결과 확인 전) */
async function startOnly(p: string, signer?: ApprovalSigner) {
  const r = await startCreatorSign(signDeps(signer), { identity: dummySignupEnvelope(), creatorId: crypto.randomUUID(), phone: p }, ip(), null);
  if (!r.ok || r.state !== "pending") throw new Error(`요청 실패: ${JSON.stringify(r)}`);
  return r;
}

/** 창구가 늘 장애로 답하는 서명 창구 */
const downSigner: ApprovalSigner = {
  kind: "fake",
  requestSignature: async () => ({ ok: false, down: true }),
  signatureResult: async () => ({ state: "unavailable" }),
};

/** 장애 대비 길: 서명 요청이 장애로 끝난 번호표를 앞 번호표로 넘겨 인증번호를 받고 맞힌다 */
async function downCodeTicket(p: string): Promise<string> {
  const down = await startCreatorSign(signDeps(downSigner), { identity: dummySignupEnvelope(), creatorId: crypto.randomUUID(), phone: p }, ip(), null);
  if (!down.ok || down.state !== "down") throw new Error(`장애 판정 실패: ${JSON.stringify(down)}`);
  let text = "";
  const verifier = { kind: "fake" as const, sendKakaoCode: async () => false, sendSms: async (_to: string, body: string) => void (text = body) };
  const deps = { admin: adminClient(), verifier, codeSecret: () => readPhoneCodeSecret({ NODE_ENV: "test" }), phoneKeys: testPhoneKeys };
  const started = await startPhoneVerification(deps, { phone: p }, ip(), { carryDownFrom: down.ticket });
  if (!started.ok) throw new Error("인증번호 요청 실패");
  const code = /인증번호 (\d{6})/.exec(text)?.[1] ?? "";
  const checked = await checkPhoneCode(deps, { verificationId: started.verificationId, code });
  if (!checked.ok) throw new Error("인증번호 확인 실패");
  return started.verificationId;
}

function cleanup(): void {
  psql(`delete from public.creators where profile_id in (select id from public.profiles where login_id like 'it\\_ks%')`);
  deleteTestSignups();
}
beforeEach(cleanup);
afterAll(cleanup);

describe("(manual/0037 뒤) INV-U19: 카카오 서명으로 크리에이터 가입", () => {
  it("INV-U19 ① (S19) · INV-S16 (S16e): 서명이 검증되면 계정·연락처·연결 기록이 한 처리에서 생기고, 크리에이터 ID 는 봉투에 넣은 값, 6자리 요청은 없다", async () => {
    const p = phone();
    const { ticket, creatorId } = await signedTestPhone(p);
    expect(psql(`select count(*) from pii.phone_verifications where phone_hash = '${testPhoneHash(p)}' and method = 'code'`)).toBe("0");
    const r = await signUp(signUpDeps(), creatorBody("it_ks_ok", p, ticket));
    expect(r).toMatchObject({ ok: true });
    expect(creatorOf("it_ks_ok")).toBe(creatorId);
    expect(linkOf(creatorId).startsWith("fake|")).toBe(true);
    // 봉투는 연결 기록으로 옮겨지고 요청 줄에서는 지워진다(INV-U19 ⑤)
    expect(requestOf(ticket)).toBe("used|true");
    expect(psql(`select count(*) from pii.account_contacts where phone_hash = '${testPhoneHash(p)}'`)).toBe("1");
  });

  it("INV-U19 (S19b, 실패경로): 서명 전 가입 · 원문이 다른 서명 · 기한 지난 서명이면 계정·연결 기록 없음", async () => {
    const p = phone();
    const pending = await startOnly(p);
    expect(await signUp(signUpDeps(), creatorBody("it_ks_early", p, pending.ticket))).toMatchObject({ ok: false, field: "verification" });

    const bad = await startOnly(phone());
    const settled = await adminClient().rpc("settle_signup_sign", { p_ticket: bad.ticket, p_request_id: bad.requestId, p_outcome: "signed", p_signed_content: "다른 원문", p_method: "fake" });
    expect(settled.data).toEqual([{ result: "failed" }]);

    const late = await startOnly(phone());
    psql(`update pii.signup_sign_requests set requested_at = requested_at - interval '6 minutes', expires_at = expires_at - interval '6 minutes' where ticket = '${late.ticket}'`);
    expect(await checkCreatorSign(signDeps(), { requestId: late.requestId }, late.ticket)).toEqual({ ok: true, state: "failed" });
    expect(requestOf(late.ticket)).toBe("expired|true");
    expect(profileCount("it_ks_early")).toBe("0");
  });

  it("INV-U19 ② (S19c, 실패경로): 서명한 번호와 가입 입력 번호가 다르면 거부, 계정 없음", async () => {
    const p = phone();
    const { ticket } = await signedTestPhone(p);
    expect(await signUp(signUpDeps(), creatorBody("it_ks_swap", phone(), ticket))).toMatchObject({ ok: false, field: "verification" });
    expect(profileCount("it_ks_swap")).toBe("0");
  });

  it("INV-U3·U11 (S19d): 이미 가입된 번호로 서명 요청은 만들어지고(가입 여부를 알리지 않음), 검증 뒤 「이미 가입된 번호」 — 봉투는 바로 지운다", async () => {
    const p = phone();
    expect((await signUp(signUpDeps(), fanBody("it_ks_first", p, await verifiedTestPhone(p)))).ok).toBe(true);
    const req = await startOnly(p);
    expect(await checkCreatorSign(signDeps(), { requestId: req.requestId }, req.ticket)).toEqual({ ok: true, state: "exists" });
    expect(requestOf(req.ticket)).toBe("exists|true");
    expect(psql(`select count(*) from pii.account_contacts where phone_hash = '${testPhoneHash(p)}'`)).toBe("1");
  });

  it("INV-U4·U19 (S19e, 실패경로): 연결 기록 만들기가 실패하면 로그인 정보·프로필·연락처 모두 없고 확인은 미사용", async () => {
    const p = phone();
    const { ticket, creatorId } = await signedTestPhone(p);
    // 연결 기록을 미리 다른 요청의 크리에이터 ID 로 바꿔 둔다 — 링크 함수가 FKU01 로 거부한다
    psql(`update pii.signup_sign_requests set creator_id = gen_random_uuid() where ticket = '${ticket}'`);
    await expect(signUp(signUpDeps(), creatorBody("it_ks_rollback", p, ticket))).resolves.toMatchObject({ ok: false, field: "verification" });
    expect(profileCount("it_ks_rollback")).toBe("0");
    expect(psql(`select count(*) from auth.users where email = 'it_ks_rollback@login.fankkuk.invalid'`)).toBe("0");
    expect(psql(`select coalesce(used_at::text, '') from pii.phone_verifications where id = '${ticket}'`)).toBe("");
    expect(psql(`select count(*) from pii.signature_links where creator_id = '${creatorId}'`)).toBe("0");
  });

  it("INV-U2·U19 (S19f, 동시): 검증된 서명 한 건으로 가입 둘을 동시에 — 하나만 성공, 연결 기록 하나", async () => {
    const p = phone();
    const { ticket, creatorId } = await signedTestPhone(p);
    const rs = await Promise.all([signUp(signUpDeps(), creatorBody("it_ks_dup1", p, ticket)), signUp(signUpDeps(), creatorBody("it_ks_dup2", p, ticket))]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(psql(`select count(*) from pii.signature_links where creator_id = '${creatorId}'`)).toBe("1");
  });

  it("INV-U19 ④ (S19g, 실패경로): 한 번호 1시간 다섯 번 뒤 여섯 번째는 거부되고 창구에 가지 않는다 — 인증번호 한도와 따로 센다", async () => {
    const p = phone();
    for (let i = 0; i < 5; i += 1) await startOnly(p);
    let asked = 0;
    const counting: ApprovalSigner = { ...chooseApprovalSigner({ NODE_ENV: "test" })!, requestSignature: async () => ((asked += 1), { ok: true, txId: "x" }) };
    const sixth = await startCreatorSign(signDeps(counting), { identity: dummySignupEnvelope(), creatorId: crypto.randomUUID(), phone: p }, ip(), null);
    expect(sixth).toMatchObject({ ok: false, status: 429 });
    expect(asked).toBe(0);
    // 인증번호 한도(INV-U10)에는 세지 않았다 — 같은 번호로 인증번호를 받을 수 있다
    await expect(requestTestPhoneCode(p)).resolves.toMatchObject({ code: expect.any(String) });
  });
});

describe("(manual/0037 뒤) INV-U20: 장애 대비 6자리 길", () => {
  it("INV-U20 (S20): 창구 장애가 확인된 번호표를 넘겨 받은 인증번호로 가입하면 계정은 생기고 연결 기록은 없다", async () => {
    const p = phone();
    const vid = await downCodeTicket(p);
    expect(psql(`select public.signup_verification_kind('${vid}')`)).toBe("code_down");
    expect(await signUp(signUpDeps(), creatorBody("it_ks_down", p, vid))).toMatchObject({ ok: true });
    const creatorId = creatorOf("it_ks_down");
    expect(linkOf(creatorId)).toBe("");
    expect(psql(`select public.creator_signature_linked('${creatorId}')`)).toBe("f");
  });

  it("INV-U20 (S20b, 실패경로): 창구가 정상인데 인증번호를 직접 받아 맞힌 번호표로 크리에이터 가입 — 앱 서버와 DB 둘 다 거부", async () => {
    const p = phone();
    const vid = await verifiedTestPhone(p);
    expect(await signUp(signUpDeps(), creatorBody("it_ks_bypass", p, vid))).toMatchObject({ ok: false, field: "verification" });
    // 앱 서버를 거치지 않고 DB 함수를 바로 불러도 거부(FKU01)
    const u = await adminClient().auth.admin.createUser({ email: "it_ks_bypass2@login.fankkuk.invalid", password: "long-enough-pw1", email_confirm: true });
    const uid = u.data.user!.id;
    const r = await adminClient().rpc("create_creator_account", {
      p_user_id: uid, p_login_id: "it_ks_bypass2", p_email: "it.ks@example.com", p_phone: testPhoneBundle(uid, p), p_verification_id: vid,
      p_terms: TERMS, p_tag_ids: [soop()], p_custom_tag: null, p_nickname: "it_ks_bypass2",
    });
    expect(r.error?.code).toBe("FKU01");
    expect(profileCount("it_ks_bypass")).toBe("0");
  });

  it("INV-U20 정함 (실패경로): 「창구 장애 확인」은 10분만 — 11분 지난 장애 기록이면 크리에이터 가입 거부", async () => {
    const p = phone();
    const vid = await downCodeTicket(p);
    psql(`update pii.phone_verifications set gateway_down_at = gateway_down_at - interval '11 minutes' where id = '${vid}'`);
    expect(await signUp(signUpDeps(), creatorBody("it_ks_stale", p, vid))).toMatchObject({ ok: false, field: "verification" });
  });

  it("INV-U20 (S20c, 실패경로): 서명 거절·기한 지남은 장애가 아니다 — 그 번호표를 넘겨 받은 인증번호에는 장애 기록이 옮겨지지 않는다", async () => {
    const p = phone();
    const req = await startOnly(p);
    await adminClient().rpc("close_signup_sign", { p_ticket: req.ticket, p_request_id: req.requestId, p_outcome: "failed" });
    const started = await startPhoneVerification(
      { admin: adminClient(), verifier: { kind: "fake", sendKakaoCode: async () => true, sendSms: async () => {} }, codeSecret: () => readPhoneCodeSecret({ NODE_ENV: "test" }), phoneKeys: testPhoneKeys },
      { phone: p },
      ip(),
      { carryDownFrom: req.ticket },
    );
    if (!started.ok) throw new Error("인증번호 요청 실패");
    expect(psql(`select coalesce(gateway_down_at::text, '') from pii.phone_verifications where id = '${started.verificationId}'`)).toBe("");
  });

  it("INV-U1 (실패경로): 팬은 카카오 서명 번호표로 가입할 수 없다(DB 가 FKU01)", async () => {
    const p = phone();
    const { ticket } = await signedTestPhone(p);
    expect(await signUp(signUpDeps(), fanBody("it_ks_fan", p, ticket))).toMatchObject({ ok: false, field: "verification" });
  });
});

describe("(manual/0037 뒤) INV-U12 정함 · INV-U19 ⑤ 정함", () => {
  it("INV-U12 정함: 가입 서명으로 연결된 크리에이터가 번호를 바꾸면 연결이 풀린다", async () => {
    const p = phone();
    const { ticket, creatorId } = await signedTestPhone(p);
    expect((await signUp(signUpDeps(), creatorBody("it_ks_move", p, ticket))).ok).toBe(true);
    const uid = psql(`select id from public.profiles where login_id = 'it_ks_move'`);
    const next = phone();
    const vid = await verifiedTestPhone(next);
    const r = await adminClient().rpc("change_my_phone", { p_account_id: uid, p_phone: testPhoneBundle(uid, next), p_verification_id: vid });
    expect(r.data).toBe("changed");
    expect(linkOf(creatorId)).toBe("");
  });

  it("INV-U19 ⑤ 정함: 끝나는 처리를 거치지 않은 기다리는 요청은 기한 뒤 정리 작업이 봉투를 지운다", async () => {
    const req = await startOnly(phone());
    psql(`update pii.signup_sign_requests set requested_at = requested_at - interval '6 minutes', expires_at = expires_at - interval '6 minutes' where ticket = '${req.ticket}'`);
    psql(`select public.purge_signup_sign_requests()`);
    expect(requestOf(req.ticket)).toBe("expired|true");
  });
});
