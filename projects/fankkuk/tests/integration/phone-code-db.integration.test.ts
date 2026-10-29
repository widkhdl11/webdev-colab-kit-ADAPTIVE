import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { checkPhoneCode, startPhoneVerification } from "@/features/signup/model/phone-verification";
import { hashPhoneCode, readPhoneCodeSecret } from "@/shared/api/phone-verifier/verifier";
import { adminClient, anonClient, deleteTestSignups, psql, requestTestPhoneCode, TEST_SIGNUP_PHONE_PREFIX, verifiedTestPhone } from "./helpers";

// 문자 인증번호(signup INV-U10·U15·U16)를 실제 DB 로 — 사람이 적용하는 supabase/manual/0026 뒤. 적용 전에는 빨간불이 맞다.
// 시험 번호는 0109000 의 6000번대만 쓰고 끝나면 지운다.

let seq = 6000;
function phone(): string {
  seq += 1;
  return `${TEST_SIGNUP_PHONE_PREFIX}${String(seq).padStart(4, "0")}`;
}
const ip = () => randomBytes(32).toString("hex");
const secret = () => readPhoneCodeSecret({ NODE_ENV: "test" });
const deps = () => ({ admin: adminClient(), verifier: { kind: "fake" as const, sendKakaoCode: async () => true, sendSms: async () => {} }, codeSecret: secret });
const row = (id: string, cols: string) => psql(`select ${cols} from pii.phone_verifications where id = '${id}'`);
const check = (verificationId: string, code: string) => checkPhoneCode(deps(), { verificationId, code });
const wrongOf = (code: string) => (code === "000000" ? "000001" : "000000");

function request(p: string, ipHash = ip(), id: string = randomUUID()) {
  return adminClient().rpc("request_phone_code", { p_id: id, p_phone: p, p_ip_hash: ipHash, p_code_hash: hashPhoneCode(secret(), id, "123456") });
}

beforeEach(deleteTestSignups);
afterAll(deleteTestSignups);

describe("INV-U15: 인증번호 보관 — 해시·만료·틀린 횟수만", () => {
  it("INV-U15 (S15): DB 의 확인 줄에는 원문 6자리가 없고, 해시·3분 뒤 만료·틀린 횟수 0 이 있다", async () => {
    const { verificationId, code } = await requestTestPhoneCode(phone());
    const [hash, ttl, wrong] = row(verificationId, "code_hash, round(extract(epoch from expires_at - requested_at)), wrong_count").split("|");
    expect(hash).toBe(hashPhoneCode(secret(), verificationId, code));
    expect(ttl).toBe("180");
    expect(wrong).toBe("0");
    expect(psql(`select row_to_json(v)::text from pii.phone_verifications v where id = '${verificationId}'`)).not.toContain(code);
  });

  it("INV-U15 (S15b, 실패경로): 보낸 지 3분 1초면 맞는 인증번호도 거부", async () => {
    const { verificationId, code } = await requestTestPhoneCode(phone());
    psql(`update pii.phone_verifications set expires_at = now() - interval '1 second' where id = '${verificationId}'`);
    expect(await check(verificationId, code)).toMatchObject({ ok: false, reason: "expired" });
    expect(row(verificationId, "coalesce(verified_at::text, '')")).toBe("");
  });

  it("INV-U15 (S15b, 실패경로): 이미 맞힌 인증번호를 다시 넣으면 거부 — 해시도 지워져 있다", async () => {
    const { verificationId, code } = await requestTestPhoneCode(phone());
    expect(await check(verificationId, code)).toEqual({ ok: true });
    expect(row(verificationId, "coalesce(code_hash, '')")).toBe("");
    expect(await check(verificationId, code)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("INV-U15 (S15b, 실패경로): 새로 받으면 앞 인증번호는 버려진다", async () => {
    const p = phone();
    const first = await requestTestPhoneCode(p);
    psql(`update pii.phone_verifications set requested_at = now() - interval '61 seconds' where id = '${first.verificationId}'`);
    const second = await requestTestPhoneCode(p);
    expect(await check(first.verificationId, first.code)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await check(second.verificationId, second.code)).toEqual({ ok: true });
  });

  it("INV-U15: 보내지 못한 인증번호는 버려져 맞혀도 거부", async () => {
    const { verificationId, code } = await requestTestPhoneCode(phone());
    expect((await adminClient().rpc("discard_phone_code", { p_id: verificationId })).error).toBeNull();
    expect(await check(verificationId, code)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("INV-U15 (실패경로): 발송이 두 번 실패하면 그 줄은 버려진 채 남는다", async () => {
    const p = phone();
    const r = await startPhoneVerification(
      { ...deps(), verifier: { kind: "fake", sendKakaoCode: async () => false, sendSms: async () => Promise.reject(new Error("down")) } },
      { phone: p },
      ip(),
    );
    expect(r).toMatchObject({ ok: false, reason: "send_failed" });
    expect(psql(`select count(*) filter (where discarded_at is not null and code_hash is null) || '/' || count(*) from pii.phone_verifications where phone = '${p}'`)).toBe("1/1");
  });
});

describe("INV-U10: 틀린 입력 다섯 번이면 버려진다", () => {
  it("INV-U10 (S10b, 실패경로): 네 번은 남은 횟수, 다섯 번째는 잠김, 여섯 번째에 맞는 번호도 거부", async () => {
    const { verificationId, code } = await requestTestPhoneCode(phone());
    for (const left of [4, 3, 2, 1]) expect(await check(verificationId, wrongOf(code))).toMatchObject({ ok: false, reason: "wrong", remaining: left });
    expect(await check(verificationId, wrongOf(code))).toMatchObject({ ok: false, reason: "locked" });
    expect(await check(verificationId, code)).toMatchObject({ ok: false });
    expect(row(verificationId, "coalesce(verified_at::text, '')")).toBe("");
  });

  it("INV-U10 (동시): 틀린 입력 여덟 개를 동시에 — 틀린 횟수는 5 를 넘지 않고, 그 뒤 맞는 번호도 거부", async () => {
    const { verificationId, code } = await requestTestPhoneCode(phone());
    await Promise.all(Array.from({ length: 8 }, () => check(verificationId, wrongOf(code))));
    expect(row(verificationId, "wrong_count")).toBe("5");
    expect(await check(verificationId, code)).toMatchObject({ ok: false });
  });
});

describe("INV-U10: 요청 한도 — 같은 번호 1분 한 번·하루 다섯 번, 같은 접속 주소 하루 스무 번", () => {
  it("INV-U10 (S10, 실패경로): 같은 번호로 1분 안에 두 번째는 FK428, 기록은 한 줄", async () => {
    const p = phone();
    expect((await request(p)).error).toBeNull();
    expect((await request(p)).error?.code).toBe("FK428");
    expect(psql(`select count(*) from pii.phone_verifications where phone = '${p}'`)).toBe("1");
  });

  it("INV-U10 (S10, 실패경로): 같은 번호 하루 다섯 번 뒤 여섯 번째는 FK429 — 1분이 지나도", async () => {
    const p = phone();
    for (let i = 0; i < 5; i += 1) {
      expect((await request(p)).error).toBeNull();
      psql(`update pii.phone_verifications set requested_at = requested_at - interval '61 seconds' where phone = '${p}'`);
    }
    expect((await request(p)).error?.code).toBe("FK429");
    // 한국 시간 어제로 옮기면 오늘 횟수에서 빠진다
    psql(`update pii.phone_verifications set requested_at = now() - interval '1 day 1 minute' where phone = '${p}'`);
    expect((await request(p)).error).toBeNull();
  });

  it("INV-U10 (S10, 실패경로): 같은 접속 주소에서 하루 스무 번 뒤 다른 번호도 FK429", async () => {
    const shared = ip();
    for (let i = 0; i < 20; i += 1) expect((await request(phone(), shared)).error).toBeNull();
    expect((await request(phone(), shared)).error?.code).toBe("FK429");
    expect((await request(phone(), ip())).error).toBeNull();
  });

  it("INV-U10 (동시): 같은 번호로 여섯 번을 동시에 — 하나만 기록되고 나머지는 FK428", async () => {
    const p = phone();
    const results = await Promise.all(Array.from({ length: 6 }, () => request(p)));
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.filter((r) => r.error?.code === "FK428")).toHaveLength(5);
    expect(psql(`select count(*) from pii.phone_verifications where phone = '${p}'`)).toBe("1");
  });

  it("INV-U10 (실패경로): 꼴이 틀린 요청은 22023 — 해시가 64자리 16진수가 아니면 받지 않는다", async () => {
    const id = randomUUID();
    const r = await adminClient().rpc("request_phone_code", { p_id: id, p_phone: phone(), p_ip_hash: ip(), p_code_hash: "123456" });
    expect(r.error?.code).toBe("22023");
  });
});

describe("INV-U1·U9: 옛 카카오 함수는 없고, 화면 쪽 키로는 새 함수를 부를 수 없다", () => {
  it("INV-U1 (실패경로): 인증번호 없이 「확인됨」을 만드는 옛 함수가 지워졌다", () => {
    expect(
      psql(
        `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('request_phone_verification', 'attach_phone_verification_tx', 'phone_verification_tx', 'complete_phone_verification')`,
      ),
    ).toBe("0");
  });

  it("INV-U1 (실패경로): 익명 키로 확인 함수를 부르면 42501", async () => {
    expect((await anonClient().rpc("check_phone_code", { p_id: randomUUID(), p_code_hash: "a".repeat(64) })).error?.code).toBe("42501");
  });
});

describe("INV-U16: 만 14세 확인", () => {
  it("INV-U16 (S16, 실패경로): age14 없이 계정을 만들면 DB 가 거부하고 확인은 쓰지 않은 채", async () => {
    const p = phone();
    const vid = await verifiedTestPhone(p);
    const created = await adminClient().auth.admin.createUser({ email: "it_age14@login.fankkuk.invalid", password: "long-enough-pw1", email_confirm: true });
    const uid = created.data.user!.id;
    const base = {
      p_user_id: uid,
      p_login_id: "it_age14",
      p_role: "fan",
      p_email: "it.age14@example.com",
      p_phone: p,
      p_verification_id: vid,
      p_nickname: "it_age14",
    };
    const without = await adminClient().rpc("create_account", {
      ...base,
      p_terms: [
        { key: "service", version: "2026-10-01" },
        { key: "privacy", version: "2026-10-01" },
      ],
    });
    expect(without.error?.code).toBe("22023");
    expect(psql(`select count(*) from public.profiles where login_id = 'it_age14'`)).toBe("0");
    expect(row(vid, "coalesce(used_at::text, '')")).toBe("");
    const withAge = await adminClient().rpc("create_account", {
      ...base,
      p_terms: [
        { key: "age14", version: "2026-10-29" },
        { key: "service", version: "2026-10-01" },
        { key: "privacy", version: "2026-10-01" },
      ],
    });
    expect(withAge.error).toBeNull();
    expect(psql(`select count(*) from public.terms_consents t join public.profiles p on p.id = t.account_id where p.login_id = 'it_age14' and t.term_key = 'age14'`)).toBe("1");
  });
});
