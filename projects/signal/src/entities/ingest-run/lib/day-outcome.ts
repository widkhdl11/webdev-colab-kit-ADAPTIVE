import { dayKey, dayStartIso } from "@/shared/lib/datetime";
import type { IngestRunFailureStage, IngestRunRecord } from "../model/types";

/**
 * 날짜별 「그날 처리 결과」 (2026-09-27 사용자 요청).
 *
 * 대시보드가 최신 실행 하나의 숫자만 보여줘서, **어제 수집이 성공했는지**를 알려면 표를 읽고
 * 스스로 판단해야 했다. 여기서 하루를 성공·실패 하나로 접고, 실패면 이유를 사람 말로 적는다.
 *
 * 무엇을 실패로 치나 — **파이프라인이 제 일을 못 한 것**만:
 *  - 그날 실행 기록이 없다(예약 실행이 안 돌았거나, 기록을 저장하기 전에 멈췄다)
 *  - 모델 호출 단계(주제 판정·핫이슈·요약·번역·키워드)에 실패 이유가 있다 — API 요금 부족이 여기 걸린다
 *  - 단계가 통째로 죽었다(후보 조회 실패 등)
 *  - 하루 요금 상한에 닿았거나, 오늘 쓴 요금을 못 읽어 멈췄다
 *  - 피드 소스가 **전부** 실패했다
 * 무엇을 실패로 치지 않나 — 남의 사이트 사정이라 매일 조금씩 나는 것은 「참고」로만 적는다:
 *  - 피드 소스 일부 실패(INV-C4: 일부 소스가 죽는 것은 정상 경로다), 본문 긁기 개별 실패
 *  - 시간 예산이 떨어져 남은 일(이어달리기가 다음 바퀴로 넘긴다)
 */

export type DayStatus = "ok" | "fail" | "pending";

export interface DayOutcome {
  /** KST 달력 날짜 `YYYY-MM-DD`. */
  day: string;
  status: DayStatus;
  /** 그날 첫 실행이 시작한 시각. 실행이 없으면 null. */
  firstStartedAt: string | null;
  runCount: number;
  /** 실패로 판정한 이유. `status` 가 fail 일 때만 차 있다. */
  reasons: string[];
  /** 실패로 치지 않는 참고 사항. 성공한 날에도 있을 수 있다. */
  notes: string[];
  /** 그날 가장 늦게 시작한 실행 — 아래 상세 표가 그린다. */
  latestRun: IngestRunRecord | null;
}

/**
 * 예약 실행 시각(KST 시). `vercel.json` 의 `0 22 * * *`(UTC) = 한국 시간 오전 7시.
 * 크론을 옮기면 같이 옮긴다 — 안 옮기면 실행 전인 시간에 「실행 기록 없음」 빨간불이 뜬다.
 */
const INGEST_SCHEDULE_HOUR_KST = 7;
/** 예약 시각 뒤 이만큼은 「아직 실행 전」으로 본다 — 크론은 정각에 안 돈다(수 분 늦는다). */
const SCHEDULE_GRACE_MINUTES = 30;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const STAGE_LABELS: Record<IngestRunFailureStage, string> = {
  topic: "주제 판정",
  hotIssue: "핫이슈 판정",
  extraction: "본문 긁기",
  summary: "요약",
  title: "제목 번역",
  keywords: "키워드",
};

/**
 * 오류 원문 → 사람이 읽을 이유. 원문은 SDK 가 만든 `400 {"type":"error",...}` 꼴이라
 * 그대로 두면 무엇이 문제인지 읽어 내야 한다. 모르는 것은 원문 앞부분을 그대로 둔다 —
 * 틀린 이름을 붙이는 것보다 원문이 낫다.
 */
const EXPLANATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/credit balance/i, "API 요금(크레딧) 부족"],
  [/authentication_error|invalid x-api-key|^401\b/i, "API 키 인증 실패"],
  [/permission_error|^403\b/i, "API 사용 권한 없음"],
  [/rate_limit_error|^429\b/i, "API 요청 한도 초과"],
  [/overloaded_error|^529\b/i, "API 서버 과부하"],
  [/api_error|^5\d\d\b/i, "API 서버 오류"],
  [/timed? ?out|timeout|aborted/i, "응답 시간 초과"],
  [/fetch failed|ECONNRESET|ENOTFOUND|connection/i, "네트워크 연결 실패"],
];
const RAW_REASON_MAX = 120;

export function explainFailure(reason: string): string {
  for (const [pattern, text] of EXPLANATIONS) if (pattern.test(reason)) return text;
  const trimmed = reason.trim();
  return trimmed.length > RAW_REASON_MAX ? `${trimmed.slice(0, RAW_REASON_MAX)}…` : trimmed;
}

const fmtUsd = (n: number) => `$${n.toFixed(2)}`;

/**
 * 이유 자체가 치명적인 것 — 한 건만 나도 그날은 실패다. 요금·키·권한은 다음 호출도 똑같이 막히므로
 * 「몇 건 중 몇 건」을 따질 이유가 없다. 나머지(과부하·응답 잘림·시간 초과)는 한 건씩 흔히 나서
 * 그 단계가 **한 건도 못 했을 때만** 실패로 친다(2026-09-27 코드 리뷰 — 핫이슈 판정 응답 잘림이 매일 6~17%).
 */
const FATAL = new Set(["API 요금(크레딧) 부족", "API 키 인증 실패", "API 사용 권한 없음"]);

/** 마지막 실행 뒤 이만큼 지나도 다음 바퀴가 없으면 이어달리기가 끝난 것으로 본다(오늘 날짜에만 쓴다). */
const CHAIN_SETTLE_MS = 30 * 60 * 1000;

/**
 * 그 실행이 끝났을 때 남은 일이 있었나 — features/ingestion `shouldChain` 과 **같은 기준**이다.
 * 기준이 갈리면 「이어달리기는 멈췄는데 화면은 남은 일이 없다」가 나온다. 옛 행의 null 은 「없다」로 본다.
 */
function hasRemainingWork(b: IngestRunRecord["budget"]): boolean {
  if (b.poolTruncated === true || b.skippedKeywords === true || b.skippedHotIssue === true) return true;
  if (b.skippedSources.length > 0) return true;
  return [
    b.skippedTopicChecks,
    b.skippedExtractions,
    b.skippedEnrichments,
    b.skippedKeywordItems ?? 0,
    b.skippedHotIssueItems ?? 0,
  ].some((n) => Number.isFinite(n) && n > 0);
}

function judgeDay(
  day: string,
  runs: readonly IngestRunRecord[],
  settled: (latest: IngestRunRecord) => boolean,
): Omit<DayOutcome, "status"> & { failed: boolean } {
  // 최신이 앞에 오게 — 부르는 쪽 정렬에 기대지 않는다.
  const ordered = [...runs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const latestRun = ordered[0]!;
  const reasons: string[] = [];
  const notes: string[] = [];

  // 같은 이유가 여러 단계·여러 실행에 나면 한 줄로 묶는다 — 요금이 떨어진 날은 모든 단계가
  // 같은 이유로 실패해서, 단계마다 한 줄씩 쓰면 같은 말이 대여섯 번 반복된다.
  const group = (into: Map<string, Set<string>>, text: string, stage: string) => {
    const stages = into.get(text) ?? new Set<string>();
    stages.add(stage);
    into.set(text, stages);
  };
  const fatal = new Map<string, Set<string>>();
  const stageDead = new Map<string, Set<string>>();
  const recovered = new Set<string>();
  const partial = new Map<string, { failed: number; attempted: number; texts: Set<string> }>();
  let unknownFailures = false;
  let capped: { capUsd: number } | null = null;

  for (const run of ordered) {
    const isLatest = run === latestRun;
    if (run.failures === null) unknownFailures = true;
    // 단계 건수는 이유마다 같은 값이 반복돼 담긴다 — 실행마다 단계당 한 번만 더한다.
    const counted = new Set<string>();
    for (const f of run.failures ?? []) {
      const text = explainFailure(f.reason);
      const label = STAGE_LABELS[f.stage];
      if (FATAL.has(text)) group(fatal, text, label);
      else if (f.whole || (f.attempted > 0 && f.failed >= f.attempted)) {
        // 단계가 한 건도 못 했다. 그날 마지막 실행이면 실패, 앞 바퀴면 뒤 바퀴가 다시 돌았으니 참고.
        if (isLatest) group(stageDead, text, label);
        else recovered.add(label);
      } else {
        const p = partial.get(label) ?? { failed: 0, attempted: 0, texts: new Set<string>() };
        if (!counted.has(label)) {
          counted.add(label);
          p.failed += f.failed;
          p.attempted += f.attempted;
        }
        p.texts.add(text);
        partial.set(label, p);
      }
    }
    if (run.cost?.capped && !run.cost.lookupFailed) capped = { capUsd: run.cost.capUsd };
  }

  for (const [text, stages] of fatal) reasons.push(`${text} — ${[...stages].join("·")}`);
  for (const [text, stages] of stageDead) reasons.push(`${[...stages].join("·")} 단계가 한 건도 처리하지 못함 — ${text}`);
  // 요금을 못 읽으면 상한에 닿은 것으로 보고 멈춘다. 그날 마지막 실행에서만 따진다 — 앞 바퀴의 일시 실패는 뒤 바퀴가 복구한다.
  if (latestRun.cost?.lookupFailed) reasons.push("오늘 쓴 요금을 읽지 못해 요약·키워드를 멈춤");
  if (capped !== null) reasons.push(`하루 요금 상한(${fmtUsd(capped.capUsd)})에 닿아 요약·키워드를 멈춤`);

  // 바퀴마다 소스 전부를 다시 받는다(route.ts). 한 바퀴의 일시 끊김으로 전부 실패해도 다른 바퀴가 받았으면
  // 그날 글은 들어왔다 — 소스를 받으려 한 **모든** 바퀴에서 전부 실패했을 때만 실패다.
  const withSources = ordered.filter((r) => r.sources.length > 0);
  const failedSources = new Set(withSources.flatMap((r) => r.sources.filter((s) => s.error !== null).map((s) => s.sourceId)));
  if (withSources.length > 0 && withSources.every((r) => r.sources.every((s) => s.error !== null))) {
    reasons.push("피드 소스를 전부 받지 못함");
  } else if (failedSources.size > 0) {
    notes.push(`피드 소스 ${failedSources.size}곳 받기 실패: ${[...failedSources].join(", ")}`);
  }

  // 그날 마지막 실행에 남은 일이 있으면 뒤를 이을 바퀴가 없었다는 뜻이다 — 이어달리기가 끊겼거나
  // 바퀴 상한에 닿았다. 2026-09-22 에 남은 일이 조용히 다음 날로 넘어간 것과 같은 모양이라 실패로 친다.
  // 이어달리기는 요금 상한과 함께 생겼다(2026-09-22) — 요금 기록(cost)이 없는 실행은 그 전이라,
  // 남은 일을 다음 날로 넘기는 것이 그때의 정상 동작이었다. 실패가 아니라 참고다.
  if (hasRemainingWork(latestRun.budget) && settled(latestRun)) {
    if (latestRun.cost === null) notes.push("남은 일이 있는 채 끝났다 — 이어달리기가 생기기 전의 실행이다");
    else reasons.push("처리 못 한 일이 남은 채 끝남 — 이어달리기가 끊겼거나 바퀴 상한에 닿았다");
  }

  for (const [label, p] of partial) {
    notes.push(`${label} ${p.attempted}건 중 ${p.failed}건 실패 — ${[...p.texts].join(", ")}`);
  }
  if (recovered.size > 0) {
    notes.push(`앞 바퀴에서 ${[...recovered].join("·")} 단계가 실패했지만 뒤 바퀴가 다시 돌았다`);
  }
  if (unknownFailures) {
    notes.push("실패 이유를 저장하기 전의 실행이 섞여 있어, 그 실행의 API 오류는 여기 안 보인다");
  }

  return {
    day,
    firstStartedAt: ordered.at(-1)!.startedAt,
    runCount: ordered.length,
    reasons,
    notes,
    latestRun,
    failed: reasons.length > 0,
  };
}

/**
 * 오늘부터 `days` 일 전까지, 최신 날이 앞에 오게 하루씩 접는다.
 * 실행이 없는 날도 빠뜨리지 않는다 — 빠지면 「안 돈 날」이 목록에서 사라져 안 보인다.
 */
export function summarizeDays(runs: readonly IngestRunRecord[], now: Date, days: number): DayOutcome[] {
  const byDay = new Map<string, IngestRunRecord[]>();
  for (const run of runs) {
    const key = dayKey(run.startedAt);
    if (key === "") continue;
    const list = byDay.get(key) ?? [];
    list.push(run);
    byDay.set(key, list);
  }

  const todayKey = dayKey(now.toISOString());
  const todayStart = dayStartIso(todayKey);
  const todayStartMs = todayStart === null ? now.getTime() : Date.parse(todayStart);
  const scheduleDueMs =
    todayStartMs + INGEST_SCHEDULE_HOUR_KST * HOUR_MS + SCHEDULE_GRACE_MINUTES * 60 * 1000;

  const out: DayOutcome[] = [];
  for (let i = 0; i < days; i++) {
    // 하루 시작 시각에서 정오를 더해 날짜 키를 뽑는다 — 경계 시각을 그대로 넣으면 오프셋 계산에서
    // 전날로 떨어질 여지가 생긴다.
    const key = dayKey(new Date(todayStartMs - i * DAY_MS + 12 * HOUR_MS).toISOString());
    const dayRuns = byDay.get(key) ?? [];
    if (dayRuns.length === 0) {
      const pending = key === todayKey && now.getTime() < scheduleDueMs;
      out.push({
        day: key,
        status: pending ? "pending" : "fail",
        firstStartedAt: null,
        runCount: 0,
        reasons: pending ? [] : ["실행 기록 없음 — 예약 실행이 안 돌았거나, 기록을 저장하기 전에 멈췄다"],
        notes: [],
        latestRun: null,
      });
      continue;
    }
    // 오늘은 마지막 실행 뒤 30분이 지나야 「이어달리기가 끝났다」로 본다 — 지나기 전엔 다음 바퀴가 올 수 있다.
    const settled = (latest: IngestRunRecord) =>
      key !== todayKey || now.getTime() - Date.parse(latest.startedAt) > CHAIN_SETTLE_MS;
    const { failed, ...rest } = judgeDay(key, dayRuns, settled);
    out.push({ ...rest, status: failed ? "fail" : "ok" });
  }
  return out;
}
