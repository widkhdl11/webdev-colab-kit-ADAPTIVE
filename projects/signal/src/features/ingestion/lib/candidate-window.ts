import { dayKey, dayStartIso } from "@/shared/lib/datetime";
import { CANDIDATE_WINDOW_DAYS, ENRICH_FLOOR_ISO } from "./budgets";

/**
 * 비싼 단계(본문 긁기·요약·번역·핫이슈 판정·키워드)가 **볼 글의 범위**.
 *
 * 왜 창을 거나 (2026-09-22 사용자 결정): 후보가 전체 기간이면 대기열이 유입량보다 빨리
 * 자라서 영영 안 줄어든다. 실측으로 요약 없는 글이 1,560건이었고, 고르는 기준이
 * 최신순이라 그 글들은 **다음 주기에도 그다음에도 순위 안에 못 든다.** 즉 대기열이
 * 아니라 영구 누락이었다. 그 상태로 한 바퀴 예산만 키우면 요금만 늘고 밀린 것은 그대로다.
 *
 * 창 밖 글을 **지우지는 않는다.** 화면에는 그대로 있고, 요약·키워드가 없을 뿐이다.
 *
 * 날짜 단위로 자르는 이유: 뱃지 줄의 창(`BADGE_WINDOW_DAYS`)도 날짜 단위라, 여기만
 * "72시간 전부터"로 하면 **뱃지에는 있는데 키워드는 안 붙는 날**이 생긴다. 같은 기준을 쓴다.
 */
export function candidateWindowStartIso(
  now: Date,
  days: number = CANDIDATE_WINDOW_DAYS,
  floorIso?: string,
): string | null {
  // 읽을 수 없는 시각이면 창을 안 건다. `toISOString()` 은 그런 값에 **던진다** —
  // 여기서 막지 않으면 후보 조회가 통째로 죽고, 그 단계가 그날 아무 일도 못 한다.
  if (Number.isNaN(now.getTime())) return null;
  // 오늘을 포함해 `days` 일이다 — 3일이면 그저께 0시(KST)부터다.
  const todayKey = dayKey(now.toISOString());
  const start = dayStartIso(todayKey);
  if (start === null) return null;
  const startMs = Date.parse(start) - (days - 1) * 24 * 60 * 60 * 1000;
  if (Number.isNaN(startMs)) return null;

  // 기준 시각과 둘 중 **늦은 쪽**을 쓴다 (2026-09-23).
  //
  // 창은 「얼마나 거슬러 올라가나」이고 기준 시각은 「여기보다 앞은 아예 안 본다」다.
  // 늦은 쪽을 골라야 둘 다 지켜진다 — 이른 쪽을 고르면 기준 시각이 창을 **넓히는** 일이
  // 생기고, 그건 아끼려다 옛날 글 전부를 후보로 만드는 것이다.
  //
  // 못 읽는 값은 **없는 것으로 본다.** 여기서 null 을 돌려주면 창이 통째로 사라져 같은
  // 방향으로 틀린다 — 설정 하나가 잘못 적힌 대가가 「전부 다 한다」면 안 된다.
  const floorMs = floorIso === undefined ? NaN : Date.parse(floorIso);
  if (!Number.isNaN(floorMs) && floorMs > startMs) return new Date(floorMs).toISOString();
  return new Date(startMs).toISOString();
}

/**
 * **돈이 드는 단계**(본문 긁기·요약·번역·키워드)가 쓰는 창 (2026-09-23).
 *
 * 3일 창에 기준 시각을 겹쳐 놓은 것이다. 창만 쓰는 `candidateWindowStartIso` 와 따로 두는
 * 이유는 **주제 판정과 핫이슈 판정은 이 기준에 안 걸려야** 하기 때문이다 — 그 둘이 멈추면
 * 화면이 틀린다(INV-CB8 과 같은 기준). 기본값으로 섞어 두면 "어느 단계가 기준 시각을
 * 받는가"가 부르는 쪽마다 흩어지고, 그건 나중에 한 곳만 빠뜨리는 자리가 된다.
 */
export function enrichWindowStartIso(now: Date): string | null {
  return candidateWindowStartIso(now, CANDIDATE_WINDOW_DAYS, ENRICH_FLOOR_ISO);
}
