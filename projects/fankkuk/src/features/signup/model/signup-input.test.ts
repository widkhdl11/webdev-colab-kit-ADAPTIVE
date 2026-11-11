import { describe, expect, it } from "vitest";
import { checkDetails, checkField, signupInputSchema, type LiveValues } from "./signup-input";

// 시험용 비밀번호(실제 계정 아님). 비밀번호 칸에 긴 문자열을 바로 적으면 시크릿 검사에 걸려 상수로 둔다.
const TEST_PW = "long-enough-pw1";
const NINE_CHARS = "123456789";
const SAME_AS_ID = "samepassword";

const ok = {
  loginId: "newfan",
  nickname: "새팬",
  email: "new.fan@example.com",
  password: TEST_PW,
  passwordConfirm: TEST_PW,
  terms: { age14: true, service: true, privacy: true },
};

describe("INV-U6: 화면의 2단계 미리 보기 — 서버와 같은 규칙", () => {
  it("INV-U6: 맞는 입력은 통과", () => {
    expect(checkDetails(ok)).toBeNull();
  });

  it("INV-U6 (실패경로): 틀린 첫 칸을 알려 준다", () => {
    expect(checkDetails({ ...ok, loginId: "abc" })?.field).toBe("loginId");
    expect(checkDetails({ ...ok, email: "a,b@example.com" })?.field).toBe("email");
    expect(checkDetails({ ...ok, password: NINE_CHARS, passwordConfirm: NINE_CHARS })?.field).toBe("password");
    expect(checkDetails({ ...ok, password: "x".repeat(73), passwordConfirm: "x".repeat(73) })?.field).toBe("password");
    expect(checkDetails({ ...ok, loginId: SAME_AS_ID, password: SAME_AS_ID, passwordConfirm: SAME_AS_ID })?.field).toBe("password");
    expect(checkDetails({ ...ok, passwordConfirm: "other-pw" })?.field).toBe("passwordConfirm");
    expect(checkDetails({ ...ok, terms: { age14: true, service: true, privacy: false } })?.field).toBe("terms");
  });

  it("INV-U16 (S16, 실패경로): 「만 14세 이상입니다」 체크가 없으면 2단계에서 막는다", () => {
    expect(checkDetails({ ...ok, terms: { age14: false, service: true, privacy: true } })).toEqual({
      field: "terms",
      message: "만 14세 이상만 가입할 수 있습니다.",
    });
  });

  it("휴대폰 번호는 3단계에서 받는다 — 2단계 검사는 번호를 보지 않는다", () => {
    expect(checkDetails({ ...ok, phone: "02-123-4567" } as Parameters<typeof checkDetails>[0])).toBeNull();
  });
});

describe("INV-U21: 크리에이터는 2단계에서 닉네임·팬덤 이름·태그를 받지 않는다", () => {
  const server = {
    role: "creator",
    loginId: "newcreator",
    email: "new.creator@example.com",
    password: TEST_PW,
    phone: "010-5555-6666",
    terms: { age14: true, service: true, privacy: true },
    verificationId: "22222222-2222-4222-8222-222222222222",
  };

  it("INV-U21 (S21): 크리에이터는 닉네임 없이 통과 — 결과의 닉네임은 null, 본문의 크리에이터 정보(태그·팬덤 이름)는 남지 않는다", () => {
    const r = signupInputSchema.safeParse({ ...server, creator: { tagIds: [], customTag: "", fanName: "꿀벌단" } });
    expect(r.success).toBe(true);
    expect(r.data?.nickname).toBeNull();
    expect(r.data).not.toHaveProperty("creator");
  });

  it("INV-U21 (실패경로): 크리에이터에게 닉네임이 오면(빈 값 포함) 닉네임 칸으로 거부", () => {
    for (const nickname of ["꿀단지", ""]) {
      const r = signupInputSchema.safeParse({ ...server, nickname });
      expect([nickname, r.success, r.error?.issues[0]?.path]).toEqual([nickname, false, ["nickname"]]);
    }
  });

  it("INV-U13 INV-U21 (S21f, 실패경로): 팬은 닉네임이 그대로 필수 — 없으면 닉네임 칸, 있으면 앞뒤 공백을 뗀 값", () => {
    const fan = { ...server, role: "fan" };
    const none = signupInputSchema.safeParse(fan);
    expect([none.success, none.error?.issues[0]?.path]).toEqual([false, ["nickname"]]);
    expect(signupInputSchema.safeParse({ ...fan, nickname: " 새팬 " }).data?.nickname).toBe("새팬");
  });

  it("INV-U21: 2단계 미리 보기 — 크리에이터(닉네임을 넘기지 않음)는 닉네임을 보지 않고, 팬의 빈 닉네임은 닉네임 칸", () => {
    expect(checkDetails({ ...ok, nickname: undefined })).toBeNull();
    expect(checkDetails({ ...ok, nickname: undefined, loginId: "abc" })?.field).toBe("loginId");
    expect(checkDetails({ ...ok, nickname: "" })?.field).toBe("nickname");
  });
});

describe("INV-U6: 칸별 실시간 안내 — 다음을 누를 때와 같은 규칙을 칸마다", () => {
  const live: LiveValues = {
    loginId: "newfan",
    nickname: "새팬",
    email: { local: "new.fan", choice: "naver.com", custom: "" },
    password: TEST_PW,
    passwordConfirm: TEST_PW,
    phone: "010-5555-6666",
  };
  const fields = ["loginId", "nickname", "email", "password", "passwordConfirm", "phone"] as const;

  it("INV-U6: 맞는 칸은 짧은 확인 문구", () => {
    for (const field of fields) {
      const r = checkField(field, live);
      expect([field, r.ok, r.message.length > 0]).toEqual([field, true, true]);
    }
  });

  it("INV-U6 (실패경로): 틀린 칸은 다음을 누를 때와 같은 문구", () => {
    const same = (field: (typeof fields)[number], v: LiveValues, details: Parameters<typeof checkDetails>[0]) => {
      const r = checkField(field, v);
      expect(r.ok).toBe(false);
      expect(r.message).toBe(checkDetails(details)?.message);
    };
    same("loginId", { ...live, loginId: "abc" }, { ...ok, loginId: "abc" });
    same("password", { ...live, password: NINE_CHARS, passwordConfirm: NINE_CHARS }, { ...ok, password: NINE_CHARS, passwordConfirm: NINE_CHARS });
    same("password", { ...live, loginId: SAME_AS_ID, password: SAME_AS_ID }, { ...ok, loginId: SAME_AS_ID, password: SAME_AS_ID, passwordConfirm: SAME_AS_ID });
    same("passwordConfirm", { ...live, passwordConfirm: "other-pw" }, { ...ok, passwordConfirm: "other-pw" });
    same("email", { ...live, email: { local: "a,b", choice: "naver.com", custom: "" } }, { ...ok, email: "a,b@naver.com" });
  });

  it("INV-U6 (실패경로): 이메일은 어느 부분이 비었는지 알려 준다", () => {
    expect(checkField("email", { ...live, email: { local: "", choice: "naver.com", custom: "" } }).message).toBe("이메일의 @ 앞부분을 입력해 주세요.");
    expect(checkField("email", { ...live, email: { local: "fan", choice: "", custom: "" } }).message).toBe("이메일 도메인(@ 뒤)을 선택해 주세요.");
    expect(checkField("email", { ...live, email: { local: "fan", choice: "custom", custom: " " } }).message).toBe("이메일 도메인(@ 뒤)을 입력해 주세요.");
  });

  it("INV-U6 (실패경로): 비밀번호 확인이 비었거나 다르면 확인 문구가 아니다", () => {
    expect(checkField("passwordConfirm", { ...live, passwordConfirm: "" }).ok).toBe(false);
  });
});

describe("INV-U13: 닉네임 미리 보기 — 서버와 같은 규칙", () => {
  const live: LiveValues = {
    loginId: "newfan",
    nickname: "새팬",
    email: { local: "new.fan", choice: "naver.com", custom: "" },
    password: TEST_PW,
    passwordConfirm: TEST_PW,
    phone: "010-5555-6666",
  };

  it("INV-U13 (실패경로): 닉네임 13자·공백뿐·보이지 않는 글자는 닉네임 칸을 가리킨다 — 칸별 안내도 같은 문구", () => {
    for (const nickname of ["가".repeat(13), "  ", "하\u200b루"]) {
      const d = checkDetails({ ...ok, nickname });
      expect([nickname, d?.field]).toEqual([nickname, "nickname"]);
      const f = checkField("nickname", { ...live, nickname });
      expect([nickname, f.ok, f.message]).toEqual([nickname, false, d?.message]);
    }
  });

  it("INV-U13: 앞뒤 공백을 뺀 12자는 맞는 닉네임", () => {
    expect(checkDetails({ ...ok, nickname: ` ${"가".repeat(12)} ` })).toBeNull();
    expect(checkField("nickname", { ...live, nickname: "🌟".repeat(12) }).ok).toBe(true);
  });
});
