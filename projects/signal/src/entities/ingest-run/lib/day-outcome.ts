import { dayKey, dayStartIso } from "@/shared/lib/datetime";
import { INGEST_RUN_FAILURE_STAGES, type IngestRunFailureStage, type IngestRunRecord } from "../model/types";

/**
 * 날짜별 「그날 처리 결과」 (2026-09-27 사용자 요청).
 *
 * 대시보드가 최신 실행 하나의 숫자만 보여줘서, **어제 수집이 성공했는지**를 알려면 표를 읽고
 * 스스로 판단해야 했다. 여기서 하루를 성공·실패 하나로 접고, 실패면 이유를 사람 말로 적는다.
 *
 * 기준(2026-09-27 사용자 지시): **모든 단계가 성공한 날만 성공이다. 한 단계라도 실패하면 실패이고,
 * 실패한 단계를 이유에 적는다.** 단계 = 피드 받기·주제 판정·핫이슈 판정·본문 긁기·요약·제목 번역·키워드.
 * 한 건만 실패해도 그 단계는 실패다 — 건수는 같이 적는다(「120건 중 12건」).
 * 단계 밖의 실패: 실행 기록 없음 · 요금 상한 도달 · 요금 조회 실패 · 남은 일이 있는 채 끝남.
 * (처음엔 한 건짜리 실패를 「참고」로 내렸는데, 사용자가 전부 실패로 보겠다고 정했다.)
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

/** 마지막 실행 뒤 이만큼 지나도 다음 바퀴가 없으면 이어달리기가 끝난 것으로 본다(오늘 날짜에만 쓴다). */
const CHAIN_SETTLE_MS = 30 * 60 * 1000;

/** 이유 줄의 순서 — 파이프라인이 실제로 도는 순서다. */
const FEED_LABEL = "피드 받기";
const STAGE_ORDER = [FEED_LABEL, ...INGEST_RUN_FAILURE_STAGES.map((s) => STAGE_LABELS[s])];

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

/** 한 단계가 그날 모든 실행에 걸쳐 낸 실패. */
interface StageTally {
  failed: number;
  /** 시도 건수를 아는 실행에서만 더한다. 모르면(옛 기록) 「N건 실패」로만 적는다. */
  attempted: number;
  attemptedKnown: boolean;
  whole: boolean;
  texts: Set<string>;
}

function stageLine(label: string, t: StageTally): string {
  // 피드 받기는 소스 단위다. 바퀴마다 같은 소스를 다시 받아서 건수를 더하면 부풀므로 이름 수로 센다.
  if (label === FEED_LABEL) return `${label} — 소스 ${t.texts.size}곳 실패 (${[...t.texts].join(", ")})`;
  const what = t.whole
    ? "단계 전체가 멈춤"
    : t.attemptedKnown && t.attempted > 0
      ? `${t.attempted}건 중 ${t.failed}건 실패`
      : `${t.failed}건 실패`;
  return t.texts.size === 0 ? `${label} — ${what}` : `${label} — ${what} (${[...t.texts].join(", ")})`;
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

  const tallies = new Map<string, StageTally>();
  const tally = (label: string) => {
    const t = tallies.get(label) ?? { failed: 0, attempted: 0, attemptedKnown: true, whole: false, texts: new Set<string>() };
    tallies.set(label, t);
    return t;
  };
  let unknownFailures = false;
  let capped: { capUsd: number } | null = null;

  for (const run of ordered) {
    // 피드 받기 — 소스별 오류로 센다(실패 이유 칸이 생기기 전 기록에도 있다).
    const feedFailed = run.sources.filter((s) => s.error !== null);
    if (feedFailed.length > 0) {
      const t = tally(FEED_LABEL);
      for (const s of feedFailed) t.texts.add(s.sourceId);
    }

    if (run.failures === null) {
      unknownFailures = true;
      // 이유 칸이 없던 실행도 본문 긁기 실패 건수는 소스별로 남아 있다.
      const extractionFailed = run.sources.reduce((n, s) => n + s.extractionFailed, 0);
      if (extractionFailed > 0) {
        const t = tally(STAGE_LABELS.extraction);
        t.failed += extractionFailed;
        t.attemptedKnown = false;
      }
    }
    // 단계 건수는 이유마다 같은 값이 반복돼 담긴다 — 실행마다 단계당 한 번만 더한다.
    const counted = new Set<string>();
    for (const f of run.failures ?? []) {
      const t = tally(STAGE_LABELS[f.stage]);
      if (!counted.has(f.stage)) {
        counted.add(f.stage);
        t.failed += f.failed;
        t.attempted += f.attempted;
      }
      if (f.whole) t.whole = true;
      // 빈 이유 = 실패 건수만 있고 이유는 안 남은 경로(요약 형식 불합격 등). 건수만 적는다.
      if (f.reason.trim() !== "") t.texts.add(explainFailure(f.reason));
    }
    if (run.cost?.capped && !run.cost.lookupFailed) capped = { capUsd: run.cost.capUsd };
    if (run.cost?.lookupFailed) tally("요금 조회").texts.add("오늘 쓴 요금을 읽지 못해 요약·키워드를 멈춤");
  }

  for (const label of STAGE_ORDER) {
    const t = tallies.get(label);
    if (t !== undefined) reasons.push(stageLine(label, t));
  }
  const lookup = tallies.get("요금 조회");
  if (lookup !== undefined) reasons.push(...lookup.texts);
  if (capped !== null) reasons.push(`하루 요금 상한(${fmtUsd(capped.capUsd)})에 닿아 요약·키워드를 멈춤`);

  // 이어달리기는 요금 상한과 함께 생겼다(2026-09-22) — 요금 기록(cost)이 없는 실행은 그 전이라,
  // 남은 일을 다음 날로 넘기는 것이 그때의 정상 동작이었다. 실패가 아니라 참고다.
  if (hasRemainingWork(latestRun.budget) && settled(latestRun)) {
    if (latestRun.cost === null) notes.push("남은 일이 있는 채 끝났다 — 이어달리기가 생기기 전의 실행이다");
    else reasons.push("처리 못 한 일이 남은 채 끝남 — 이어달리기가 끊겼거나 바퀴 상한에 닿았다");
  }

  if (unknownFailures) {
    notes.push("실패 이유를 저장하기 전의 실행이 섞여 있어, 그 실행의 모델 호출 실패는 여기 안 보인다");
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
