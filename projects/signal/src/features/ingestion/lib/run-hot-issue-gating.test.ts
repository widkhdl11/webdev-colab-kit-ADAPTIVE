import { describe, expect, it, vi } from "vitest";
import { runHotIssue } from "./run-hot-issue";
import type { HotIssueCandidate, HotIssuePorts } from "./ports";

/**
 * 배정 시점 — **청크마다 배정한다** (2026-09-21 코드 리뷰 지적, `surfaces: [concurrency]`).
 *
 * 왜 바뀌었나: 배정을 바퀴 끝에 모아서 했다. 개수 상한(옛 INV-N4)이 있을 때는 그래야 했다 —
 * 다 모아야 자를 수 있으니까. 같은 날 그 상한을 없애면서 모을 이유가 사라졌는데 코드는
 * 그대로였다.
 *
 * 그 사이가 **최악 3분**이다(후보 120건 ÷ 동시 8 = 청크 15개 × 최대 15초). 그 안에 수집이
 * 죽으면 그 바퀴에 문턱을 넘은 글이 **전부 영영 핫이슈가 못 된다** — 판정이 끝나
 * `hot_issue_at` 이 찍혔으므로 다음 주기 후보(`hot_issue_at is null`)에서 빠지고,
 * 아무도 다시 채우지 않는다. 조용한 영구 누락이고, 되돌리려면 손으로 SQL 을 쳐야 한다.
 *
 * 이 파일이 보는 것은 **"앞 청크가 뒤 청크의 사고에 안 휩쓸린다"** 하나다.
 * `INV-C4`(저장 실패를 청크 단위로 격리한다)와 같은 규칙을 배정에도 적용한 것이다.
 */

const USAGE = { inputTokens: 10, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0 };
const NOW = new Date("2026-09-20T12:00:00.000Z");

const candidate = (id: string): HotIssueCandidate => ({
  id,
  title: `제목 ${id}`,
  evidence: `근거 ${id}`,
  sourceId: "geeknews",
  publishedAt: "2026-09-20T11:00:00.000Z",
});

const verdict = {
  verdict: {
    kinds: ["news" as const],
    importance: 2,
    answers: { 변화: true, 방향: true, 기회: false }, reasons: {},
    duplicateOfPicked: false,
  },
  usage: USAGE,
};

function makePorts(over: Partial<HotIssuePorts> = {}): HotIssuePorts {
  return {
    listHotIssueCandidates: vi.fn(async () => [] as HotIssueCandidate[]),
    listPickedTitlesToday: vi.fn(async () => [] as string[]),
    judgeHotIssue: vi.fn(async () => verdict),
    saveHotIssue: vi.fn(async () => {}),
    assignGates: vi.fn(async () => {}),
    ...over,
  };
}

/** 후보 넷 · 동시 둘 = 청크 둘. 청크 경계가 이 파일의 관심사다. */
const four = [candidate("a"), candidate("b"), candidate("c"), candidate("d")];

const run = (ports: HotIssuePorts) =>
  runHotIssue(ports, { limit: 100, concurrency: 2, now: NOW });

describe("runHotIssue — 배정은 청크마다 한다 (INV-H1 · concurrency)", () => {
  it("청크마다 배정한다 — 바퀴 끝에 모아서 하지 않는다", async () => {
    const assignGates = vi.fn(async (_ids: string[]) => {});
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => four),
      assignGates,
    });
    const report = await run(ports);

    // 끝에 모아서 하면 한 번이다. 청크마다 하면 둘이다.
    expect(assignGates).toHaveBeenCalledTimes(2);
    expect(assignGates.mock.calls[0][0]).toEqual(["a", "b"]);
    expect(assignGates.mock.calls[1][0]).toEqual(["c", "d"]);
    expect(report.gated).toBe(4);
  });

  it("뒤 청크의 배정이 죽어도 앞 청크는 남는다 — 그 바퀴가 통째로 날아가지 않는다", async () => {
    let call = 0;
    const assignGates = vi.fn(async (_ids: string[]) => {
      call += 1;
      if (call === 2) throw new Error("배정 실패");
    });
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => four),
      assignGates,
    });
    const report = await run(ports);

    // 앞 청크 둘은 배정됐다. 끝에 모아서 하면 넷 다 잃는다.
    expect(report.gated).toBe(2);
    // 잃은 것을 조용히 넘기지 않는다 — 사람이 봐야 손으로 되살릴 수 있다.
    expect(report.failureReasons.some((r) => r.includes("배정 실패"))).toBe(true);
  });

  it("배정이 죽어도 다음 청크는 계속 간다 — 한 번 실패가 나머지를 막지 않는다", async () => {
    let call = 0;
    const assignGates = vi.fn(async (_ids: string[]) => {
      call += 1;
      if (call === 1) throw new Error("첫 배정 실패");
    });
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => four),
      assignGates,
    });
    const report = await run(ports);

    expect(assignGates).toHaveBeenCalledTimes(2);
    // 뒤 청크는 배정됐다.
    expect(report.gated).toBe(2);
  });

  it("저장이 죽은 청크는 배정하지 않는다 — 중요도가 안 남은 글에 문만 찍히면 안 된다", async () => {
    const assignGates = vi.fn(async (_ids: string[]) => {});
    let save = 0;
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => four),
      saveHotIssue: vi.fn(async () => {
        save += 1;
        if (save === 1) throw new Error("저장 실패");
      }),
      assignGates,
    });
    const report = await run(ports);

    expect(assignGates).toHaveBeenCalledTimes(1);
    expect(assignGates.mock.calls[0][0]).toEqual(["c", "d"]);
    expect(report.gated).toBe(2);
  });

  it("문턱을 넘은 글이 없으면 배정을 아예 안 부른다", async () => {
    const assignGates = vi.fn(async (_ids: string[]) => {});
    const ports = makePorts({
      listHotIssueCandidates: vi.fn(async () => four),
      judgeHotIssue: vi.fn(async () => ({
        verdict: { ...verdict.verdict, importance: 0, answers: { 변화: false, 방향: false, 기회: false } },
        usage: USAGE,
      })),
      assignGates,
    });
    const report = await run(ports);

    expect(assignGates).not.toHaveBeenCalled();
    expect(report.gated).toBe(0);
  });
});
