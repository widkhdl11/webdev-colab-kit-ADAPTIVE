import type { TagAxis } from "@/entities/article";
import { KNOWN_LIMIT, anchorList, tally, tallyFrom, type Tally } from "./keyword-tally";
import type { EnrichUsage, KeywordAttachment, KeywordCandidate, KeywordPorts } from "./ports";

/**
 * 뱃지 키워드 한 바퀴 — badge-keywords INV-B1·B3·K1·K6 의 강제 지점.
 *
 * **요약(enrich)과 별개 단계인 이유** (2026-08-30): ① 이미 요약이 끝난 글은 요약 후보가
 * 아니라 거기 얹으면 기존 1115건에 키워드가 영영 안 붙는다 ② INV-B3 이 "이미 쓰인 키워드
 * 목록을 프롬프트에 같이 준다"를 요구해 **청크마다 목록을 갱신**해야 하는데 요약 단계는
 * 그런 구조가 아니다.
 *
 * `run-ingest` 의 한 단계이자 백필 스크립트의 본체다 — **같은 함수를 쓴다.** 두 벌로 쓰면
 * 백필로 확인한 동작과 매일 도는 동작이 갈린다.
 *
 * `runIngest` 와 같은 규칙: **이 함수는 던지지 않는다.** 던지면 Cron 한 번이 통째로 날아간다.
 */

export interface KeywordReport {
  /** 모델에 물어본 건수. */
  attempted: number;
  /** 응답을 읽었고 저장까지 끝난 건수 (붙일 키워드가 0개인 것도 포함). */
  succeeded: number;
  /** 호출이 죽었거나 응답을 못 읽었거나 저장이 죽은 건수. */
  failed: number;
  /**
   * 모델이 "짚이는 게 없다"고 빈 배열을 준 건수.
   *
   * **실패와 따로 센다.** 뭉개면 파싱이 통째로 깨진 주기가 "이 글들엔 키워드가 없었다"로
   * 보인다 — 리포트가 정상처럼 읽히고 뱃지 줄만 비어 간다.
   */
  noKeywords: number;
  failureReasons: string[];
  usage: EnrichUsage & { calls: number };
  /**
   * 예산이 떨어져 **묻지도 못하고 남긴** 건수 (INV-F5 와 같은 규칙).
   *
   * 실패와 다른 칸이어야 한다 — 실패는 "물어봤는데 안 됐다"이고 이건 "시간이 없어 안 물었다"다.
   * 뭉개면 리포트만 보고는 모델이 이상한지 예산이 빠듯한지 구별할 수 없다.
   * 이 글들은 `keywords_at` 이 비어 있어 다음 주기에 그대로 다시 잡힌다.
   */
  skipped: number;
  /** 단계 자체가 죽은 경우. 앞 청크의 저장분은 그대로 남는다. */
  error: string | null;
}

/** 리포트에 담을 서로 다른 실패 이유의 최대 개수·길이 — `run-ingest` 와 같은 규칙. */
const MAX_REASONS = 5;
const MAX_REASON_LENGTH = 200;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function noteFailure(into: string[], e: unknown): void {
  const reason = errorText(e).slice(0, MAX_REASON_LENGTH);
  if (into.length >= MAX_REASONS || into.includes(reason)) return;
  into.push(reason);
}

export async function runKeywords(
  ports: KeywordPorts,
  opts: {
    limit: number;
    concurrency: number;
    /**
     * 남은 시간이 없으면 참 (INV-F5).
     *
     * **청크마다 다시 본다.** 진입 직전에 한 번만 보면, 그 순간 통과한 뒤로 최악
     * `KEYWORD_BATCH / KEYWORD_CONCURRENCY` 청크 × 타임아웃(15초) = 150초를 더 쓴다.
     * `INGEST_BUDGET_MS` 가 240초이고 Vercel 상한이 300초라 그대로 넘긴다 — 넘기면
     * 함수가 죽어 **응답 본문이 없고**, 그날의 실패 이유·토큰 계측이 통째로 사라진다
     * (2026-08-13 에 소스 루프에서 같은 결함을 고쳤는데 이 단계만 빠져 있었다).
     *
     * 안 주면 안 본다 — 스크립트에서 부를 때는 예산 개념이 없다.
     */
    exhausted?: () => boolean;
  },
): Promise<KeywordReport> {
  const report: KeywordReport = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    noKeywords: 0,
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

  let candidates: KeywordCandidate[];
  let fields: Tally;
  let kinds: Tally;
  try {
    candidates = await ports.listKeywordCandidates(opts.limit);
    const anchors = await ports.loadKeywordAnchors();
    fields = tallyFrom(anchors.fields);
    kinds = tallyFrom(anchors.kinds);
  } catch (e) {
    report.error = errorText(e).slice(0, MAX_REASON_LENGTH);
    return report;
  }

  // 후보가 없으면 모델을 부르지 않는다. 빈 배열에 `Promise.allSettled` 를 돌려도 되지만,
  // 부르지 않는다는 것 자체가 이 단계의 계약이라 명시한다.
  if (candidates.length === 0) return report;

  const size = Math.max(1, opts.concurrency);
  for (let i = 0; i < candidates.length; i += size) {
    // 청크 머리에서 예산을 다시 본다. 남은 것은 **묻지 않고** 건수만 남긴다 —
    // 이 글들은 `keywords_at` 이 비어 있어 다음 주기에 그대로 다시 잡힌다.
    if (opts.exhausted?.() === true) {
      report.skipped = candidates.length - i;
      break;
    }

    const chunk = candidates.slice(i, i + size);

    // 청크마다 다시 만든다 — 앞 청크가 만든 키워드가 뒤 청크에 실린다(INV-B3).
    // **축마다 따로** 준다: 한 목록으로 합치면 모델이 사건종류 자리에 분야를 쓴다.
    // 자르는 자리는 여기 하나뿐이다(INV-K6) — 조립(`buildKeywordPrompt`)은 안 자른다.
    const knownFields = anchorList(fields, KNOWN_LIMIT);
    const knownKinds = anchorList(kinds, KNOWN_LIMIT);

    const settled = await Promise.allSettled(
      chunk.map((item) =>
        ports.extractKeywords({
          title: item.title,
          evidence: item.evidence,
          knownFields,
          knownKinds,
        }),
      ),
    );

    const attachments: KeywordAttachment[] = [];
    for (const [index, result] of settled.entries()) {
      report.attempted += 1;
      const item = chunk[index];

      if (result.status === "rejected") {
        report.failed += 1;
        noteFailure(report.failureReasons, result.reason);
        continue;
      }

      // 토큰은 **결과를 어떻게 쓰든 먼저 센다** — 못 읽은 응답에도 요금은 나갔다.
      // 성공 분기에서 세면 "실패에만 돈이 나간 주기"가 보고서 어디에도 안 남는다.
      const { keywords, usage } = result.value;
      report.usage.calls += 1;
      report.usage.inputTokens += usage.inputTokens;
      report.usage.outputTokens += usage.outputTokens;
      report.usage.cacheReadTokens += usage.cacheReadTokens;
      report.usage.cacheWriteTokens += usage.cacheWriteTokens;

      if (keywords === null) {
        report.failed += 1;
        noteFailure(report.failureReasons, new Error("응답을 읽지 못함(잘렸거나 형식이 깨짐)"));
        continue;
      }

      if (keywords.fields.length === 0 && keywords.kinds.length === 0) report.noKeywords += 1;

      // 집계는 **저장 성공 여부와 무관하게** 여기서 한다. 앵커는 "무엇을 이미 썼나"가 아니라
      // "무엇을 이미 만들었나"의 목록이라, 저장이 죽은 글의 표기도 다음 청크가 맞춰야 한다.
      tally(fields, keywords.fields);
      tally(kinds, keywords.kinds);
      // **빈 결과도 넘긴다.** 붙일 링크는 없지만 "물어봤다"는 표시(`keywords_at`)를 남겨야
      // 한다 — 안 남기면 키워드가 0개인 글이 매 주기 후보로 다시 뽑혀 같은 질문에 계속
      // 요금을 쓴다. 반대로 **못 읽은 응답은 안 넘긴다**(위에서 continue) — 그건 다시 물어야 한다.
      attachments.push({ itemId: item.id, fields: keywords.fields, kinds: keywords.kinds });
    }

    if (attachments.length === 0) continue;

    try {
      await ports.attachKeywords(attachments);
      report.succeeded += attachments.length;
    } catch (e) {
      // 저장 못 한 건은 성공이 아니다 — 성공으로 세면 다음 주기에 다시 안 잡힌 줄 알게 된다.
      // 이 청크만 잃고 다음 청크는 계속 간다 (INV-C4 와 같은 격리 규칙).
      report.failed += attachments.length;
      noteFailure(report.failureReasons, e);
    }
  }

  return report;
}

// 여기 `axisEntries`(글 하나를 `[분야…, 사건종류…]` 로 펴는 함수)가 있었다.
// 2026-08-31 에 `lib/tag-links.ts` 의 `batchAxisEntries` 로 대체했다 — 글 단위로 펴면
// 배치 안에서 앞 글의 사건종류가 뒤 글의 분야를 이겨 축이 뒤집힌다. 순서 규칙은
// `tagUpsertRows` 와 같은 파일에 둔다(계약이 두 파일로 갈려 있어서 생긴 결함이다).
