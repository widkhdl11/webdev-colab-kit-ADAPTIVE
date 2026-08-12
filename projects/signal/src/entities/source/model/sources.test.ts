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
      tier: "daily",
    };
    const deepSource: Source = {
      id: "p",
      name: "deep",
      weight: 0.8,
      feedUrl: "https://ex.com/deep.xml",
      tier: "deep",
    };
    // 값이 같으면 이 테스트는 "층이 조회값에 반영된다"를 증명하지 못한다.
    expect(dailySource.weight).not.toBe(deepSource.weight);

    const weightOf = sourceWeightLookup([dailySource, deepSource]);
    expect(weightOf("d")).toBe(dailySource.weight);
    expect(weightOf("p")).toBe(deepSource.weight);
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
