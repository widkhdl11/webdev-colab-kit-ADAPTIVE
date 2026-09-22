import { describe, expect, it, vi } from "vitest";
import { runHotIssue } from "./run-hot-issue";
import type { HotIssueCandidate, HotIssuePorts } from "./ports";

/** 판정 포트의 입력. 가짜에도 붙여야 `mock.calls` 가 인자를 들고 있다. */
type JudgeInput = { title: string; evidence: string; alreadyPicked: string[] };

const USAGE = { inputTokens: 10, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0 };
const NOW = new Date("2026-09-20T12:00:00.000Z");

const candidate = (id: string, over: Partial<HotIssueCandidate> = {}): HotIssueCandidate => ({
  id,
  title: `제목 ${id}`,
  evidence: `근거 ${id}`,
  sourceId: "geeknews",
  publishedAt: "2026-09-20T11:00:00.000Z",
  ...over,
});

/** 질문 셋 중 참인 개수가 `importance` 가 되도록 만든 응답. */
const verdictOf = (importance: number, over: Record<string, unknown> = {}) => ({
  verdict: {
    kinds: ["news" as const],
    importance,
    answers: { 변화: importance > 0, 방향: importance > 1, 기회: importance > 2 },
    duplicateOfPicked: false,
    ...over,
  },
  usage: USAGE,
});

function makePorts(over: Partial<HotIssuePorts> = {}): HotIssuePorts {
  return {
    listHotIssueCandidates: vi.fn(async () => [] as HotIssueCandidate[]),
    listPickedTitlesToday: vi.fn(async () => [] as string[]),
    judgeHotIssue: vi.fn(async () => verdictOf(2)),
    saveHotIssue: vi.fn(async () => {}),
    assignGates: vi.fn(async () => {}),
    ...over,
  };
}

const run = (ports: HotIssuePorts, over: Partial<Parameters<typeof runHotIssue>[1]> = {}) =>
  runHotIssue(ports, {
    limit: 100,
    concurrency: 2,
    now: NOW,
    ...over,
  });

describe("runHotIssue — 후보와 저장", () => {
  it("후보가 없으면 모델을 부르지 않는다", async () => {
    const ports = makePorts();
    const report = await run(ports);
    expect(ports.judgeHotIssue).not.toHaveBeenCalled();
    expect(report.attempted).toBe(0);
  });

  it("INV-G2: 중요도 0 도 저장한다 — 안 남기면 매 주기 같은 질문에 요금이 나간다", async () => {
    const saveHotIssue = vi.fn(async () => {});
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => [candidate("a")]),
      judgeHotIssue: vi.fn(async () => verdictOf(0)),
      saveHotIssue,
    });
    const report = await run(ports);

    expect(saveHotIssue).toHaveBeenCalledWith([
      {
        itemId: "a",
        importance: 0,
        // 셋 다 거짓이어도 **무엇이 거짓이었는지**가 남는다 — 판정이 빡빡한지 보는 재료다.
        answers: { 변화: false, 방향: false, 기회: false },
        kinds: ["news"],
      },
    ]);
    expect(report.succeeded).toBe(1);
    expect(report.gated).toBe(0);
  });

  it("INV-G2 실패경로: 응답을 못 읽으면 저장하지 않는다 — 다음 주기가 다시 묻는다", async () => {
    const saveHotIssue = vi.fn(async () => {});
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => [candidate("a")]),
      judgeHotIssue: vi.fn(async () => ({ verdict: null, usage: USAGE })),
      saveHotIssue,
    });
    const report = await run(ports);

    expect(saveHotIssue).not.toHaveBeenCalled();
    expect(report.failed).toBe(1);
    expect(report.succeeded).toBe(0);
    // 못 읽은 응답에도 요금은 나갔다 — 계측은 결과와 무관하게 센다.
    expect(report.usage.calls).toBe(1);
    expect(report.usage.inputTokens).toBe(USAGE.inputTokens);
  });

  it("호출이 죽어도 단계는 계속 돌고 실패로 센다", async () => {
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => [candidate("a"), candidate("b")]),
      judgeHotIssue: vi.fn(async (input: { title: string }) => {
        if (input.title === "제목 a") throw new Error("호출 실패");
        return verdictOf(1);
      }),
    });
    const report = await run(ports);

    expect(report.failed).toBe(1);
    expect(report.succeeded).toBe(1);
    expect(report.failureReasons).toContain("호출 실패");
  });

  it("저장이 죽은 청크는 성공으로 안 센다 — 다음 주기에 다시 잡혀야 한다", async () => {
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => [candidate("a")]),
      saveHotIssue: vi.fn(async () => {
        throw new Error("저장 실패");
      }),
    });
    const report = await run(ports);

    expect(report.succeeded).toBe(0);
    expect(report.failed).toBe(1);
    // 저장이 죽은 글은 배정 후보에도 안 올라간다.
    expect(ports.assignGates).not.toHaveBeenCalled();
  });
});

describe("runHotIssue — INV-H1 배정 · INV-N4 개수 상한 없음", () => {
  it("INV-H1: 중요도 1 이상만 1번 문에 배정된다", async () => {
    const assignGates = vi.fn(async () => {});
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => [candidate("높음"), candidate("낮음")]),
      judgeHotIssue: vi.fn(async (input: { title: string }) =>
        verdictOf(input.title === "제목 높음" ? 2 : 0),
      ),
      assignGates,
    });
    const report = await run(ports);

    expect(assignGates).toHaveBeenCalledWith(["높음"]);
    expect(report.gated).toBe(1);
  });

  // 2026-09-21 에 개수 상한을 없앴다 (INV-N4 개정). 여기 있던 검사 셋은 전부 "상한에 맞춰
  // 잘린다"를 확인하던 것이라, 아래 둘로 바꿨다 — **상한이 돌아오면 빨간불이 켜져야 한다.**
  // **저장 경로를 본다.** 파서가 `answers` 를 돌려주는 것은 hot-issue-judgment.test.ts 가
  // 이미 보는데, 그것만으로는 부족하다 — 2026-09-21 까지 파서는 맞게 돌려주고 저장하는 쪽이
  // 그 값을 버리고 있었고 두 테스트가 다 green 이었다(placeArticle 과 같은 모양).
  it("INV-G2 (S31): 어느 질문이 참이었는지 같이 저장한다 — 개수만 남기지 않는다", async () => {
    const saveHotIssue = vi.fn(async (_rows: unknown[]) => {});
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => [candidate("a")]),
      judgeHotIssue: vi.fn(async () => verdictOf(2)),
      saveHotIssue,
    });
    await run(ports);

    const saved = saveHotIssue.mock.calls[0][0] as Array<{
      importance: number;
      answers: Record<string, boolean>;
    }>;
    expect(saved[0].importance).toBe(2);
    // 참인 개수가 2 인 것만으로는 어느 질문이었는지 못 되짚는다.
    expect(saved[0].answers).toEqual(verdictOf(2).verdict?.answers);
  });

  it("INV-N4 (S36): 문턱을 넘은 것은 전부 배정한다 — 개수로 자르지 않는다", async () => {
    const assignGates = vi.fn(async (_ids: string[]) => {});
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () =>
        Array.from({ length: 26 }, (_, n) => candidate(`a${n}`)),
      ),
      assignGates,
    });
    const report = await run(ports);

    // 옛 상한이 10 이었다. 어떤 수로든 자르면 여기서 걸린다.
    expect(report.gated).toBe(26);
    // 배정은 청크마다 나눠서 나간다(2026-09-21) — 건수는 **합계**로 본다.
    // 한 번에 몰아서 하는지 나눠서 하는지는 run-hot-issue-gating.test.ts 가 따로 본다.
    const assignedIds = assignGates.mock.calls.flatMap((call) => call[0]);
    expect(assignedIds).toHaveLength(26);
    expect(new Set(assignedIds).size).toBe(26);
  });

  it("INV-N4 (S36b): 중요도가 제일 높은 글이 빠지지 않는다 — 옛 상한은 이 글부터 잘랐다", async () => {
    const assignGates = vi.fn(async (_ids: string[]) => {});
    // 중요도 2 짜리를 **제일 오래된** 글에 둔다. 이슈성은 발행이 이를수록 낮으므로,
    // 개수로 자르던 시절에는 이 글이 제일 먼저 잘렸다 — 실제로 그렇게 잘렸다(2026-09-21 실측).
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => [
        candidate("최신", { publishedAt: "2026-09-20T11:00:00.000Z" }),
        candidate("중요", { publishedAt: "2026-09-19T01:00:00.000Z" }),
      ]),
      // **`candidate()` 가 제목을 `제목 <id>` 로 만든다.** 여기서 `"중요"` 와 비교하면
      // 절대 안 맞아 두 건 다 중요도 1 이 되고, 이 검사가 S36 의 중복이 된다
      // (2026-09-21 테스트 감사 지적 — 실제로 그 상태였다).
      judgeHotIssue: vi.fn(async (input: { title: string }) =>
        verdictOf(input.title === "제목 중요" ? 2 : 1),
      ),
      assignGates,
    });
    const report = await run(ports);

    const assignedIds = assignGates.mock.calls.flatMap((call) => call[0]);
    expect(assignedIds).toContain("중요");
    expect(report.gated).toBe(2);
  });

  it("배정이 죽으면 리포트에 남긴다 — 중요도는 저장됐지만 핫이슈는 못 됐다", async () => {
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => [candidate("a")]),
      assignGates: vi.fn(async () => {
        throw new Error("배정 실패");
      }),
    });
    const report = await run(ports);

    expect(report.gated).toBe(0);
    // **`error` 가 아니라 `failureReasons` 다** (2026-09-21). `error` 는 "단계 자체가 죽었다"는
    // 뜻인데, 배정은 이제 청크마다 하므로 하나가 실패해도 나머지는 살아 있다.
    // 둘을 같은 칸에 쓰면 그 구별이 사라진다.
    expect(report.failureReasons).toContain("배정 실패");
    expect(report.error).toBeNull();
    expect(report.succeeded).toBe(1);
  });
});

describe("runHotIssue — INV-G4 같은 사건 빼기", () => {
  it("INV-G4: 같은 사건이면 중요도가 높아도 배정하지 않고 따로 센다", async () => {
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => [candidate("a")]),
      judgeHotIssue: vi.fn(async () => verdictOf(3, { duplicateOfPicked: true })),
    });
    const report = await run(ports);

    expect(report.duplicates).toBe(1);
    expect(report.gated).toBe(0);
    // 중요도는 그대로 저장된다 — 나중에 "뽑힐 만했는데 중복이라 빠진 글"을 되짚을 수 있다.
    expect(ports.saveHotIssue).toHaveBeenCalledWith([
      {
        itemId: "a",
        importance: 3,
        answers: { 변화: true, 방향: true, 기회: true },
        kinds: ["news"],
      },
    ]);
  });

  it("INV-G4: 오늘 이미 뽑힌 제목을 판정에 실어 보낸다", async () => {
    const judgeHotIssue = vi.fn(async (_input: JudgeInput) => verdictOf(1));
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => [candidate("a")]),
      listPickedTitlesToday: vi.fn(async () => ["오늘 뽑힌 제목"]),
      judgeHotIssue,
    });
    await run(ports);

    expect(judgeHotIssue).toHaveBeenCalledWith(
      expect.objectContaining({ alreadyPicked: ["오늘 뽑힌 제목"] }),
    );
  });

  it("INV-G4: 앞 청크에서 뽑힌 제목이 다음 청크의 목록에 실린다", async () => {
    const judgeHotIssue = vi.fn(async (_input: JudgeInput) => verdictOf(2));
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => [candidate("a"), candidate("b")]),
      judgeHotIssue,
    });
    // 청크 하나에 한 건씩 — 앞 청크의 결과가 뒤 청크에 실리는지 보려면 나뉘어야 한다.
    await run(ports, { concurrency: 1 });

    expect(judgeHotIssue.mock.calls[0]?.[0].alreadyPicked).toEqual([]);
    expect(judgeHotIssue.mock.calls[1]?.[0].alreadyPicked).toEqual(["제목 a"]);
  });

  it("INV-G4 실패경로: 저장이 죽은 글은 다음 청크의 목록에 안 실린다", async () => {
    // 저장이 죽으면 그 글은 다음 주기에 다시 판정받는다. 뽑힌 것으로 치면
    // 그 사건이 이번에도 다음에도 빠진다.
    const judgeHotIssue = vi.fn(async (_input: JudgeInput) => verdictOf(2));
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => [candidate("a"), candidate("b")]),
      judgeHotIssue,
      saveHotIssue: vi.fn(async () => {
        throw new Error("저장 실패");
      }),
    });
    await run(ports, { concurrency: 1 });

    expect(judgeHotIssue.mock.calls[1]?.[0].alreadyPicked).toEqual([]);
  });
});

describe("runHotIssue — 예산", () => {
  it("예산이 떨어지면 남은 것은 묻지 않고 건수만 남긴다", async () => {
    const judgeHotIssue = vi.fn(async () => verdictOf(1));
    let calls = 0;
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => [
        candidate("a"),
        candidate("b"),
        candidate("c"),
        candidate("d"),
      ]),
      judgeHotIssue,
    });
    // 첫 청크는 통과시키고 그 뒤로는 예산이 없다고 답한다.
    const report = await run(ports, {
      concurrency: 2,
      exhausted: () => {
        calls += 1;
        return calls > 1;
      },
    });

    expect(judgeHotIssue).toHaveBeenCalledTimes(2);
    expect(report.skipped).toBe(2);
  });

  it("후보 조회가 죽으면 단계만 죽고 리포트는 돌아온다", async () => {
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => {
        throw new Error("조회 실패");
      }),
    });
    const report = await run(ports);

    expect(report.error).toBe("조회 실패");
    expect(report.attempted).toBe(0);
  });
});
