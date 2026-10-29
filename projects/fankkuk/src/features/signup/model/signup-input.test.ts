import { describe, expect, it } from "vitest";
import { checkDetails, checkField, creatorProfileSchema, type LiveValues } from "./signup-input";

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

describe("INV-V1·creator-tags INV-T3: 크리에이터 공개 정보 미리 보기 — 서버와 같은 규칙", () => {
  const creator = { name: "꿀단지", channelTitle: "꿀단지TV", tagIds: ["11111111-1111-4111-8111-000000000001"], customTag: "먹방" };
  it("INV-V1 INV-T3: 맞는 입력은 통과, 틀린 칸을 알려 준다", () => {
    expect(checkDetails({ ...ok, creator })).toBeNull();
    expect(checkDetails({ ...ok, creator: { ...creator, tagIds: [], customTag: "먹방" } })).toBeNull();
    expect(checkDetails({ ...ok, creator: { ...creator, name: " " } })?.field).toBe("creatorName");
    expect(checkDetails({ ...ok, creator: { ...creator, channelTitle: "가".repeat(41) } })?.field).toBe("channelTitle");
  });
  it("INV-T3 (실패경로): 태그 0개 · 6개 · 같은 선택지 두 번 · 직접 입력 21자는 태그 칸을 가리킨다", () => {
    const six = ["1", "2", "3", "4", "5", "6"].map((n) => `11111111-1111-4111-8111-00000000000${n}`);
    for (const bad of [
      { tagIds: [], customTag: "" },
      { tagIds: [], customTag: "  " },
      { tagIds: six, customTag: "" },
      { tagIds: ["11111111-1111-4111-8111-000000000001", "11111111-1111-4111-8111-000000000001"], customTag: "" },
      { tagIds: ["11111111-1111-4111-8111-000000000002"], customTag: "가".repeat(21) },
    ]) {
      expect([bad, checkDetails({ ...ok, creator: { ...creator, ...bad } })?.field]).toEqual([bad, "tags"]);
    }
  });

  it("INV-T3 S3c: 서버 검사는 선택지 5개 + 직접 입력을 6개로 세지 않는다 — 직접 입력이 고른 선택지(유튜브)와 같으면 화면·DB 가 하나로 합친다", () => {
    const five = ["1", "2", "3", "4", "5"].map((n) => `11111111-1111-4111-8111-00000000000${n}`);
    expect(checkDetails({ ...ok, creator: { ...creator, tagIds: five, customTag: "유튜브" } })).toBeNull();
    expect(creatorProfileSchema.safeParse({ ...creator, tagIds: five, customTag: " 유튜브 " }).data).toMatchObject({ tagIds: five, customTag: "유튜브" });
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
    creatorName: "꿀단지",
    channelTitle: "꿀단지TV",
  };
  const fields = ["loginId", "nickname", "email", "password", "passwordConfirm", "phone", "creatorName", "channelTitle"] as const;

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

  it("INV-U6 (실패경로): 비밀번호 확인이 비었거나 다르면 확인 문구가 아니다, 크리에이터 칸도 같은 규칙", () => {
    expect(checkField("passwordConfirm", { ...live, passwordConfirm: "" }).ok).toBe(false);
    expect(checkField("creatorName", { ...live, creatorName: " " }).ok).toBe(false);
    expect(checkField("channelTitle", { ...live, channelTitle: "가".repeat(41) }).ok).toBe(false);
  });
});

describe("INV-U13: 닉네임·팬덤 이름 미리 보기 — 서버와 같은 규칙", () => {
  const live: LiveValues = {
    loginId: "newfan",
    nickname: "새팬",
    email: { local: "new.fan", choice: "naver.com", custom: "" },
    password: TEST_PW,
    passwordConfirm: TEST_PW,
    phone: "010-5555-6666",
    creatorName: "꿀단지",
    channelTitle: "꿀단지TV",
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

  it("추가 요청 3 (실패경로): 팬덤 이름은 비워도 되고, 11자·보이지 않는 글자면 팬덤 이름 칸", () => {
    const creator = { name: "꿀단지", channelTitle: "꿀단지TV", tagIds: ["11111111-1111-4111-8111-000000000001"], customTag: "" };
    expect(checkDetails({ ...ok, creator: { ...creator, fanName: "" } })).toBeNull();
    expect(checkDetails({ ...ok, creator: { ...creator, fanName: "가".repeat(10) } })).toBeNull();
    expect(checkDetails({ ...ok, creator: { ...creator, fanName: "가".repeat(11) } })?.field).toBe("fanName");
    expect(checkDetails({ ...ok, creator: { ...creator, fanName: "꿀\u200b벌" } })?.field).toBe("fanName");
  });
});
