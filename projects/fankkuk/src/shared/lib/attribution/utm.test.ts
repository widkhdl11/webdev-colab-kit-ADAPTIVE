import { describe, expect, it } from "vitest";
import { cleanUtmValue, decodeUtm, encodeUtm, firstTouchUtmCookie, UTM_COOKIE_MAX_AGE, utmFromSearch } from "./utm";

// 공유 링크 utm (docs/specs/metrics.md INV-Q4) — 서버가 쿠키에 넣기 전에 거르는 장치.
// 영문 소문자·숫자·밑줄·하이픈 1~50자만 남기고 그 밖은 버린다. 처음 값이 있으면 덮어쓰지 않는다. 쿠키는 30일.

const q = (s: string) => new URLSearchParams(s);

describe("INV-Q4 — utm 값 거르기", () => {
  it("INV-Q4: 영문 소문자·숫자·밑줄·하이픈 1~50자는 그대로 남는다", () => {
    expect(cleanUtmValue("x_share-01")).toBe("x_share-01");
    expect(cleanUtmValue("a".repeat(50))).toBe("a".repeat(50));
  });

  it("INV-Q4 (S4, 실패경로): <script>·대문자·한글·공백·빈 값·51자는 버린다", () => {
    for (const bad of ["<script>alert(1)</script>", "X", "Share", "트위터", "x share", "", "a".repeat(51), "x.y", "x;y", "x=y"]) {
      expect(cleanUtmValue(bad)).toBeNull();
    }
    expect(cleanUtmValue(null)).toBeNull();
    expect(cleanUtmValue(undefined)).toBeNull();
  });

  it("INV-Q4: 주소의 세 값(source·medium·campaign)을 하나씩 거른다 — 틀린 값만 빠진다", () => {
    expect(utmFromSearch(q("utm_source=x_share&utm_medium=social&utm_campaign=launch"))).toEqual({ source: "x_share", medium: "social", campaign: "launch" });
    expect(utmFromSearch(q("utm_source=%3Cscript%3E&utm_medium=social"))).toEqual({ source: null, medium: "social", campaign: null });
  });

  it("INV-Q4 (실패경로): 남는 값이 하나도 없으면 null — 쿠키를 만들지 않는다", () => {
    expect(utmFromSearch(q("utm_source=%3Cscript%3E"))).toBeNull();
    expect(utmFromSearch(q("page=2"))).toBeNull();
  });

  it("INV-Q4: 쿠키 값으로 바꿨다가 다시 읽으면 같다", () => {
    const u = { source: "x_share", medium: null, campaign: "launch-1" };
    expect(decodeUtm(encodeUtm(u))).toEqual(u);
  });

  it("INV-Q4 (실패경로): 쿠키를 손으로 고쳐도 읽을 때 다시 거른다", () => {
    expect(decodeUtm("%3Cscript%3E.social.")).toEqual({ source: null, medium: "social", campaign: null });
    expect(decodeUtm("<b>..")).toBeNull();
    expect(decodeUtm("a.b")).toBeNull();
    expect(decodeUtm(undefined)).toBeNull();
  });
});

describe("INV-Q4 — 처음 들어온 순간만 기록", () => {
  it("INV-Q4: 쿠키가 없고 utm 이 있으면 새 쿠키 값", () => {
    expect(firstTouchUtmCookie(q("utm_source=x_share"), undefined)).toBe(encodeUtm({ source: "x_share", medium: null, campaign: null }));
  });

  it("INV-Q4 (실패경로): 처음 값이 있으면 다른 utm 이 와도 덮어쓰지 않는다", () => {
    const first = encodeUtm({ source: "x_share", medium: null, campaign: null });
    expect(firstTouchUtmCookie(q("utm_source=community"), first)).toBeNull();
  });

  it("INV-Q4 (실패경로): 거른 뒤 남는 값이 없으면 쿠키를 만들지 않는다", () => {
    expect(firstTouchUtmCookie(q("utm_source=%3Cscript%3E"), undefined)).toBeNull();
  });

  it("INV-Q4: 쿠키는 30일 산다", () => {
    expect(UTM_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 30);
  });
});
