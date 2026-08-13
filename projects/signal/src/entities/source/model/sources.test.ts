import { describe, expect, it } from "vitest";
import { SOURCES, SUBJECT_SITES } from "./sources";
import { sourceWeightLookup } from "../lib/weight";
import type { Source } from "./types";

/**
 * 소스 층 — content-selection INV-L1.
 *
 * "weight 를 통해 점수로 이어진다"의 뒷부분(점수 계산 자체)은 ingestion-ranking INV-R2 이고
 * entities/article/lib/ranking.test.ts 가 검증한다 — 여기서 다시 재구현하면 다른 슬라이스의
 * 계산식을 끌어오게 된다(FSD: 슬라이스 간 공유는 아래 레이어로). 이 테스트는 그 앞부분,
 * "층이 다르면 조회되는 weight 도 다르다"까지만 entities/source 안에서 확인한다.
 */
describe("Source — INV-L1 소스마다 층을 둔다", () => {
  it("INV-L1: SOURCES 의 모든 항목이 daily 또는 deep 층을 갖는다", () => {
    for (const s of SOURCES) {
      expect(["daily", "deep"]).toContain(s.tier);
    }
  });

  it("INV-L1 (CS11): 층이 다른 두 소스는 조회되는 weight 도 다르다", () => {
    const dailySource: Source = {
      id: "d",
      name: "daily",
      weight: 1.4,
      feedUrl: "https://ex.com/daily.xml",
      needsTopicCheck: true,
      tier: "daily",
    };
    const deepSource: Source = {
      id: "p",
      name: "deep",
      weight: 0.8,
      feedUrl: "https://ex.com/deep.xml",
      needsTopicCheck: true,
      tier: "deep",
    };
    // 값이 같으면 이 테스트는 "층이 조회값에 반영된다"를 증명하지 못한다.
    expect(dailySource.weight).not.toBe(deepSource.weight);

    const weightOf = sourceWeightLookup([dailySource, deepSource]);
    expect(weightOf("d")).toBe(dailySource.weight);
    expect(weightOf("p")).toBe(deepSource.weight);
  });
});

/**
 * 목록 자체의 모양 검사 (2026-08-13 리뷰).
 *
 * SUBJECT_SITES 는 "믿는 값일수록 모양은 검사해야 한다"며 4종을 검사하는데 정작 SOURCES 는
 * `tier` 만 보고 있었다. 2곳 → 14곳으로 7배가 된 목록이라 한 줄 오타가 조용히 지나간다.
 * 여기서 잡는 실패는 전부 **에러가 안 나는 종류**다 — 그 소스만 매일 0건이 되거나,
 * 적재된 글의 출처·weight 조회가 뒤섞이거나, 피드 맨 뒤로 영구히 밀린다.
 */
describe("SOURCES — 목록의 모양", () => {
  it("id 가 유일하다 — 겹치면 같은 소스를 두 번 받고 weight 조회가 뒤섞인다", () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size, ids.join(", ")).toBe(ids.length);
  });

  it("feedUrl 이 유일하고 https 로 파싱된다 — 오타 한 글자면 그 소스가 매일 404 다", () => {
    const urls = SOURCES.map((s) => s.feedUrl);
    expect(new Set(urls).size).toBe(urls.length);
    for (const s of SOURCES) {
      // `new URL` 은 던진다 — 오타가 문법을 깨는 종류면 여기서 걸린다.
      expect(new URL(s.feedUrl).protocol, s.id).toBe("https:");
    }
  });

  it("weight 가 양수이고 기준표 범위 안이다 — 0 이나 음수면 그 소스 글이 피드에서 사라진다", () => {
    for (const s of SOURCES) {
      expect(s.weight, s.id).toBeGreaterThan(0);
      // 파일 머리의 기준표가 정한 범위(0.9~1.6). 벗어나면 기준표부터 고쳐야 한다.
      expect(s.weight, s.id).toBeLessThanOrEqual(1.6);
      expect(s.weight, s.id).toBeGreaterThanOrEqual(0.8);
    }
  });

  it("이름이 비어 있지 않다 — 카드의 출처 자리가 빈칸이 된다", () => {
    for (const s of SOURCES) expect(s.name.trim(), s.id).not.toBe("");
  });

  it("INV-F4: 주제 판정을 거는 소스가 정확히 어디인지 못 박는다", () => {
    // 강제 위치가 **소스 설정**이라 파이프라인 테스트로는 못 잡는다. 이 두 줄을 false 로
    // 바꾸면 판정이 전 소스에서 0건이 되고(투구게 글이 다시 들어온다), 반대로 14곳을 전부
    // true 로 바꾸면 실측 29분짜리 판정이 부활해 Vercel 상한에서 잘린다.
    // 값이 바뀌면 사람이 한 번 더 판단하라는 뜻의 테스트다.
    expect(
      SOURCES.filter((s) => s.needsTopicCheck)
        .map((s) => s.id)
        .sort(),
    ).toEqual(["geeknews", "hn-frontpage"]);
  });

  it("소스 개수를 못 박는다 — 목록이 통째로 줄어드는 변경을 알아채야 한다", () => {
    expect(SOURCES).toHaveLength(14);
  });
});

describe("SUBJECT_SITES — 공식 byUrl 판정의 근거 목록", () => {
  it("호스트가 도메인 모양이다 (오타 한 줄이 모든 .com 을 공식으로 만들 수 있다)", () => {
    // 스펙은 이 파일을 "믿는 값"으로 둔다. 믿는 값일수록 모양은 검사해야 한다.
    for (const site of SUBJECT_SITES) {
      expect(site.host, site.host).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+$/);
      expect(site.host.split(".").length, site.host).toBeGreaterThanOrEqual(2);
      expect(site.host, site.host).not.toMatch(/^www\./);
    }
  });

  it("경로 조건은 슬래시로 시작하고 슬래시로 끝난다", () => {
    // `/news` 로 두면 `/newsroom-fake/…` 도 통과한다.
    for (const site of SUBJECT_SITES) {
      if (site.pathPrefix === undefined) continue;
      expect(site.pathPrefix, site.pathPrefix).toMatch(/^\/.*\/$/);
    }
  });

  it("사람이 글을 올릴 수 있는 자리는 목록에 없다", () => {
    // 하위 도메인을 안 받으므로 community.openai.com 류는 구조적으로 못 들어오고,
    // 호스트 전체를 여는 항목은 사용자 업로드 경로가 없는 곳이어야 한다.
    const openHosts = SUBJECT_SITES.filter((s) => s.pathPrefix === undefined).map((s) => s.host);
    for (const host of openHosts) {
      expect(host, host).not.toMatch(/^(community|forums?|discuss|answers)\./);
    }
    expect(openHosts, "huggingface.co 는 사용자 업로드가 섞여 호스트 전체를 열 수 없다").not.toContain(
      "huggingface.co",
    );
  });

  it("같은 항목이 두 번 있지 않다", () => {
    const keys = SUBJECT_SITES.map((s) => `${s.host}${s.pathPrefix ?? ""}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
