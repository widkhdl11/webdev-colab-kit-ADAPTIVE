import { describe, expect, it } from "vitest";
import { KNOWN_LIMIT } from "./keyword-tally";
import type { KeywordPorts } from "./ports";
import { runKeywords } from "./run-keywords";

/**
 * 뱃지 키워드 단계 — badge-keywords INV-B1·B3·K1·K6 의 강제 지점.
 *
 * 이 파일이 `api/ports.ts` 가 아니라 여기 있는 이유: 그 파일은 `server-only` 라
 * 유닛 테스트가 한 번도 로드하지 않는다(rules/tdd.md "테스트가 못 읽는 자리").
 * 앵커가 어떻게 자라는지·축이 저장까지 가는지는 전부 이 안의 계산이다.
 */

type Extracted = Record<string, { fields: string[]; kinds: string[] } | null>;

/** 부른 기록을 남기는 가짜 포트. 무엇이 실려 나갔는지를 보는 것이 이 테스트의 요점이다. */
function fakePorts(
  candidates: { id: string; title: string; evidence?: string }[],
  extracted: Extracted,
  overrides: Partial<KeywordPorts> = {},
) {
  const calls: { title: string; knownFields: string[]; knownKinds: string[] }[] = [];
  const saved: { itemId: string; fields: string[]; kinds: string[] }[][] = [];

  const ports: KeywordPorts = {
    listKeywordCandidates: async (limit) =>
      candidates.slice(0, limit).map((c) => ({
        id: c.id,
        title: c.title,
        evidence: c.evidence ?? "근거",
      })),
    loadKeywordAnchors: async () => ({ fields: [], kinds: [] }),
    extractKeywords: async ({ title, knownFields, knownKinds }) => {
      calls.push({ title, knownFields: [...knownFields], knownKinds: [...knownKinds] });
      const keywords = extracted[title];
      if (keywords === undefined) throw new Error(`모델 호출 실패: ${title}`);
      return {
        keywords,
        usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
      };
    },
    attachKeywords: async (pairs) => {
      saved.push(pairs.map((p) => ({ ...p })));
    },
    ...overrides,
  };
  return { ports, calls, saved };
}

const run = (ports: KeywordPorts, concurrency = 8) =>
  runKeywords(ports, { limit: 100, concurrency });

/** 저장된 것을 한 줄로 편다 — 청크 경계는 대부분의 검사에서 관심 밖이다. */
const flatSaved = (saved: { itemId: string; fields: string[]; kinds: string[] }[][]) =>
  saved.flat();

describe("runKeywords — INV-B1 두 축을 갈라 저장한다", () => {
  it("분야와 사건종류가 섞이지 않고 각자의 축으로 간다", () => {
    const { ports, saved } = fakePorts(
      [{ id: "a", title: "글1" }],
      { 글1: { fields: ["보안", "코딩"], kinds: ["출시"] } },
    );
    return run(ports).then(() => {
      expect(flatSaved(saved)).toEqual([{ itemId: "a", fields: ["보안", "코딩"], kinds: ["출시"] }]);
    });
  });

  it("사건종류가 없는 글도 분야는 저장된다 — 0~2개가 정상이다", async () => {
    const { ports, saved } = fakePorts(
      [{ id: "a", title: "글1" }],
      { 글1: { fields: ["보안"], kinds: [] } },
    );
    await run(ports);
    expect(flatSaved(saved)).toEqual([{ itemId: "a", fields: ["보안"], kinds: [] }]);
  });
});

describe("runKeywords — INV-B3 이미 쓰인 목록을 프롬프트에 같이 준다", () => {
  it("DB 에 이미 있는 키워드가 첫 호출부터 앵커로 실린다", async () => {
    const { ports, calls } = fakePorts([{ id: "a", title: "글1" }], {
      글1: { fields: [], kinds: [] },
    });
    ports.loadKeywordAnchors = async () => ({
      fields: [{ name: "프론트엔드", n: 9 }],
      kinds: [{ name: "출시", n: 4 }],
    });
    await run(ports);
    expect(calls[0].knownFields).toEqual(["프론트엔드"]);
    expect(calls[0].knownKinds).toEqual(["출시"]);
  });

  it("앞 청크에서 나온 키워드가 **뒤 청크의 앵커**에 실린다", async () => {
    // 이게 표기를 수렴시키는 장치다. 안 자라면 같은 주기 안에서도 표기가 갈린다.
    const { ports, calls } = fakePorts(
      [
        { id: "a", title: "글1" },
        { id: "b", title: "글2" },
      ],
      {
        글1: { fields: ["온디바이스AI"], kinds: ["출시"] },
        글2: { fields: [], kinds: [] },
      },
    );
    await run(ports, 1); // 청크 크기 1 → 글1 이 끝난 뒤 글2 가 나간다
    expect(calls[0].knownFields).toEqual([]);
    expect(calls[1].knownFields).toEqual(["온디바이스AI"]);
    expect(calls[1].knownKinds).toEqual(["출시"]);
  });

  it("축마다 따로 실린다 — 합치면 모델이 사건종류 자리에 분야를 쓴다", async () => {
    const { ports, calls } = fakePorts(
      [
        { id: "a", title: "글1" },
        { id: "b", title: "글2" },
      ],
      {
        글1: { fields: ["보안"], kinds: ["규제"] },
        글2: { fields: [], kinds: [] },
      },
    );
    await run(ports, 1);
    expect(calls[1].knownFields).toEqual(["보안"]);
    expect(calls[1].knownKinds).toEqual(["규제"]);
    // 한 목록에 섞여 들어가면 여기서 걸린다.
    expect(calls[1].knownFields).not.toContain("규제");
    expect(calls[1].knownKinds).not.toContain("보안");
  });

  it("표기가 갈린 값은 앵커에서 한 줄로 합쳐진다 — 처음 나온 표기를 남긴다", async () => {
    const { ports, calls } = fakePorts(
      [
        { id: "a", title: "글1" },
        { id: "b", title: "글2" },
        { id: "c", title: "글3" },
      ],
      {
        글1: { fields: ["온-디바이스"], kinds: [] },
        글2: { fields: ["온_디바이스"], kinds: [] },
        글3: { fields: [], kinds: [] },
      },
    );
    await run(ports, 1);
    expect(calls[2].knownFields).toEqual(["온-디바이스"]);
  });
});

describe("runKeywords — INV-K6 목록에는 상한이 있고, 자르는 자리는 하나뿐이다", () => {
  it("앵커가 상한을 넘지 않고 **자주 나온 것부터** 남는다", async () => {
    // 상한 + 5 종을 DB 앵커로 넣고, 건수를 역순으로 준다.
    const many = Array.from({ length: KNOWN_LIMIT + 5 }, (_, i) => ({
      name: `분야${String(i).padStart(3, "0")}`,
      n: i + 1,
    }));
    const { ports, calls } = fakePorts([{ id: "a", title: "글1" }], {
      글1: { fields: [], kinds: [] },
    });
    ports.loadKeywordAnchors = async () => ({ fields: many, kinds: [] });
    await run(ports);

    expect(calls[0].knownFields).toHaveLength(KNOWN_LIMIT);
    // 제일 많이 나온 것이 맨 앞. 1건짜리(`분야000`)는 잘려 나간다.
    expect(calls[0].knownFields[0]).toBe(`분야${String(KNOWN_LIMIT + 4).padStart(3, "0")}`);
    expect(calls[0].knownFields).not.toContain("분야000");
  });
});

describe("runKeywords — 실패를 빈 값으로 뭉개지 않는다", () => {
  it("한 건이 던져도 나머지는 저장된다", async () => {
    const { ports, saved } = fakePorts(
      [
        { id: "a", title: "터지는글" }, // extracted 에 없다 → 던진다
        { id: "b", title: "글2" },
      ],
      { 글2: { fields: ["보안"], kinds: [] } },
    );
    const report = await run(ports);
    expect(flatSaved(saved)).toEqual([{ itemId: "b", fields: ["보안"], kinds: [] }]);
    expect(report.failed).toBe(1);
    expect(report.succeeded).toBe(1);
    expect(report.failureReasons.join(" ")).toContain("모델 호출 실패");
  });

  it("응답을 못 읽은 것(null)은 실패로 세고 저장하지 않는다", async () => {
    // `parseKeywords` 가 null 을 주는 경우 — 잘렸거나 형식이 깨졌다.
    const { ports, saved } = fakePorts([{ id: "a", title: "글1" }], { 글1: null });
    const report = await run(ports);
    expect(flatSaved(saved)).toEqual([]);
    expect(report.failed).toBe(1);
    expect(report.noKeywords).toBe(0);
  });

  it("**짚이는 게 없는 것**과 못 읽은 것을 가른다", async () => {
    // 둘을 뭉개면 파싱이 통째로 깨진 주기가 "이 글들엔 키워드가 없었다"로 보인다.
    const { ports, saved } = fakePorts([{ id: "a", title: "글1" }], {
      글1: { fields: [], kinds: [] },
    });
    const report = await run(ports);
    expect(report.noKeywords).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.succeeded).toBe(1);
    // **빈 결과도 저장 단계로 넘긴다.** 붙일 링크는 없지만 "이 글은 물어봤다"는 표시를
    // 남겨야 한다 — 안 남기면 키워드가 0개인 글이 매 주기 후보로 다시 뽑혀 영원히
    // 같은 질문에 요금을 쓴다.
    expect(flatSaved(saved)).toEqual([{ itemId: "a", fields: [], kinds: [] }]);
  });

  it("토큰은 실패한 호출도 센다 — 요금은 이미 나갔다", async () => {
    const { ports } = fakePorts([{ id: "a", title: "글1" }], { 글1: null });
    const report = await run(ports);
    expect(report.usage.calls).toBe(1);
    expect(report.usage.inputTokens).toBe(10);
  });
});

describe("runKeywords — 단계가 죽어도 던지지 않는다", () => {
  it("후보 조회가 죽으면 리포트에 담고 정상 반환한다", async () => {
    const { ports } = fakePorts([], {});
    ports.listKeywordCandidates = async () => {
      throw new Error("DB 죽음");
    };
    const report = await run(ports);
    expect(report.error).toContain("DB 죽음");
    expect(report.attempted).toBe(0);
  });

  it("저장이 죽어도 다음 청크는 계속 간다 — 앞 청크만 잃는다", async () => {
    let n = 0;
    const { ports, saved } = fakePorts(
      [
        { id: "a", title: "글1" },
        { id: "b", title: "글2" },
      ],
      {
        글1: { fields: ["보안"], kinds: [] },
        글2: { fields: ["코딩"], kinds: [] },
      },
    );
    const ok = ports.attachKeywords;
    ports.attachKeywords = async (pairs) => {
      n += 1;
      if (n === 1) throw new Error("저장 죽음");
      await ok(pairs);
    };
    const report = await run(ports, 1);
    expect(flatSaved(saved)).toEqual([{ itemId: "b", fields: ["코딩"], kinds: [] }]);
    // 저장 못 한 건은 성공이 아니다 — 성공으로 세면 다음 주기에 다시 안 잡힌 줄 알게 된다.
    expect(report.succeeded).toBe(1);
    expect(report.failed).toBe(1);
  });

  it("응답을 못 읽은 글은 저장 단계로 안 넘긴다 — 다음 주기에 다시 잡혀야 한다", async () => {
    const { ports, saved } = fakePorts(
      [
        { id: "a", title: "글1" },
        { id: "b", title: "글2" },
      ],
      { 글1: null, 글2: { fields: [], kinds: [] } },
    );
    await run(ports);
    // 글1 은 표시를 안 남긴다(다시 물어봐야 한다), 글2 는 남긴다(물어봤고 없었다).
    expect(flatSaved(saved)).toEqual([{ itemId: "b", fields: [], kinds: [] }]);
  });

  it("후보가 없으면 모델을 부르지 않는다", async () => {
    const { ports, calls } = fakePorts([], {});
    const report = await run(ports);
    expect(calls).toEqual([]);
    expect(report.attempted).toBe(0);
    expect(report.error).toBeNull();
  });
});

describe("runKeywords — 청크마다 저장한다", () => {
  it("한 번에 몰아 저장하지 않는다 — 중간에 죽으면 앞 청크는 남아야 한다", async () => {
    const { ports, saved } = fakePorts(
      [
        { id: "a", title: "글1" },
        { id: "b", title: "글2" },
        { id: "c", title: "글3" },
      ],
      {
        글1: { fields: ["보안"], kinds: [] },
        글2: { fields: ["코딩"], kinds: [] },
        글3: { fields: ["툴"], kinds: [] },
      },
    );
    await run(ports, 2);
    // 청크 2개(2건 + 1건)로 나뉘어 저장이 두 번 불린다.
    expect(saved).toHaveLength(2);
    expect(saved[0]).toHaveLength(2);
    expect(saved[1]).toHaveLength(1);
  });

  it("limit 보다 많은 후보는 받아오지 않는다", async () => {
    const { ports } = fakePorts(
      Array.from({ length: 10 }, (_, i) => ({ id: `i${i}`, title: `글${i}` })),
      Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [`글${i}`, { fields: [], kinds: [] }]),
      ),
    );
    const report = await runKeywords(ports, { limit: 3, concurrency: 8 });
    expect(report.attempted).toBe(3);
  });
});

/**
 * INV-F5 와 같은 규칙 — 단계 **도중에도** 예산을 본다 (2026-08-31 신설).
 *
 * 진입 직전에 한 번만 보면, 그 순간 통과한 뒤로 최악 150초(청크 10개 × 타임아웃 15초)를
 * 더 쓴다. `INGEST_BUDGET_MS` 240초 + 150초 > Vercel 300초 → 함수가 죽고 **응답 본문이 없어
 * 그날 리포트가 통째로 사라진다.** 2026-08-13 에 소스 루프에서 고친 결함인데 이 단계만
 * 빠져 있었다(2026-08-31 code-reviewer 지적).
 */
describe("runKeywords — 예산이 떨어지면 청크 머리에서 멈춘다", () => {
  const eight = Array.from({ length: 8 }, (_, i) => ({ id: `i${i}`, title: `t${i}` }));
  const answers = Object.fromEntries(
    eight.map((c) => [c.title, { fields: ["코딩"], kinds: [] }]),
  );

  it("첫 청크만 돌고 나머지는 **묻지 않는다**", async () => {
    const { ports, calls } = fakePorts(eight, answers);
    // 동시 2 → 청크 4개. 첫 청크가 끝난 뒤부터 예산이 떨어진 것으로 만든다.
    let seen = 0;
    const report = await runKeywords(ports, {
      limit: 100,
      concurrency: 2,
      exhausted: () => {
        seen += 1;
        return seen > 1;
      },
    });
    expect(calls).toHaveLength(2); // 첫 청크의 두 건만 물었다
    expect(report.attempted).toBe(2);
    expect(report.skipped).toBe(6); // 남은 여섯은 안 물었다
  });

  it("밀린 건수는 실패와 **다른 칸**이다", async () => {
    const { ports } = fakePorts(eight, answers);
    const report = await runKeywords(ports, {
      limit: 100,
      concurrency: 2,
      exhausted: () => true,
    });
    // 한 건도 안 물었으니 실패는 0이어야 한다. 여기에 섞으면 리포트만 보고
    // "모델이 이상한 날"과 "시간이 빠듯한 날"을 구별할 수 없다.
    expect(report.failed).toBe(0);
    expect(report.attempted).toBe(0);
    expect(report.usage.calls).toBe(0);
    expect(report.skipped).toBe(8);
  });

  it("예산이 넉넉하면 전부 돌고 skipped 는 0이다", async () => {
    const { ports, calls } = fakePorts(eight, answers);
    const report = await runKeywords(ports, {
      limit: 100,
      concurrency: 2,
      exhausted: () => false,
    });
    expect(calls).toHaveLength(8);
    expect(report.skipped).toBe(0);
  });

  it("예산 판정을 안 주면 안 본다 — 스크립트에서 부를 때의 경로", async () => {
    const { ports, calls } = fakePorts(eight, answers);
    const report = await runKeywords(ports, { limit: 100, concurrency: 2 });
    expect(calls).toHaveLength(8);
    expect(report.skipped).toBe(0);
  });
});
