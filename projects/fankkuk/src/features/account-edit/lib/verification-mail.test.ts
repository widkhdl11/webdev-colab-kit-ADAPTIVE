import { describe, expect, it } from "vitest";
import { buildVerificationMail, confirmLink } from "./verification-mail";

const TOKEN = "a".repeat(64);

describe("이메일 확인 메일", () => {
  it("INV-A8 S8b: 본문은 닉네임과 링크, 고정 안내 문장만으로 이루어진다", () => {
    const mail = buildVerificationMail({ to: "b@example.com", nickname: "별빛", token: TOKEN, appOrigin: "http://127.0.0.1:3311" });
    expect(mail.to).toBe("b@example.com");
    expect(mail.text.split("\n")).toEqual([
      "별빛님, 내 팬꾹에서 이 주소로 이메일을 바꾸셨어요.",
      "아래 링크를 누르면 이 주소로 바뀌어요. 링크는 24시간 동안 한 번만 쓸 수 있어요.",
      "",
      `http://127.0.0.1:3311/me/email/confirm?token=${TOKEN}`,
      "",
      "직접 바꾸신 게 아니라면 이 메일은 무시해 주세요. 아무것도 바뀌지 않아요.",
    ]);
  });

  it("INV-A8 S8b: 번호·주소 꼴이 본문과 제목 어디에도 없다", () => {
    const mail = buildVerificationMail({ to: "b@example.com", nickname: "별빛", token: TOKEN, appOrigin: "http://127.0.0.1:3311" });
    const all = `${mail.subject}\n${mail.text}`;
    expect(all).not.toMatch(/01[016789][- ]?\d{3,4}[- ]?\d{4}/);
    expect(all).not.toMatch(/[가-힣]+(시|도)\s[가-힣]+(구|군|시)\s/);
    // 검사 꼴 자체가 심어 둔 값을 잡는다
    expect("010-1234-5678").toMatch(/01[016789][- ]?\d{3,4}[- ]?\d{4}/);
  });

  it("링크 값은 주소 안에서 그대로 읽히게 옮긴다", () => {
    expect(confirmLink("https://fankkuk.example.com", "ab&c")).toBe("https://fankkuk.example.com/me/email/confirm?token=ab%26c");
  });
});
