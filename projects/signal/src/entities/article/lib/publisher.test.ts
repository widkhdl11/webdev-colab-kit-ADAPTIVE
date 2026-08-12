import { describe, expect, it } from "vitest";
import { publisherFromUrl } from "./publisher";

describe("publisherFromUrl — INV-O1 원문 주소에서 발행처를 뽑는다", () => {
  it("INV-O1 (CS6): 일반 도메인에서 이름을 뽑는다", () => {
    expect(publisherFromUrl("https://techcrunch.com/2026/08/09/some-post/")).toBe("Techcrunch");
  });

  it("서브도메인이 있어도 TLD 바로 앞 라벨을 쓴다", () => {
    expect(publisherFromUrl("https://blog.openai.com/some-post")).toBe("Openai");
  });

  it("하이픈이 있는 이름은 띄어 쓴다", () => {
    expect(publisherFromUrl("https://ars-technica.com/x")).toBe("Ars Technica");
  });

  it("INV-O1 (CS7) 실패경로: 호스트가 라벨 하나뿐이면 뽑지 않는다", () => {
    expect(publisherFromUrl("http://localhost/x")).toBeNull();
  });

  it("INV-O1 (CS7) 실패경로: URL 이 아니면 뽑지 않는다", () => {
    expect(publisherFromUrl("이건 URL 이 아니다")).toBeNull();
    expect(publisherFromUrl("")).toBeNull();
  });
});
