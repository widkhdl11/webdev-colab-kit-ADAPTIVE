import { assignGate } from "@/entities/article";
import { MAX_FAILURE_REASONS, MAX_FAILURE_REASON_LENGTH } from "./budgets";
import type { EnrichUsage, HotIssueCandidate, HotIssuePorts, HotIssueSave } from "./ports";

/**
 * 핫이슈 판정 한 바퀴 — hot-issue.md INV-G1·G2·G4·H1·N3·N4 의 강제 지점.
 *
 * **요약(enrich)과 별개 단계인 이유**는 `runKeywords` 와 같다 — 이미 요약이 끝난 글도
 * 판정 후보이고, INV-G4 가 "그날 이미 뽑힌 제목을 같이 준다"를 요구해 청크마다 목록을
 * 갱신해야 하는데 요약 단계는 그런 구조가 아니다.
 *
 * `runIngest` 와 같은 규칙: **이 함수는 던지지 않는다.** 던지면 Cron 한 번이 통째로 날아간다.
 */

export interface HotIssueReport {
  /** 모델에 물어본 건수. */
  attempted: number;
  /** 응답을 읽었고 중요도 저장까지 끝난 건수 (중요도 0 도 포함). */
  succeeded: number;
  /** 호출이 죽었거나 응답을 못 읽었거나 저장이 죽은 건수. */
  failed: number;
  /**
   * 문턱을 넘어 `1번` 문에 배정된 건수 (INV-H1).
   *
   * `succeeded` 와 따로 센다 — 판정이 다 돌았는데 하나도 안 뽑힌 날과 판정 자체가 안 돈
   * 날은 다른 일이다.
   */
  gated: number;
  /**
   * 그날 이미 뽑힌 것과 같은 사건이라 뺀 건수 (INV-G4).
   *
   * 중요도는 높은데 안 뽑힌 이유가 이것뿐이라, 안 세면 "문턱이 너무 높다"로 오독된다.
   */
  duplicates: number;
  failureReasons: string[];
  usage: EnrichUsage & { calls: number };
  /**
   * 예산이 떨어져 **묻지도 못하고 남긴** 건수.
   *
   * 실패와 다른 칸이어야 한다 — 실패는 "물어봤는데 안 됐다"이고 이건 "시간이 없어 안 물었다"다.
   * 이 글들은 `hot_issue_at` 이 비어 있어 다음 주기에 그대로 다시 잡힌다.
   */
  skipped: number;
  /** 단계 자체가 죽은 경우. 앞 청크의 저장분은 그대로 남는다. */
  error: string | null;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function noteFailure(into: string[], e: unknown): void {
  const reason = errorText(e).slice(0, MAX_FAILURE_REASON_LENGTH);
  if (into.length >= MAX_FAILURE_REASONS || into.includes(reason)) return;
  into.push(reason);
}

export async function runHotIssue(
  ports: HotIssuePorts,
  opts: {
    /** 이번 바퀴에 **물어볼** 최대 건수. 요금을 정하는 값이다. */
    limit: number;
    concurrency: number;
    now: Date;
    /**
     * 남은 시간이 없으면 참.
     *
     * **청크마다 다시 본다** — `runKeywords` 와 같은 이유다. 진입 직전에 한 번만 보면
     * 그 순간 통과한 뒤로 청크 수 × 타임아웃만큼을 더 쓰고 Vercel 상한을 넘긴다.
     * 넘기면 함수가 죽어 응답 본문이 없고, 그날의 계측이 통째로 사라진다.
     */
    exhausted?: () => boolean;
  },
): Promise<HotIssueReport> {
  const report: HotIssueReport = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    gated: 0,
    duplicates: 0,
    failureReasons: [],
    usage: {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    skipped: 0,
    error: null,
  };

  let candidates: HotIssueCandidate[];
  let alreadyPicked: string[];
  try {
    candidates = await ports.listHotIssueCandidates(opts.limit);
    alreadyPicked = await ports.listPickedTitlesToday(opts.now);
  } catch (e) {
    report.error = errorText(e).slice(0, MAX_FAILURE_REASON_LENGTH);
    return report;
  }

  // 후보가 없으면 모델을 부르지 않는다. 부르지 않는다는 것 자체가 이 단계의 계약이다.
  if (candidates.length === 0) return report;

  const size = Math.max(1, opts.concurrency);

  for (let i = 0; i < candidates.length; i += size) {
    // 청크 머리에서 예산을 다시 본다. 남은 것은 **묻지 않고** 건수만 남긴다 —
    // 이 글들은 `hot_issue_at` 이 비어 있어 다음 주기에 그대로 다시 잡힌다.
    if (opts.exhausted?.() === true) {
      report.skipped = candidates.length - i;
      break;
    }
    const chunk = candidates.slice(i, i + size);

    // 청크마다 다시 만든다 — 앞 청크가 뽑은 것이 뒤 청크의 "이미 뽑힌 목록"에 실린다(INV-G4).
    // 한 번만 만들어 돌려 쓰면 같은 사건을 다룬 두 글이 같은 바퀴 안에서 둘 다 뽑힌다.
    const picked = [...alreadyPicked];

    const settled = await Promise.allSettled(
      chunk.map((item) =>
        ports.judgeHotIssue({
          title: item.title,
          evidence: item.evidence,
          alreadyPicked: picked,
        }),
      ),
    );

    const saves: HotIssueSave[] = [];
    const gatedInChunk: string[] = [];
    const titlesPickedInChunk: string[] = [];

    for (const [index, result] of settled.entries()) {
      report.attempted += 1;
      const item = chunk[index];

      if (result.status === "rejected") {
        report.failed += 1;
        noteFailure(report.failureReasons, result.reason);
        continue;
      }

      // 토큰은 **결과를 어떻게 쓰든 먼저 센다** — 못 읽은 응답에도 요금은 나갔다.
      const { verdict, usage } = result.value;
      report.usage.calls += 1;
      report.usage.inputTokens += usage.inputTokens;
      report.usage.outputTokens += usage.outputTokens;
      report.usage.cacheReadTokens += usage.cacheReadTokens;
      report.usage.cacheWriteTokens += usage.cacheWriteTokens;

      if (verdict === null) {
        // **중요도를 채우지 않는다** (INV-G2). 0 으로 적으면 "물어봤는데 아니었다"와
        // "못 물어봤다"가 같아지고, 다음 주기가 다시 안 묻는다 — 조용한 영구 누락이다.
        report.failed += 1;
        noteFailure(report.failureReasons, new Error("응답을 읽지 못함(잘렸거나 형식이 깨짐)"));
        continue;
      }

      // **중요도 0 도 저장한다.** 붙일 문은 없지만 "물어봤다"는 표시를 남겨야 그 글이
      // 다음 주기 후보에서 빠진다 (`attachKeywords` 와 같은 자리).
      // **`answers` 를 같이 싣는다** (INV-G2 · S31). 2026-09-21 이전에는 파서가 돌려준
      // 이 값을 여기서 버렸고, 남는 것이 개수뿐이라 "왜 뽑혔나"를 되짚을 수 없었다.
      saves.push({
        itemId: item.id,
        importance: verdict.importance,
        answers: verdict.answers,
        // 근거 문장 (INV-G2 · 2026-09-23) — 상세 화면의 「signal 포인트」가 읽는다.
        reasons: verdict.reasons,
        kinds: verdict.kinds,
      });

      if (verdict.duplicateOfPicked) {
        // 중요도와 상관없이 뺀다 (INV-G4). 중요도는 그대로 저장돼 있으므로,
        // 나중에 "뽑힐 만했는데 중복이라 빠진 글"을 되짚을 수 있다.
        report.duplicates += 1;
        continue;
      }

      if (assignGate(verdict.importance) === null) continue;

      gatedInChunk.push(item.id);
      titlesPickedInChunk.push(item.title);
    }

    if (saves.length === 0) continue;

    try {
      await ports.saveHotIssue(saves);
      report.succeeded += saves.length;
      // 저장에 성공한 것만 다음 청크의 "이미 뽑힌 목록"에 올린다 — 저장이 죽은 글은
      // 다음 주기에 다시 판정받으므로, 뽑힌 것으로 치면 그 사건이 두 번 다 빠진다.
      alreadyPicked = [...alreadyPicked, ...titlesPickedInChunk];
    } catch (e) {
      // 저장 못 한 건은 성공이 아니다 — 성공으로 세면 다음 주기에 다시 안 잡힌 줄 알게 된다.
      // 이 청크만 잃고 다음 청크는 계속 간다 (INV-C4 와 같은 격리 규칙).
      report.failed += saves.length;
      noteFailure(report.failureReasons, e);
      // **배정도 건너뛴다.** 중요도가 안 남은 글에 문만 찍히면 화면에는 핫이슈로 뜨는데
      // 왜 뽑혔는지가 DB 에 없다.
      continue;
    }

    if (gatedInChunk.length === 0) continue;

    // ── 배정은 **청크마다** 한다 (2026-09-21 코드 리뷰, `surfaces: [concurrency]`) ──
    //
    // 전에는 바퀴 끝에 모아서 했다. 개수 상한(옛 INV-N4)이 있을 때는 그래야 했다 —
    // 다 모아야 이슈성 낮은 것부터 자를 수 있으니까. 같은 날 그 상한을 없애면서
    // 모을 이유가 사라졌는데 코드가 그대로 남아 있었다.
    //
    // 모으는 동안의 창이 최악 3분이다(후보 120건 ÷ 동시 8 = 청크 15개 × 최대 15초).
    // 그 안에 수집이 죽으면 이 바퀴에 문턱을 넘은 글이 **전부 영영 핫이슈가 못 된다** —
    // 판정이 끝나 `hot_issue_at` 이 찍혔으므로 다음 주기 후보에서 빠지고, 아무도 다시
    // 채우지 않는다. 청크마다 찍으면 잃는 범위가 그 청크 하나로 줄어든다.
    try {
      await ports.assignGates(gatedInChunk);
      report.gated += gatedInChunk.length;
    } catch (e) {
      // 배정만 실패한 경우다. 중요도·근거는 이미 저장돼 있어 다시 물어보지는 않는데,
      // 그 글들은 이번 바퀴에 핫이슈가 되지 못한다. **다음 청크는 계속 간다** —
      // 저장 실패와 같은 격리 규칙이다(INV-C4). 리포트에 남겨 사람이 보게 한다.
      //
      // `report.error` 로 올리지 않는다: 그 칸은 "단계 자체가 죽었다"는 뜻이고, 여기는
      // 청크 하나가 실패해도 나머지가 살아 있다. 둘을 같은 칸에 쓰면 그 구별이 사라진다.
      noteFailure(report.failureReasons, e);
    }
  }

  return report;
}
