import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, psql, psqlError, SEED, signedInClient } from "./helpers";

// 내 정보 스펙(docs/specs/my-account.md) — 연락처 보관·읽기·고치기·이메일 확인을 DB 로 지킨다.
// 개인정보 구역 파일(supabase/manual/0002_account_contacts*.sql)을 사람이 적용한 뒤에 돈다.

const BYEOL_EMAIL = "byeolbit.fan@example.com";
const DAL_EMAIL = "daltokki.fan@example.com";

/** 별빛·달토끼를 시드 상태로 되돌린다 — 테스트마다 이메일·닉네임을 바꾸므로. */
function resetContacts(): void {
  psql(`
    update public.profiles set nickname = '별빛' where id = '${SEED.fanId}';
    update public.profiles set nickname = '달토끼' where id = '${SEED.otherFanId}';
    update pii.account_contacts set email = '${BYEOL_EMAIL}', pending_email = null, phone = '01012345678', notify_kakao = true, notify_email = true where account_id = '${SEED.fanId}';
    update pii.account_contacts set email = '${DAL_EMAIL}', pending_email = null, phone = null, notify_kakao = true, notify_email = true where account_id = '${SEED.otherFanId}';
    delete from pii.email_verifications where account_id in ('${SEED.fanId}', '${SEED.otherFanId}');
  `);
}

function contactOf(accountId: string): { email: string; pending: string; phone: string; kakao: string } {
  const [email = "", pending = "", phone = "", kakao = ""] = psql(
    `select coalesce(email, ''), coalesce(pending_email, ''), coalesce(phone, ''), notify_kakao from pii.account_contacts where account_id = '${accountId}';`,
  ).split("|");
  return { email, pending, phone, kakao };
}

const nicknameOf = (id: string) => psql(`select nickname from public.profiles where id = '${id}';`);

type AccountRow = { login_id: string; nickname: string; email: string | null; pending_email: string | null; phone_masked: string | null };

async function readMine(loginId: string): Promise<AccountRow> {
  const client = await signedInClient(loginId);
  const { data, error } = await client.rpc("my_account");
  if (error) throw new Error(`my_account 실패: ${error.message}`);
  return (data as AccountRow[])[0]!;
}

const validEdit = (email: string, nickname = "별빛") => ({ p_nickname: nickname, p_email: email, p_notify_kakao: true, p_notify_email: true });

/** 앱 서버가 하는 대로 확인 링크를 만든다(앱 서버 키). */
async function issueFor(accountId: string): Promise<string> {
  const { data, error } = await adminClient().rpc("issue_email_verification", { p_account_id: accountId });
  if (error) throw new Error(`issue_email_verification 실패: ${error.message}`);
  return (data as { token: string }[])[0]!.token;
}

beforeEach(resetContacts);
afterAll(resetContacts);

describe("INV-A1: 연락처는 개인정보 구역에만 있고 화면 쪽 키로 열리지 않는다", () => {
  it("INV-A1 S1: 로그인한 팬이 연락처 표를 직접 읽거나 고치면 거부된다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const read = await fan.schema("pii").from("account_contacts").select("*");
    expect(read.error).not.toBeNull();
    expect(psqlError(`set role authenticated; select * from pii.account_contacts;`)).toMatch(/permission denied/);
    expect(psqlError(`set role authenticated; update pii.account_contacts set email = 'x@example.com';`)).toMatch(/permission denied/);
    expect(contactOf(SEED.fanId).email).toBe(BYEOL_EMAIL);
  });

  it("INV-A1 S1b: 로그인하지 않은 키도 거부된다", async () => {
    const read = await anonClient().schema("pii").from("account_contacts").select("*");
    expect(read.error).not.toBeNull();
    expect(psqlError(`set role anon; select * from pii.email_verifications;`)).toMatch(/permission denied/);
  });

  it("INV-A1: public 표에는 연락처 칸이 없다", () => {
    const cols = psql(
      `select table_name || '.' || column_name from information_schema.columns where table_schema = 'public' and column_name ~* '(email|phone|mobile)';`,
    );
    expect(cols).toBe("");
  });
});

describe("INV-A2: 휴대폰 번호는 가린 모양으로만 나간다", () => {
  it("INV-A2 S2: 별빛의 번호는 010-****-5678 로 오고 가운데 넷은 응답 어디에도 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const { data, error } = await fan.rpc("my_account");
    expect(error).toBeNull();
    expect((data as AccountRow[])[0]!.phone_masked).toBe("010-****-5678");
    expect(JSON.stringify(data)).not.toContain("1234");
  });

  it("INV-A2 S2b: 번호가 없는 계정은 빈 값이다", async () => {
    expect((await readMine("daltokki_fan")).phone_masked).toBeNull();
  });
});

describe("INV-A3: 로그인 토큰이 확인한 사람 것만 읽고 고친다", () => {
  it("INV-A3 S3: 별빛·달토끼는 각자 자기 이메일만 받는다", async () => {
    const byeol = await readMine("byeolbit_fan");
    const dal = await readMine("daltokki_fan");
    expect([byeol.login_id, byeol.email]).toEqual(["byeolbit_fan", BYEOL_EMAIL]);
    expect([dal.login_id, dal.email]).toEqual(["daltokki_fan", DAL_EMAIL]);
  });

  it("INV-A3 S3b: 고치기 본문에 달토끼 ID 를 넣어도 달토끼 정보는 그대로다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const { error } = await fan.rpc("update_my_account", { ...validEdit("evil@example.com", "바꿈"), p_account_id: SEED.otherFanId });
    expect(error).not.toBeNull(); // 사람 ID 를 받는 함수가 없다
    expect(nicknameOf(SEED.otherFanId)).toBe("달토끼");
    expect(contactOf(SEED.otherFanId)).toMatchObject({ email: DAL_EMAIL, pending: "" });
    expect(nicknameOf(SEED.fanId)).toBe("별빛");
  });

  it("INV-A3 S3b: 정상 고치기는 별빛 것만 바꾼다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const { error } = await fan.rpc("update_my_account", validEdit(BYEOL_EMAIL, "새별빛"));
    expect(error).toBeNull();
    expect(nicknameOf(SEED.fanId)).toBe("새별빛");
    expect(nicknameOf(SEED.otherFanId)).toBe("달토끼");
  });

  it("INV-A3 S3c: 로그인하지 않으면 읽기·고치기·링크 확인 모두 거부된다", async () => {
    const anon = anonClient();
    expect((await anon.rpc("my_account")).error).not.toBeNull();
    expect((await anon.rpc("update_my_account", validEdit("x@example.com"))).error).not.toBeNull();
    expect((await anon.rpc("confirm_my_email", { p_token: "0".repeat(64) })).error).not.toBeNull();
    expect(psqlError(`set role authenticated; select * from public.my_account();`)).toMatch(/로그인이 필요하다/);
  });

  it("INV-A3: 확인 링크 만들기·알림 주소 고르기는 화면 쪽 키로 부를 수 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", validEdit("b@example.com")); // 권한만 있으면 링크가 만들어지는 상태
    const hashOf = () => psql(`select string_agg(encode(token_hash, 'hex'), ',') from pii.email_verifications where account_id = '${SEED.fanId}';`);
    const before = hashOf();
    expect((await fan.rpc("issue_email_verification", { p_account_id: SEED.fanId })).error?.code).toBe("42501");
    expect((await fan.rpc("notification_email", { p_account_id: SEED.otherFanId })).error?.code).toBe("42501");
    expect((await anonClient().rpc("issue_email_verification", { p_account_id: SEED.fanId })).error?.code).toBe("42501");
    expect(hashOf()).toBe(before); // 링크가 새로 달리지 않았다
  });
});

// 함수 본문 중 휴대폰 칸을 쓰는 꼴. 함수 원문 전체를 훑는다.
const WRITES_PHONE = /(update\s+pii\.account_contacts\s+(?:as\s+)?(?:\w+\s+)?set\b[^;]*\bphone\s*=)|(insert\s+into\s+pii\.account_contacts\s*\([^)]*\bphone\b)/i;

describe("INV-A4: 이 경로로 고칠 수 있는 칸은 닉네임·확인 대기 이메일·알림뿐이다", () => {
  it("INV-A4 S4: 아이디·역할·휴대폰 번호를 넣어도 셋 다 그대로다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const { error } = await fan.rpc("update_my_account", {
      ...validEdit(BYEOL_EMAIL),
      p_login_id: "hacked_id",
      p_role: "creator",
      p_phone: "01099998888",
    });
    expect(error).not.toBeNull();
    expect(psql(`select login_id || '|' || role from public.profiles where id = '${SEED.fanId}';`)).toBe("byeolbit_fan|fan");
    expect(contactOf(SEED.fanId).phone).toBe("01012345678");
  });

  it("INV-A4: 확인된 이메일은 고치기로 바뀌지 않는다 — 확인 대기로만 간다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const { data, error } = await fan.rpc("update_my_account", validEdit("new.byeol@example.com"));
    expect(error).toBeNull();
    expect(data).toBe(true);
    expect(contactOf(SEED.fanId)).toMatchObject({ email: BYEOL_EMAIL, pending: "new.byeol@example.com" });
  });

  it("INV-A4: 휴대폰 칸을 쓰는 DB 함수가 없다 (검사기는 심어 둔 위반을 잡는다)", () => {
    expect(WRITES_PHONE.test("update pii.account_contacts set email = v, phone = p_phone where account_id = v_uid")).toBe(true);
    expect(WRITES_PHONE.test("insert into pii.account_contacts (account_id, phone) values (v_uid, p_phone)")).toBe(true);
    expect(WRITES_PHONE.test("update pii.account_contacts set notify_kakao = p_notify_kakao where account_id = v_uid")).toBe(false);
    const sources = psql(
      `select string_agg(p.proname || E'\\n' || p.prosrc, E'\\n----\\n') from pg_proc p where p.pronamespace in ('public'::regnamespace, 'pii'::regnamespace);`,
    );
    expect(sources).toContain("update_my_account"); // 훑을 대상이 실제로 읽혔다
    expect(WRITES_PHONE.test(sources)).toBe(false);
  });
});

describe("INV-A5: DB 함수도 입력을 다시 검사하고, 틀리면 아무 칸도 바꾸지 않는다", () => {
  it.each([
    ["닉네임 13자", validEdit("other@example.com", "가나다라마바사아자차카타파")],
    ["공백뿐인 닉네임", validEdit("other@example.com", "   ")],
    ["이메일 abc", validEdit("abc", "바뀐별빛")],
    ["255자 이메일", validEdit(`${"a".repeat(243)}@example.com`, "바뀐별빛")],
    ["쉼표가 든 주소", validEdit("a,b@example.com", "바뀐별빛")],
    ["꺾쇠가 든 주소", validEdit("a<b>@example.com", "바뀐별빛")],
    ["알림 빈 값", { ...validEdit("other@example.com", "바뀐별빛"), p_notify_kakao: null }],
  ])("INV-A5 S5b: %s 이면 거부되고 변화가 없다", async (_label, args) => {
    const fan = await signedInClient("byeolbit_fan");
    const { error } = await fan.rpc("update_my_account", args);
    expect(error?.code).toBe("22023");
    expect(nicknameOf(SEED.fanId)).toBe("별빛");
    expect(contactOf(SEED.fanId)).toMatchObject({ email: BYEOL_EMAIL, pending: "", kakao: "t" });
  });

  it("INV-A5: 12자 닉네임과 앞뒤 공백은 받는다(공백은 빼고 저장)", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const { error } = await fan.rpc("update_my_account", validEdit(` ${BYEOL_EMAIL} `, "  가나다라마바사아자차카타  "));
    expect(error).toBeNull();
    expect(nicknameOf(SEED.fanId)).toBe("가나다라마바사아자차카타");
    expect(contactOf(SEED.fanId).pending).toBe(""); // 공백만 다른 같은 주소는 바꾸기가 아니다
  });
});

describe("INV-A7: 새 이메일은 링크를 눌러야 확인된 이메일이 된다", () => {
  it("INV-A7 S7: B 로 바꿔 저장하면 확인된 이메일은 A 그대로, 확인 대기는 B", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const { data } = await fan.rpc("update_my_account", validEdit("b@example.com"));
    expect(data).toBe(true);
    const token = await issueFor(SEED.fanId);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await readMine("byeolbit_fan")).toMatchObject({ email: BYEOL_EMAIL, pending_email: "b@example.com" });
  });

  it("INV-A7: 확인된 이메일과 같은 주소로 저장하면 메일이 필요 없다고 답하고 확인 대기는 그대로", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    const { data } = await fan.rpc("update_my_account", validEdit(BYEOL_EMAIL.toUpperCase(), "닉만바꿈"));
    expect(data).toBe(false);
    expect(contactOf(SEED.fanId)).toMatchObject({ email: BYEOL_EMAIL, pending: "b@example.com" });
  });

  it("INV-A7: 확인 대기와 같은 주소로 다시 저장하면 메일을 또 보내지 않고, 보낸 링크도 그대로 쓸 수 있다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    const token = await issueFor(SEED.fanId);
    const again = await fan.rpc("update_my_account", validEdit("B@Example.com", "닉만바꿈"));
    expect(again.error).toBeNull();
    expect(again.data).toBe(false);
    expect(psql(`select count(*) from pii.email_verifications where account_id = '${SEED.fanId}';`)).toBe("1");
    expect((await fan.rpc("confirm_my_email", { p_token: token })).error).toBeNull();
  });

  it("INV-A7 S7b: 링크를 열면 확인된 이메일이 B, 확인 대기는 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    const token = await issueFor(SEED.fanId);
    const { data, error } = await fan.rpc("confirm_my_email", { p_token: token });
    expect(error).toBeNull();
    expect(data).toBe("b@example.com");
    expect(contactOf(SEED.fanId)).toMatchObject({ email: "b@example.com", pending: "" });
  });

  it("INV-A7 S7c: 이미 쓴 링크는 거부된다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    const token = await issueFor(SEED.fanId);
    await fan.rpc("confirm_my_email", { p_token: token });
    await fan.rpc("update_my_account", validEdit("c@example.com"));
    await fan.rpc("confirm_my_email", { p_token: await issueFor(SEED.fanId) });
    // 다시 b 를 확인 대기로 — 주소도 계정도 맞지만 이미 쓴 링크라 거부돼야 한다
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    const again = await fan.rpc("confirm_my_email", { p_token: token });
    expect(again.error?.code).toBe("P0002");
    expect(contactOf(SEED.fanId)).toMatchObject({ email: "c@example.com", pending: "b@example.com" });
  });

  it("INV-A7 S7c: 24시간 지난 링크는 거부된다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    const token = await issueFor(SEED.fanId);
    psql(`update pii.email_verifications set sent_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' where account_id = '${SEED.fanId}';`);
    expect((await fan.rpc("confirm_my_email", { p_token: token })).error?.code).toBe("P0002");
    expect(contactOf(SEED.fanId).email).toBe(BYEOL_EMAIL);
  });

  it("INV-A7: 링크는 24시간 뒤 만료로 만들어진다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    await issueFor(SEED.fanId);
    expect(psql(`select extract(epoch from expires_at - sent_at) from pii.email_verifications where account_id = '${SEED.fanId}';`)).toBe("86400.000000");
  });

  it("INV-A7 S7c: 새 확인을 요청하면 이전 링크는 무효다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    const first = await issueFor(SEED.fanId);
    const second = await issueFor(SEED.fanId);
    expect((await fan.rpc("confirm_my_email", { p_token: first })).error?.code).toBe("P0002");
    expect(contactOf(SEED.fanId).email).toBe(BYEOL_EMAIL);
    expect((await fan.rpc("confirm_my_email", { p_token: second })).error).toBeNull();
  });

  it("INV-A7 S7c: b → c → 다시 b 로 저장하면 처음 b 링크는 무효다(주소·계정·만료가 다 맞아도)", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    const first = await issueFor(SEED.fanId);
    await fan.rpc("update_my_account", validEdit("c@example.com"));
    await issueFor(SEED.fanId);
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    const latest = await issueFor(SEED.fanId);
    expect((await fan.rpc("confirm_my_email", { p_token: first })).error?.code).toBe("P0002");
    expect(contactOf(SEED.fanId)).toMatchObject({ email: BYEOL_EMAIL, pending: "b@example.com" });
    expect((await fan.rpc("confirm_my_email", { p_token: latest })).error).toBeNull();
  });

  it("INV-A7 S7c: 주소를 다시 바꾼 뒤에는 이전 주소의 링크가 거부된다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    const token = await issueFor(SEED.fanId);
    await fan.rpc("update_my_account", validEdit("c@example.com"));
    expect((await fan.rpc("confirm_my_email", { p_token: token })).error?.code).toBe("P0002");
    expect(contactOf(SEED.fanId)).toMatchObject({ email: BYEOL_EMAIL, pending: "c@example.com" });
  });

  it("INV-A7 S7c: 다른 계정의 링크는 거부된다", async () => {
    const byeol = await signedInClient("byeolbit_fan");
    await byeol.rpc("update_my_account", validEdit("b@example.com"));
    const token = await issueFor(SEED.fanId);
    const dal = await signedInClient("daltokki_fan");
    // 달토끼도 같은 주소를 확인 대기로 둔 상태 — 주소가 같아도 계정이 다르면 거부돼야 한다
    await dal.rpc("update_my_account", validEdit("b@example.com", "달토끼"));
    expect((await dal.rpc("confirm_my_email", { p_token: token })).error?.code).toBe("P0002");
    expect(contactOf(SEED.otherFanId)).toMatchObject({ email: DAL_EMAIL, pending: "b@example.com" });
    expect(contactOf(SEED.fanId)).toMatchObject({ email: BYEOL_EMAIL, pending: "b@example.com" });
    expect((await byeol.rpc("confirm_my_email", { p_token: token })).error).toBeNull(); // 링크 자체는 살아 있었다
  });

  it("INV-A7 S7c: 꼴이 틀린 링크 값은 거부된다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("confirm_my_email", { p_token: "' or 1=1 --" })).error?.code).toBe("P0002");
  });

  it("INV-A7 S7d: 확인 대기 B 가 있어도 알림 메일은 A 로 간다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    const { data, error } = await adminClient().rpc("notification_email", { p_account_id: SEED.fanId });
    expect(error).toBeNull();
    expect(data).toBe(BYEOL_EMAIL);
  });

  it("INV-A7: 이메일 알림을 끄면 알림 받을 주소가 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", { ...validEdit(BYEOL_EMAIL), p_notify_email: false });
    expect((await adminClient().rpc("notification_email", { p_account_id: SEED.fanId })).data).toBeNull();
  });

  it("INV-A7 S7e: DB 에는 링크 값 원문이 없고 해시만 있다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    const token = await issueFor(SEED.fanId);
    const rows = psql(`select row_to_json(v)::text from pii.email_verifications v where account_id = '${SEED.fanId}';`);
    expect(rows).not.toBe("");
    expect(rows).not.toContain(token);
    expect(psql(`select count(*) from pii.email_verifications where token_hash = extensions.digest('${token}', 'sha256');`)).toBe("1");
  });
});

describe("INV-A8: 확인 메일은 한 계정당 한 시간에 다섯 통까지", () => {
  /** 이 계정이 지난 한 시간 안에 확인 메일 n 통을 보낸 상태로 만든다. */
  function sentWithinHour(n: number, accountId: string = SEED.fanId): void {
    psql(
      `insert into pii.email_verifications (account_id, email, token_hash, sent_at, expires_at, revoked_at)
       select '${accountId}', 'old@example.com', extensions.gen_random_bytes(32), now() - interval '10 minutes', now() + interval '1 day', now()
       from generate_series(1, ${n});`,
    );
  }

  it("INV-A8 S8: 다섯 통을 보낸 뒤 여섯 번째 저장은 거부되고 확인 대기도 안 바뀐다", async () => {
    sentWithinHour(5);
    const fan = await signedInClient("byeolbit_fan");
    const { error } = await fan.rpc("update_my_account", validEdit("sixth@example.com", "바뀐별빛"));
    expect(error?.code).toBe("FK429");
    expect(contactOf(SEED.fanId)).toMatchObject({ email: BYEOL_EMAIL, pending: "" });
    expect(nicknameOf(SEED.fanId)).toBe("별빛");
  });

  it("INV-A8: 개수 확인과 보낸 기록이 저장 한 번에 같이 일어난다 — 저장 직후 기록이 한 줄 늘어 있다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    expect(psql(`select count(*) from pii.email_verifications where account_id = '${SEED.fanId}' and email = 'b@example.com';`)).toBe("1");
  });

  it("INV-A8: 링크는 저장이 남긴 기록에만 달린다 — 저장 없이 발급만 부르면 거부", async () => {
    psql(`update pii.account_contacts set pending_email = 'b@example.com' where account_id = '${SEED.fanId}';`);
    const { error } = await adminClient().rpc("issue_email_verification", { p_account_id: SEED.fanId });
    expect(error?.code).toBe("P0002");
    expect(psql(`select count(*) from pii.email_verifications where account_id = '${SEED.fanId}';`)).toBe("0");
  });

  it("INV-A8 S8: 동시에 네 번 저장해도 한 시간 다섯 통을 넘지 않는다", async () => {
    sentWithinHour(3);
    const fan = await signedInClient("byeolbit_fan");
    const results = await Promise.all(
      ["c1", "c2", "c3", "c4"].map((n) => fan.rpc("update_my_account", validEdit(`${n}@example.com`))),
    );
    expect(results.filter((r) => r.error === null)).toHaveLength(2);
    expect(results.filter((r) => r.error?.code === "FK429")).toHaveLength(2);
    expect(psql(`select count(*) from pii.email_verifications where account_id = '${SEED.fanId}' and sent_at > now() - interval '1 hour';`)).toBe("5");
  });

  it("INV-A8: 네 통까지는 다섯 번째를 보낼 수 있고, 한 시간이 지난 기록은 세지 않는다", async () => {
    sentWithinHour(4);
    psql(`update pii.email_verifications set sent_at = now() - interval '61 minutes' where account_id = '${SEED.fanId}' and email = 'old@example.com' and id = (select min(id) from pii.email_verifications where account_id = '${SEED.fanId}');`);
    sentWithinHour(1);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("update_my_account", validEdit("b@example.com"))).error).toBeNull();
    await issueFor(SEED.fanId); // 지난 한 시간 안 다섯 번째
  });

  it("INV-A8: 이메일을 안 바꾸는 저장은 한도에 걸려도 된다", async () => {
    sentWithinHour(5);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("update_my_account", validEdit(BYEOL_EMAIL, "닉만바꿈"))).error).toBeNull();
    expect(nicknameOf(SEED.fanId)).toBe("닉만바꿈");
  });

  it("INV-A8: 한도는 계정마다 따로 센다", async () => {
    sentWithinHour(5, SEED.otherFanId);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("update_my_account", validEdit("b@example.com"))).error).toBeNull();
  });

  it("INV-A8: 확인 메일 본문 재료로는 링크 값·주소·닉네임만 나온다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("update_my_account", validEdit("b@example.com"));
    const { data } = await adminClient().rpc("issue_email_verification", { p_account_id: SEED.fanId });
    expect(Object.keys((data as object[])[0]!).sort()).toEqual(["email", "nickname", "token"]);
  });
});
