import { describe, expect, it } from "vitest";
import { sourceExcerpt } from "./excerpt";

/**
 * INV-S2·S3: 출처가 준 요약글. AI 요약의 **근거**가 되고, AI 요약이 없을 때 화면에 대신 나온다.
 *
 * 그래서 "글이 아닌 것"을 걸러내는 게 이 함수의 일이다 — HN 처럼 링크만 담긴 description 을
 * 근거로 넘기면 모델이 링크를 보고 내용을 지어낸다(INV-S1 위반).
 */

describe("sourceExcerpt — 쓸 수 있는 요약글만 남긴다", () => {
  it("평문은 그대로 (앞뒤 공백만 정리)", () => {
    expect(sourceExcerpt("  OpenAI 가 새 평가 결과를 공개했다.  ")).toBe(
      "OpenAI 가 새 평가 결과를 공개했다.",
    );
  });

  it("HTML 태그를 벗기고 글만 남긴다", () => {
    expect(sourceExcerpt("<p>새 모델 <b>GPT</b> 공개</p>")).toBe("새 모델 GPT 공개");
  });

  it("HTML 엔티티를 되돌린다", () => {
    expect(sourceExcerpt("<p>A &amp; B &lt;태그&gt; &quot;인용&quot; &#39;따옴표&#39;</p>")).toBe(
      `A & B <태그> "인용" '따옴표'`,
    );
  });

  it("줄바꿈·연속 공백을 한 칸으로 모은다", () => {
    expect(sourceExcerpt("첫 줄\n\n  둘째   줄")).toBe("첫 줄 둘째 줄");
  });

  it("너무 길면 자른다 (요약글이지 본문이 아니다)", () => {
    const long = "가".repeat(1200);
    const out = sourceExcerpt(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(1000);
  });

  describe("실패 경로 — 근거가 될 수 없는 것은 null", () => {
    it("INV-S3 실패경로: HN 처럼 링크만 있는 것은 버린다", () => {
      // 실측(2026-08-09): hnrss 의 description 은 이 모양뿐이다.
      const hn =
        '<p>Article URL: <a href="https://github.com/x/y">https://github.com/x/y</a></p>' +
        '<p>Comments URL: <a href="https://news.ycombinator.com/item?id=1">https://news.ycombinator.com/item?id=1</a></p>' +
        "<p>Points: 42</p><p># Comments: 7</p>";
      expect(sourceExcerpt(hn)).toBeNull();
    });

    it("INV-S3 실패경로: 빈 값·공백뿐인 값은 null", () => {
      for (const v of ["", "   ", "<p></p>", "<div>\n</div>", null, undefined]) {
        expect(sourceExcerpt(v as string), String(v)).toBeNull();
      }
    });

    it("INV-S3 실패경로: 너무 짧아 뜻이 없는 것은 null", () => {
      // "Comments" 한 단어 같은 것. 근거로 쓰면 모델이 나머지를 지어낸다.
      expect(sourceExcerpt("Comments")).toBeNull();
      expect(sourceExcerpt("읽기")).toBeNull();
    });

    it("링크가 섞였어도 설명글이 함께 있으면 남긴다", () => {
      const mixed = '<p>새 스킬이 공개됐다. 자세히는 <a href="https://ex.com">여기</a>.</p>';
      expect(sourceExcerpt(mixed)).toBe("새 스킬이 공개됐다. 자세히는 여기.");
    });

    it("문자열이 아니면 null (던지지 않는다)", () => {
      expect(() => sourceExcerpt({ x: 1 } as unknown as string)).not.toThrow();
      expect(sourceExcerpt({ x: 1 } as unknown as string)).toBeNull();
    });
  });
});
