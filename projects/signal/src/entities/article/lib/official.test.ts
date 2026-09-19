import { describe, expect, it } from "vitest";
import {
  hostFromUrl,
  isOfficialByUrl,
  nextOfficialBasis,
  persistsOnReingest,
} from "./official";

describe("isOfficialByUrl — INV-O3 byUrl 은 모델을 거치지 않는다", () => {
  it("INV-O3 (CS10): 원문 도메인이 주체 도메인과 맞으면 true", () => {
    expect(isOfficialByUrl("https://www.anthropic.com/news/x", [{ host: "anthropic.com" }])).toBe(true);
  });

  it("실패경로: 하위 도메인은 받지 않는다 (사람이 글을 올리는 자리다)", () => {
    // 2026-08-12 정정. 하위 도메인까지 열면 `community.openai.com`(개발자 포럼)·
    // `forums.developer.nvidia.com` 의 남이 쓴 글이 확정 "공식 발표"가 된다.
    // 그건 INV-O2 가 막으려던 상태(기계 근거인데 틀림)와 정확히 같다.
    expect(isOfficialByUrl("https://blog.anthropic.com/x", [{ host: "anthropic.com" }])).toBe(false);
    expect(isOfficialByUrl("https://community.openai.com/t/x", [{ host: "openai.com" }])).toBe(
      false,
    );
    // 필요하면 그 호스트를 목록에 직접 적는다.
    expect(isOfficialByUrl("https://blog.google/x", [{ host: "blog.google" }])).toBe(true);
  });

  it("경로 조건이 있으면 그 경로에서만 공식이다", () => {
    const sites = [{ host: "openai.com", pathPrefix: "/index/" }];
    expect(isOfficialByUrl("https://openai.com/index/gpt-x", sites)).toBe(true);
    // 같은 호스트라도 다른 자리는 발표가 아니다.
    expect(isOfficialByUrl("https://openai.com/careers/x", sites)).toBe(false);
    // `/index` 로만 적으면 `/indexed-fake/…` 가 통과한다 — 목록 쪽 테스트가 끝 슬래시를 강제한다.
    expect(isOfficialByUrl("https://openai.com/indexed-fake/x", sites)).toBe(false);
  });

  it("실패경로: 목록에 없는 도메인은 false", () => {
    expect(isOfficialByUrl("https://techcrunch.com/x", [{ host: "anthropic.com" }])).toBe(false);
  });

  it("실패경로: 비슷하지만 다른 도메인은 false (문자열 부분일치가 아니다)", () => {
    // "anthropic.com.evil.com" 처럼 뒤에 진짜 도메인을 붙인 피싱 주소가 통과하면 안 된다.
    expect(isOfficialByUrl("https://anthropic.com.evil.com/x", [{ host: "anthropic.com" }])).toBe(false);
    // "notanthropic.com" 처럼 앞에 글자가 붙은 것도 다른 도메인이다.
    expect(isOfficialByUrl("https://notanthropic.com/x", [{ host: "anthropic.com" }])).toBe(false);
  });

  it("실패경로: URL 이 아니면 false (던지지 않는다)", () => {
    expect(isOfficialByUrl("이건 URL 이 아니다", [{ host: "anthropic.com" }])).toBe(false);
  });
});

describe("hostFromUrl — 근거 문장과 도메인 대조가 쓰는 호스트", () => {
  it("www 를 떼고 소문자로 돌려준다", () => {
    expect(hostFromUrl("https://WWW.Anthropic.com/news/x")).toBe("anthropic.com");
    expect(hostFromUrl("https://blog.google/technology/ai/x")).toBe("blog.google");
  });

  it("실패경로: http/https 가 아니면 null 이다", () => {
    // `new URL` 은 특수 스킴이 아닌 주소에서도 // 뒤를 authority 로 읽는다 —
    // 그래서 이 검사가 없으면 javascript: 주소가 주체 도메인으로 대조를 통과한다.
    expect(hostFromUrl("javascript://anthropic.com/%0aalert(1)")).toBeNull();
    expect(hostFromUrl("data://anthropic.com/x")).toBeNull();
    expect(hostFromUrl("주소가 아님")).toBeNull();
  });

  it("실패경로: 끝점 표기는 같은 호스트로 본다", () => {
    // `anthropic.com.` 은 같은 곳을 가리키는 다른 글자다. 안 지우면 대조에서 조용히 빠진다.
    expect(hostFromUrl("https://anthropic.com./news/x")).toBe("anthropic.com");
  });
});

describe("isOfficialByUrl — 스킴 가드 (INV-O3)", () => {
  it("실패경로: javascript: 주소는 주체 도메인으로 치지 않는다", () => {
    expect(isOfficialByUrl("javascript://anthropic.com/%0aalert(1)", [{ host: "anthropic.com" }])).toBe(
      false,
    );
  });

  it("끝점 표기도 주체 도메인으로 본다", () => {
    expect(isOfficialByUrl("https://anthropic.com./news/x", [{ host: "anthropic.com" }])).toBe(true);
  });
});

describe("nextOfficialBasis — INV-O2 근거는 올라가기만 한다", () => {
  it("none 에서 모델이 공식이라고 하면 byContent 가 된다", () => {
    expect(nextOfficialBasis("none", true)).toBe("byContent");
  });

  it("byUrl 은 모델 판단으로 덮이지 않는다", () => {
    // 기계가 대조한 사실을 모델 판단으로 격하하면 INV-O2 의 구분이 무의미해진다.
    expect(nextOfficialBasis("byUrl", true)).toBe("byUrl");
    expect(nextOfficialBasis("byUrl", false)).toBe("byUrl");
  });

  it("아니라고 답하면 지금 값을 그대로 둔다 (내려가지 않는다)", () => {
    expect(nextOfficialBasis("none", false)).toBe("none");
    expect(nextOfficialBasis("byContent", false)).toBe("byContent");
  });

  it("전이표 전체 — 내려가는 칸이 하나도 없다", () => {
    const rank = { none: 0, byContent: 1, byUrl: 2 } as const;
    for (const current of ["none", "byContent", "byUrl"] as const) {
      for (const claimed of [true, false]) {
        expect(rank[nextOfficialBasis(current, claimed)]).toBeGreaterThanOrEqual(rank[current]);
      }
    }
  });
});

describe("persistsOnReingest — INV-O2 재적재 때 실을 근거", () => {
  it("byUrl 만 다시 싣는다", () => {
    // none 을 실으면 재수집이 모델이 붙인 byContent 를 매 주기 지운다.
    expect(persistsOnReingest("byUrl")).toBe(true);
    expect(persistsOnReingest("byContent")).toBe(false);
    expect(persistsOnReingest("none")).toBe(false);
  });
});
