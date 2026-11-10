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
  waitPhoneCodeMinute,
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
  const creatorId = crypto.randomUUID();
  const r = await startCreatorSign(signDeps(signer), { identity: dummySignupEnvelope(), creatorId, phone: p }, ip(), null);
  if (!r.ok || r.state !== "pending") throw new Error(`요청 실패: ${JSON.stringify(r)}`);
  return { ...r, creatorId };
}

/** 요청 줄을 그 요청의 결과 유효 시간(DB 가 정한 expires_at - requested_at)보다 1초 더 지난 것으로 — 숫자를 시험에 쓰지 않는다 */
const expireRequest = (ticket: string) =>
  psql(`update pii.signup_sign_requests set requested_at = requested_at - (expires_at - requested_at) - interval '1 second', expires_at = expires_at - (expires_at - requested_at) - interval '1 second' where ticket = '${ticket}'`);
const linkCount = (creatorId: string) => psql(`select count(*) from pii.signature_links where creator_id = '${creatorId}'`);

/** 창구가 늘 장애로 답하는 서명 창구 */
const downSigner: ApprovalSigner = {
  kind: "fake",
  requestSignature: async () => ({ ok: false, down: true, retry: true }),
  signatureResult: async () => ({ state: "unavailable" }),
};

/** 인증번호를 받아(장애 번호표를 앞 번호표로 넘김) 맞힌 번호표 */
async function codeTicketFrom(p: string, fromTicket: string): Promise<string> {
  let text = "";
  const verifier = { kind: "fake" as const, sendKakaoCode: async () => false, sendSms: async (_to: string, body: string) => void (text = body) };
  const deps = { admin: adminClient(), verifier, codeSecret: () => readPhoneCodeSecret({ NODE_ENV: "test" }), phoneKeys: testPhoneKeys };
  const started = await startPhoneVerification(deps, { phone: p }, ip(), { carryDownFrom: fromTicket });
  if (!started.ok) throw new Error("인증번호 요청 실패");
  const code = /인증번호 (\d{6})/.exec(text)?.[1] ?? "";
  const checked = await checkPhoneCode(deps, { verificationId: started.verificationId, code });
  if (!checked.ok) throw new Error("인증번호 확인 실패");
  return started.verificationId;
}

/** 이미 받은 번호표의 인증번호를 맞힌다(가짜 문자 창구 — 마지막 문자에서 꺼낸다) */
async function verifyCode(p: string, verificationId: string): Promise<string> {
  // 고정 인증번호(000000)로 받은 번호표만 — 받을 때 fixedCode 를 준 창구로 받는다
  const deps = { admin: adminClient(), verifier: { kind: "fake" as const, fixedCode: "000000", sendKakaoCode: async () => true, sendSms: async () => {} }, codeSecret: () => readPhoneCodeSecret({ NODE_ENV: "test" }), phoneKeys: testPhoneKeys };
  void p;
  const checked = await checkPhoneCode(deps, { verificationId, code: "000000" });
  if (!checked.ok) throw new Error(`인증번호 확인 실패: ${checked.reason}`);
  return verificationId;
}

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

  it("INV-U19 (S19b, 실패경로): 서명 전 가입 · 원문이 다른 서명 · 기한 지난 서명 — 각각 가입하면 「다시 확인」, 계정·연결 기록 없음", async () => {
    const p = phone();
    const pending = await startOnly(p);
    expect(await signUp(signUpDeps(), creatorBody("it_ks_early", p, pending.ticket))).toMatchObject({ ok: false, field: "verification" });
    expect(profileCount("it_ks_early")).toBe("0");
    expect(linkCount(pending.creatorId)).toBe("0");

    const pb = phone();
    const bad = await startOnly(pb);
    const settled = await adminClient().rpc("settle_signup_sign", { p_ticket: bad.ticket, p_request_id: bad.requestId, p_outcome: "signed", p_signed_content: "다른 원문", p_method: "fake" });
    expect(settled.data).toEqual([{ result: "failed" }]);
    expect(await signUp(signUpDeps(), creatorBody("it_ks_badsig", pb, bad.ticket))).toMatchObject({ ok: false, field: "verification" });
    expect(profileCount("it_ks_badsig")).toBe("0");
    expect(linkCount(bad.creatorId)).toBe("0");

    const pl = phone();
    const late = await startOnly(pl);
    expireRequest(late.ticket);
    expect(await checkCreatorSign(signDeps(), { requestId: late.requestId }, late.ticket)).toEqual({ ok: true, state: "failed" });
    expect(requestOf(late.ticket)).toBe("expired|true");
    expect(await signUp(signUpDeps(), creatorBody("it_ks_late", pl, late.ticket))).toMatchObject({ ok: false, field: "verification" });
    expect(profileCount("it_ks_late")).toBe("0");
    expect(linkCount(late.creatorId)).toBe("0");
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
    // 연결 기록에 옮길 봉투를 비워 둔다 — 계정·연락처·크리에이터 행을 만든 뒤 마지막 단계(pii.signup_sign_link)가 FKU01 로 거부한다.
    // (요청 줄의 creator_id 를 바꾸는 것은 실패를 만들지 않는다 — 가입이 그 칸에서 크리에이터 ID 를 읽어 같은 값으로 연결한다)
    const envelope = psql(`select envelope::text from pii.signup_sign_requests where ticket = '${ticket}'`);
    psql(`update pii.signup_sign_requests set envelope = null where ticket = '${ticket}'`);
    await expect(signUp(signUpDeps(), creatorBody("it_ks_rollback", p, ticket))).resolves.toMatchObject({ ok: false, field: "verification" });
    expect(profileCount("it_ks_rollback")).toBe("0");
    expect(psql(`select count(*) from auth.users where email = 'it_ks_rollback@login.fankkuk.invalid'`)).toBe("0");
    // 확인 줄은 그대로 하나, 쓴 표시 없음(되돌려짐)
    expect(psql(`select count(*) = 1 and bool_and(used_at is null) from pii.phone_verifications where id = '${ticket}'`)).toBe("t");
    expect(linkCount(creatorId)).toBe("0");
    // 대조: 봉투를 되돌리면 같은 호출이 성공한다 — 막은 것이 연결 단계라는 근거
    psql(`update pii.signup_sign_requests set envelope = '${envelope}'::jsonb where ticket = '${ticket}'`);
    expect(await signUp(signUpDeps(), creatorBody("it_ks_rollback", p, ticket))).toMatchObject({ ok: true });
    expect(linkCount(creatorId)).toBe("1");
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
      p_terms: TERMS, p_tag_ids: [soop()], p_custom_tag: null, p_nickname: "it_ks_bp2", // 닉네임은 1~12자(INV-U13) — 앞 검사를 다 지나 확인 방법 대조에 닿게
    });
    expect(r.error?.code, r.error?.message).toBe("FKU01");
    // 대조: 같은 번호표·같은 인자에 「창구 장애 확인」 하나만 붙이면 통과한다 — 막은 것이 확인 방법 대조(INV-U20)라는 근거
    psql(`update pii.phone_verifications set gateway_down_at = now() where id = '${vid}'`);
    const again = await adminClient().rpc("create_creator_account", {
      p_user_id: uid, p_login_id: "it_ks_bypass2", p_email: "it.ks@example.com", p_phone: testPhoneBundle(uid, p), p_verification_id: vid,
      p_terms: TERMS, p_tag_ids: [soop()], p_custom_tag: null, p_nickname: "it_ks_bp2",
    });
    expect(again.error).toBeNull();
    expect(profileCount("it_ks_bypass")).toBe("0");
  });

  it("(manual/0038 뒤) INV-U20 정함: 장애 기록은 기록된 때부터 정한 시간 안에 인증번호 요청에 옮겨져야 한다 — 1초 넘으면 계정 만들기 함수가 FKU01, 1분 남았으면 받는다", async () => {
    const windowSec = Number(psql(`select public.signup_sign_down_window_seconds()`));
    expect(windowSec).toBeGreaterThan(60);
    const attempt = async (shiftSec: number, loginId: string) => {
      const p = phone();
      const down = await startCreatorSign(signDeps(downSigner), { identity: dummySignupEnvelope(), creatorId: crypto.randomUUID(), phone: p }, ip(), null);
      if (!down.ok || down.state !== "down") throw new Error("장애 판정 실패");
      psql(`update pii.signup_sign_requests set finished_at = finished_at - interval '${shiftSec} seconds' where ticket = '${down.ticket}'`);
      const vid = await codeTicketFrom(p, down.ticket);
      const u = await adminClient().auth.admin.createUser({ email: `${loginId}@login.fankkuk.invalid`, password: "long-enough-pw1", email_confirm: true });
      const uid = u.data.user!.id;
      return adminClient().rpc("create_creator_account", {
        p_user_id: uid, p_login_id: loginId, p_email: `${loginId.replace("_", ".")}@example.com`, p_phone: testPhoneBundle(uid, p), p_verification_id: vid,
        p_terms: TERMS, p_tag_ids: [soop()], p_custom_tag: null, p_nickname: loginId.slice(0, 12),
      });
    };
    expect((await attempt(windowSec + 1, "it_ks_stale")).error?.code).toBe("FKU01");
    expect((await attempt(windowSec - 60, "it_ks_fresh")).error).toBeNull();
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

  it("(manual/0038 뒤) INV-U20 (코드 리뷰): 장애 길에서 인증번호를 다시 받으면 장애 기록이 새 번호표로 넘어간다 — 원래 시각 그대로, 앞 번호표는 잃는다(한 번호표만). 다시 받은 인증번호로 가입된다", async () => {
    const p = phone();
    const down = await startCreatorSign(signDeps(downSigner), { identity: dummySignupEnvelope(), creatorId: crypto.randomUUID(), phone: p }, ip(), null);
    if (!down.ok || down.state !== "down") throw new Error("장애 판정 실패");
    const deps = { admin: adminClient(), verifier: { kind: "fake" as const, fixedCode: "000000", sendKakaoCode: async () => true, sendSms: async () => {} }, codeSecret: () => readPhoneCodeSecret({ NODE_ENV: "test" }), phoneKeys: testPhoneKeys };
    const first = await startPhoneVerification(deps, { phone: p }, ip(), { carryDownFrom: down.ticket });
    if (!first.ok) throw new Error("인증번호 요청 실패");
    waitPhoneCodeMinute(p);
    // 화면의 쿠키는 이제 첫 인증번호 번호표다 — 그것을 앞 번호표로 넘긴다
    const second = await startPhoneVerification(deps, { phone: p }, ip(), { carryDownFrom: first.verificationId });
    if (!second.ok) throw new Error("인증번호 요청 실패");
    const downAt = (id: string) => psql(`select coalesce(gateway_down_at::text, '') from pii.phone_verifications where id = '${id}'`);
    const recorded = psql(`select finished_at::text from pii.signup_sign_requests where ticket = '${down.ticket}'`);
    expect(downAt(first.verificationId)).toBe("");
    expect(downAt(second.verificationId)).toBe(recorded);
    const vid = await verifyCode(p, second.verificationId);
    expect(await signUp(signUpDeps(), creatorBody("it_ks_resend", p, vid))).toMatchObject({ ok: true });
  });

  it("(manual/0038 뒤) INV-U20 (코드 리뷰): 인증번호 발송이 실패해 버려져도 장애 기록을 잃지 않는다 — 다음 요청(쿠키는 그대로 장애 번호표)이 다시 가져간다", async () => {
    const p = phone();
    const down = await startCreatorSign(signDeps(downSigner), { identity: dummySignupEnvelope(), creatorId: crypto.randomUUID(), phone: p }, ip(), null);
    if (!down.ok || down.state !== "down") throw new Error("장애 판정 실패");
    const failing = { admin: adminClient(), verifier: { kind: "fake" as const, sendKakaoCode: async () => false, sendSms: async () => { throw new Error("sms down"); } }, codeSecret: () => readPhoneCodeSecret({ NODE_ENV: "test" }), phoneKeys: testPhoneKeys };
    const lost = await startPhoneVerification(failing, { phone: p }, ip(), { carryDownFrom: down.ticket });
    expect(lost.ok).toBe(false);
    waitPhoneCodeMinute(p);
    const vid = await codeTicketFrom(p, down.ticket);
    expect(psql(`select public.signup_verification_kind('${vid}')`)).toBe("code_down");
  });

  it("(manual/0038 뒤) INV-U20 (실패경로): 장애 기록을 가진 번호표가 이미 확인됐으면 넘기지 않는다 — 언제나 한 번호표만 쓸 수 있다", async () => {
    const p = phone();
    const vid = await downCodeTicket(p);
    waitPhoneCodeMinute(p);
    const deps = { admin: adminClient(), verifier: { kind: "fake" as const, sendKakaoCode: async () => true, sendSms: async () => {} }, codeSecret: () => readPhoneCodeSecret({ NODE_ENV: "test" }), phoneKeys: testPhoneKeys };
    const other = await startPhoneVerification(deps, { phone: p }, ip(), { carryDownFrom: vid });
    if (!other.ok) throw new Error("인증번호 요청 실패");
    expect(psql(`select coalesce(gateway_down_at::text, '') from pii.phone_verifications where id = '${other.verificationId}'`)).toBe("");
    expect(psql(`select public.signup_verification_kind('${vid}')`)).toBe("code_down");
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
    expireRequest(req.ticket);
    psql(`select public.purge_signup_sign_requests()`);
    expect(requestOf(req.ticket)).toBe("expired|true");
  });
});
