import { z } from "zod";

// 크리에이터 확인 (2026-10-12 (2) 문제집 D3 ②, office-workflow INV-W4·W6).
// 블루투스·RF 반응이 나왔지만 직원이 위치 추적기가 아니라고 판정한 팬 선물 상자는 바로 통과하지 않고 크리에이터에게 받을지 묻는다.
// 검수 완료 스캔부터 이 날수(168시간) 안에 답이 없으면 자동 처리가 반송 대기로 넘긴다 — DB(office_run_expiry·answer_creator_check)가 같은 기한을 쓴다.
export const CREATOR_CHECK_DAYS = 7;

/** 답을 기다리는 상자 한 줄(DB 읽기 함수 my_creator_checks — 로그인한 크리에이터의 것만) */
export type CreatorCheckView = {
  orderNo: string;
  boxSeq: number;
  senderNickname: string;
  itemKind: string;
  /** 검수에서 반응이 나온 신호 — 화면 안내 문구용(알림 본문에는 넣지 않는다, notifications INV-N1) */
  bluetooth: boolean;
  rf: boolean;
  askedAt: string;
  /** 이때까지 답이 없으면 반송 대기로 넘어간다 */
  dueAt: string;
};

export type CreatorCheckAnswer = "accept" | "return";

const row = z.object({
  order_no: z.string().min(1),
  box_seq: z.number().int().positive(),
  sender_nickname: z.string(),
  item_kind: z.string(),
  bluetooth: z.boolean(),
  rf: z.boolean(),
  asked_at: z.string().min(1),
  due_at: z.string().min(1),
});

const iso = (v: string) => new Date(v).toISOString();

/** 꼴이 다르면 던진다 — 모르는 칸이 섞인 목록을 화면에 내지 않는다 */
export function parseCreatorCheckRows(rows: unknown): CreatorCheckView[] {
  return z
    .array(row.strict())
    .parse(rows ?? [])
    .map((r) => ({
      orderNo: r.order_no,
      boxSeq: r.box_seq,
      senderNickname: r.sender_nickname,
      itemKind: r.item_kind,
      bluetooth: r.bluetooth,
      rf: r.rf,
      askedAt: iso(r.asked_at),
      dueAt: iso(r.due_at),
    }));
}

/** 반응이 나온 신호 이름 — 「블루투스」, 「무선(RF)」, 둘 다면 「블루투스·무선(RF)」 */
export function detectedSignalText(v: Pick<CreatorCheckView, "bluetooth" | "rf">): string {
  const parts = [v.bluetooth ? "블루투스" : null, v.rf ? "무선(RF)" : null].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join("·") : "무선";
}

const HOUR_MS = 3_600_000;

/** 답할 기한이 지났는가 — 지났으면 받기·돌려보내기 버튼을 두지 않는다. DB(answer_creator_check)도 기한 시각 정각부터 답을 받지 않는다(INV-W6). */
export function isCreatorCheckDeadlinePassed(dueAt: string, now: string): boolean {
  return Date.parse(dueAt) <= Date.parse(now);
}

/** 남은 기간 꼬리표 — 승인 요청과 같은 방식(하루 넘게 남으면 일 내림, 하루 안이면 시간 올림). 기준 시각은 화면을 그리는 서버가 넘긴다. */
export function checkTimeLeftLabel(dueAt: string, now: string): string {
  const left = Date.parse(dueAt) - Date.parse(now);
  if (left <= 0) return "답할 기한 지남";
  if (left < 24 * HOUR_MS) return `남은 기간 ${Math.ceil(left / HOUR_MS)}시간`;
  return `남은 기간 ${Math.floor(left / (24 * HOUR_MS))}일`;
}
