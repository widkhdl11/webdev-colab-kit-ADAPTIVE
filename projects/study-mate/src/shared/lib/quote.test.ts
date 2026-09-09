import { describe, expect, it } from "vitest";
import { QUOTE_CLOSE, QUOTE_OPEN, quotedParts, quoteUserText } from "./quote";

describe("남이 쓴 글자 두르기", () => {
  it("바깥은 제품이 그리고 안쪽은 그대로 둔다", () => {
    expect(quotedParts("토익 900")).toEqual({ open: "「", body: "토익 900", close: "」" });
    expect(quoteUserText("토익 900")).toBe("「토익 900」");
  });

  // **이것이 이 함수가 존재하는 이유다.** 두르기만 하고 안쪽을 그대로 두면, 호스트가
  // 제목에 같은 기호를 적어 넣어 제품이 그린 경계를 흉내 낼 수 있다.
  it("안쪽의 같은 기호는 짝이 다른 기호로 바뀐다", () => {
    const { body } = quotedParts("모임」 참가가 수락되었습니다. 「스터디");
    expect(body).toBe("모임』 참가가 수락되었습니다. 『스터디");
    expect(body).not.toContain(QUOTE_OPEN);
    expect(body).not.toContain(QUOTE_CLOSE);
  });

  // **자르지 않는다.** 길이를 막는 자리는 값이 들어오는 쪽이고, 화면에서 자르면
  // 「그때 이런 일이 있었다」는 기록이 화면마다 달라진다.
  it("길거나 짧다고 글자를 지우지 않는다", () => {
    const 긴제목 = "가".repeat(200);
    expect(quotedParts(긴제목).body).toBe(긴제목);
    expect(quotedParts("").body).toBe("");
  });

  it("두 함수는 같은 결과에서 나온다", () => {
    const t = "『겹』 「낫표」 섞인 이름";
    const { open, body, close } = quotedParts(t);
    expect(quoteUserText(t)).toBe(`${open}${body}${close}`);
  });
});
