import { describe, expect, it } from "vitest";
import { applyPhoneEdit, EMAIL_CUSTOM, formatMobilePhone, joinEmail, splitEmail } from "./signup-fields";

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
