import { dayKey, dayStartIso } from "@/shared/lib/datetime";
import { BATCH_PUBLISHED_LOOKBACK_DAYS, INGEST_SCHEDULE_HOUR_KST } from "./budgets";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * 비싼 단계(본문 긁기·요약·번역·핫이슈 판정·키워드)가 **볼 글의 범위** — 그날 배치의 시작.
 *
 * 2026-09-30 사용자 결정(`signal-20260930-1-d1`): 수집의 목적은 **그날 들어온 글을 그날 처리**하는
 * 것이다. 이어달리기는 그날 일이 한 바퀴(300초)에 안 끝날 때 잇는 것이지, 지난 날짜 글을 채우는
 * 것이 아니다. 그래서 가장 최근 예약 시각(오전 7시 KST) 이후 **처음 본**(`item.created_at`) 글만
 * 후보로 본다.
 *
 * 전에는 「오늘 포함 3일」 창이었다(2026-09-22). 그건 그때까지 수집을 거의 안 돌려서 프로토타입에
 * 쓸 결과가 필요해 3일치를 한 번 돌리려던 것이었는데, 그대로 남아 매일의 규칙이 됐다. 그 결과
 * 9/29 수집이 크레딧 부족으로 통째로 실패하자 9/30 이어달리기가 9/28·9/29 글까지 할 일로 잡았다.
 *
 * 왜 0시가 아니라 예약 시각인가: 예약 실행은 하루 한 번 7시다. 0시로 끊으면 전날 7시~자정에
 * 들어온 글은 어느 실행도 맡지 않는다(전날 7시엔 없었고, 오늘 7시엔 「어제 글」이다).
 *
 * 왜 발행 시각이 아니라 처음 본 시각인가: 피드에 늦게 올라오는 글이 있다. 발행 시각으로 자르면
 * 어제 날짜로 발행돼 오늘 처음 들어온 글이 어느 배치에도 안 든다.
 *
 * 대가: 하루 수집이 통째로 실패하면 그날 글은 다음 날 자동으로 채워지지 않는다. 필요하면 그날만
 * 손으로 돌린다. 창 밖 글을 지우지는 않는다 — 화면에는 그대로 있고 요약·키워드가 없을 뿐이다.
 *
 * `null` = 시각을 못 읽음. 부르는 쪽은 **후보를 0건으로** 본다 — 창 없이 전체를 보면 요약 안 된
 * 옛 글 전부가 후보가 되어, 그날 것만 처리한다는 결정과 정반대가 된다(2026-09-30 보안 리뷰).
 */
export function batchStartIso(now: Date): string | null {
  if (Number.isNaN(now.getTime())) return null;
  const start = dayStartIso(dayKey(now.toISOString()));
  if (start === null) return null;
  const todaySchedule = Date.parse(start) + INGEST_SCHEDULE_HOUR_KST * HOUR_MS;
  // 예약 시각 전이면 어제 배치가 아직 진행 중이다.
  const batch = now.getTime() >= todaySchedule ? todaySchedule : todaySchedule - DAY_MS;
  return new Date(batch).toISOString();
}

export interface BatchWindow {
  /** `item.created_at` 하한 — 그날 배치의 시작. */
  firstSeenFrom: string;
  /** `item.published_at` 하한 — 새 소스의 옛 글이 배치에 끼어드는 것을 막는다(`BATCH_PUBLISHED_LOOKBACK_DAYS`). */
  publishedFrom: string;
}

/** 후보 조회 네 곳(본문 긁기·요약/번역·키워드·핫이슈)이 **같이** 쓰는 창. `null` 이면 후보 0건. */
export function batchWindow(now: Date): BatchWindow | null {
  const firstSeenFrom = batchStartIso(now);
  if (firstSeenFrom === null) return null;
  const publishedFrom = new Date(Date.parse(firstSeenFrom) - BATCH_PUBLISHED_LOOKBACK_DAYS * DAY_MS).toISOString();
  return { firstSeenFrom, publishedFrom };
}
