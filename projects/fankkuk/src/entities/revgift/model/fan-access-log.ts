import { z } from "zod";

// 팬 「내 주소 열람 기록」 한 줄 — reverse-gift INV-R16: 그 몫의 주소를 연 줄(시각·몇 번째 출력)과 주소를 지운 줄(시각·까닭).
// 거부된 시도와 대표·직원 구분은 오지 않는다 — 운영자 내부 기록에만 있다(2026-10-12 문제집 D12, 크리에이터 열람 기록 INV-P7 과 같다).
// 주소 값·운송장 번호는 없다(INV-R7·R8). 정해진 칸 밖의 값이 섞여 오거나 종류와 칸이 어긋나면 목록 전체를 버린다(null).

/**
 * 몫 하나에서 주소를 여는 상한(INV-R7 의 3회). 팬 선물 상자의 상한(entities/address MAX_DECRYPTS_PER_BOX)과 같은 값이다 —
 * 같은 레이어의 다른 슬라이스라 가져다 쓸 수 없어 여기 적는다. DB check(revgift_decrypt_log.print_no between 1 and 3)와도 같다.
 */
export const REVGIFT_MAX_DECRYPTS = 3;

/** 주소를 지운 까닭(INV-R9) — 출고 확정·반송·취소·처분(office-workflow INV-W15). */
export const REVGIFT_DELETE_OUTCOMES = ["shipped", "returned", "cancelled", "disposed"] as const;
export type RevgiftDeleteOutcome = (typeof REVGIFT_DELETE_OUTCOMES)[number];

export type FanAccessEntry =
  /** printNo: 그 몫의 몇 번째 출력. released: 송장이 안 나와 돌려받은 줄(INV-R13) — 주소는 열렸고 줄도 그대로 보인다. */
  | { at: string; kind: "opened"; printNo: number; released: boolean }
  /** 출고·반송·취소·처분으로 주소를 지운 줄. */
  | { at: string; kind: "deleted"; outcome: RevgiftDeleteOutcome };

const at = z.iso.datetime({ offset: true });

const rowSchema = z.discriminatedUnion("kind", [
  z
    .object({
      at,
      kind: z.literal("opened"),
      print_no: z.number().int().min(1).max(REVGIFT_MAX_DECRYPTS),
      outcome: z.null(),
      released: z.boolean(),
    })
    .strict(),
  z
    .object({
      at,
      kind: z.literal("deleted"),
      print_no: z.null(),
      outcome: z.enum(REVGIFT_DELETE_OUTCOMES),
      released: z.literal(false),
    })
    .strict(),
]);

/** 꼴이 어긋난 자리 — 경로와 zod 코드만. 받은 값은 담지 않는다(서버 로그에 그대로 남기 때문). */
export type FanAccessLogShapeIssue = { path: string; code: string };

/** DB 가 준 순서(시각 역순)를 그대로 둔다. 꼴이 다르면 null — onIssues 로 어긋난 경로·코드만 알린다. */
export function parseFanAccessLogRows(rows: unknown, onIssues?: (issues: FanAccessLogShapeIssue[]) => void): FanAccessEntry[] | null {
  const parsed = z.array(rowSchema).safeParse(rows);
  if (!parsed.success) {
    onIssues?.(parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), code: i.code })));
    return null;
  }
  return parsed.data.map((r): FanAccessEntry => {
    const iso = new Date(r.at).toISOString();
    if (r.kind === "opened") return { at: iso, kind: "opened", printNo: r.print_no, released: r.released };
    return { at: iso, kind: "deleted", outcome: r.outcome };
  });
}
