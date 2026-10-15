import { describe, expect, it } from "vitest";
import { applyPhoneEdit, EMAIL_CUSTOM, emailLocalTyped, formatMobilePhone, joinEmail, splitEmail } from "./signup-fields";

describe("이메일 — 앞부분 + @ + 고른 주소를 한 줄로 합친다", () => {
  it("고른 주소와 합친다, 앞뒤 공백은 뗀다", () => {
    expect(joinEmail({ local: " new.fan ", choice: "naver.com", custom: "" })).toBe("new.fan@naver.com");
  });
  it("「직접 입력」이면 적은 주소와 합친다", () => {
    expect(joinEmail({ local: "fan", choice: EMAIL_CUSTOM, custom: " example.co.kr " })).toBe("fan@example.co.kr");
  });
  it("주소를 고르지 않았으면 @ 뒤가 비고, 고른 목록 주소는 직접 입력 칸을 무시한다", () => {
    expect(joinEmail({ local: "fan", choice: "", custom: "x.com" })).toBe("fan@");
    expect(joinEmail({ local: "fan", choice: "gmail.com", custom: "x.com" })).toBe("fan@gmail.com");
  });
  it("통째로 붙여 넣은 주소를 나눈다 — 목록에 있으면 고르고, 없으면 직접 입력", () => {
    expect(splitEmail("a.b@gmail.com")).toEqual({ local: "a.b", choice: "gmail.com", custom: "" });
    expect(splitEmail("a@Naver.com")).toEqual({ local: "a", choice: "naver.com", custom: "" });
    expect(splitEmail("a@example.co.kr")).toEqual({ local: "a", choice: EMAIL_CUSTOM, custom: "example.co.kr" });
    expect(splitEmail("a@")).toEqual({ local: "a", choice: "", custom: "" });
  });
});

describe("휴대폰 — 입력하는 대로 하이픈", () => {
  it("010 은 3-4-4 로 나눈다(중간에도 같은 자리)", () => {
    expect(formatMobilePhone("010")).toBe("010");
    expect(formatMobilePhone("0101")).toBe("010-1");
    expect(formatMobilePhone("0101234")).toBe("010-1234");
    expect(formatMobilePhone("01012345")).toBe("010-1234-5");
    expect(formatMobilePhone("01012345678")).toBe("010-1234-5678");
  });
  it("011·016~019 는 10자리면 3-3-4, 11자리면 3-4-4", () => {
    expect(formatMobilePhone("0111234567")).toBe("011-123-4567");
    expect(formatMobilePhone("01712345678")).toBe("017-1234-5678");
  });
  it("숫자 아닌 글자는 버리고 11자리에서 자른다, +82 는 0 으로 바꾼다", () => {
    expect(formatMobilePhone("010 1234-5678 99")).toBe("010-1234-5678");
    expect(formatMobilePhone("+82 10-1234-5678")).toBe("010-1234-5678");
    expect(formatMobilePhone("")).toBe("");
  });
  it("커서 — 하이픈이 새로 생겨도 방금 친 숫자 바로 뒤에 둔다", () => {
    // "010" 끝에서 1 을 쳤다 → "0101", 커서 4
    expect(applyPhoneEdit("010", "0101", 4, null)).toEqual({ value: "010-1", caret: 5 });
    // 가운데에 숫자를 끼워 넣어도 그 숫자 뒤
    expect(applyPhoneEdit("010-1234-5678", "010-19234-5678", 6, null)).toEqual({ value: "010-1923-4567", caret: 6 });
  });
  it("백스페이스가 하이픈에서 막히지 않는다 — 하이픈만 지워졌으면 그 앞 숫자를 지운다", () => {
    // "010-1234-|5678" 에서 백스페이스 → 브라우저는 하이픈만 지운다
    expect(applyPhoneEdit("010-1234-5678", "010-12345678", 8, "backward")).toEqual({ value: "010-1235-678", caret: 7 });
    // "010-|1" 에서 백스페이스
    expect(applyPhoneEdit("010-1", "0101", 3, "backward")).toEqual({ value: "011", caret: 2 });
  });
  it("Delete 키가 하이픈에서 막히지 않는다 — 하이픈만 지워졌으면 그 뒤 숫자를 지운다", () => {
    // "010|-1234" 에서 Delete
    expect(applyPhoneEdit("010-1234", "0101234", 3, "forward")).toEqual({ value: "010-234", caret: 3 });
  });
  it("숫자를 지운 보통의 백스페이스는 그대로", () => {
    expect(applyPhoneEdit("010-1234-5678", "010-1234-567", 12, "backward")).toEqual({ value: "010-1234-567", caret: 12 });
    expect(applyPhoneEdit("010-1", "010-", 4, "backward")).toEqual({ value: "010", caret: 3 });
  });
});

describe("휴대폰 — 국제번호는 맨 앞이 +82 일 때만", () => {
  it("+82 로 시작하면 0 으로 바꾼다(+82 010 꼴도)", () => {
    expect(formatMobilePhone("+82 10-1234-5678")).toBe("010-1234-5678");
    expect(formatMobilePhone(" +821012345678")).toBe("010-1234-5678");
    expect(formatMobilePhone("+82 010-1234-5678")).toBe("010-1234-5678");
  });
  it("(실패경로) + 없이 숫자 821 로 시작하면 그대로 둔다 — 국내 번호의 앞자리로 본다", () => {
    expect(formatMobilePhone("82101234567")).toBe("821-0123-4567");
    expect(formatMobilePhone("8210")).toBe("821-0");
  });
  it("+82 10-1234-5678 을 붙여 넣으면(16자) 잘리지 않고 010-1234-5678, 커서는 끝", () => {
    const pasted = "+82 10-1234-5678";
    expect(applyPhoneEdit("", pasted, pasted.length, null)).toEqual({ value: "010-1234-5678", caret: 13 });
  });
  it("(실패경로) 이미 쓴 번호 앞에 821 을 쳐도 국제번호로 바꾸지 않는다", () => {
    expect(applyPhoneEdit("", "821", 3, null)).toEqual({ value: "821", caret: 3 });
  });
});

describe("이메일 — 앞부분 칸에 @ 를 치면 주소 칸으로 넘긴다", () => {
  it("@ 만 치면 「직접 입력」으로 바꾸고 주소 칸으로 포커스를 옮긴다", () => {
    expect(emailLocalTyped({ local: "abc", choice: "", custom: "" }, "abc@")).toEqual({
      parts: { local: "abc", choice: EMAIL_CUSTOM, custom: "" },
      focusCustom: true,
    });
  });
  it("@ 뒤 글자는 주소 칸으로 옮긴다 — abc@gmail.co 를 쳐도 앞부분은 abc", () => {
    expect(emailLocalTyped({ local: "abc", choice: "", custom: "" }, "abc@gm")).toEqual({
      parts: { local: "abc", choice: EMAIL_CUSTOM, custom: "gm" },
      focusCustom: true,
    });
  });
  it("@ 뒤가 목록에 있는 주소면 그 항목을 고르고 포커스는 그대로", () => {
    expect(emailLocalTyped({ local: "", choice: "", custom: "" }, "abc@Gmail.com")).toEqual({
      parts: { local: "abc", choice: "gmail.com", custom: "" },
      focusCustom: false,
    });
  });
  it("이미 고른 주소가 있어도 @ 를 치면 「직접 입력」으로 바꾼다 — 이어 치는 주소가 앞부분에 붙지 않게", () => {
    expect(emailLocalTyped({ local: "abc", choice: "naver.com", custom: "" }, "abc@").parts).toEqual({ local: "abc", choice: EMAIL_CUSTOM, custom: "" });
  });
  it("(실패경로) @ 가 없으면 앞부분만 바꾸고 고른 주소는 그대로", () => {
    expect(emailLocalTyped({ local: "ab", choice: "naver.com", custom: "" }, "abc")).toEqual({
      parts: { local: "abc", choice: "naver.com", custom: "" },
      focusCustom: false,
    });
  });
});
