import { z } from "zod";

// 결제사(토스페이먼츠) 결제 취소 응답 판정. 결제사 취소는 멱등 키로 다시 불러도 첫 요청의 결과를 돌려주므로,
// 응답이 「이 요청의」 취소 완료인지만 본다 — 금액을 정한 부분 취소(cancelOutcome)와 남은 금액 전부 취소(fullCancelVerdict).

const cancelShape = z.object({
  paymentKey: z.string(),
  status: z.string(),
  cancels: z.array(z.object({ cancelAmount: z.number(), cancelStatus: z.string(), canceledAt: z.string().optional() })),
});
const errorShape = z.object({ code: z.string(), message: z.string() });

/**
 * 금액을 정한 취소 응답이 이 요청의 성공인가. 결제 키가 같고, 취소 상태(전체·부분)이고, **마지막(가장 늦은) 취소 줄**이
 * 이 금액의 취소 완료여야 성공. 한 결제를 여러 번 나눠 취소하면 앞선 취소 줄이 같이 온다 —
 * 부르는 쪽이 같은 결제의 취소를 한 번에 하나만 내보내면 이번 요청의 줄이 마지막이다.
 * 실패면 기록에 남길 오류 문구(200자 안).
 */
type CancelLine = { cancelAmount: number; cancelStatus: string; canceledAt?: string | undefined };

/** 가장 늦은 취소 줄. 시각이 있으면 시각으로, 없으면 배열의 마지막. */
function latestCancel(lines: readonly CancelLine[]): CancelLine | undefined {
  let latest: CancelLine | undefined;
  for (const line of lines) {
    if (!latest || (line.canceledAt && latest.canceledAt ? Date.parse(line.canceledAt) >= Date.parse(latest.canceledAt) : true)) latest = line;
  }
  return latest;
}

function isThisCancel(line: CancelLine | undefined, amountKrw: number): boolean {
  return line !== undefined && line.cancelAmount === amountKrw && line.cancelStatus === "DONE";
}

export function cancelOutcome(res: unknown, paymentKey: string, amountKrw: number): { ok: true } | { ok: false; error: string } {
  const done = cancelShape.safeParse(res);
  if (
    done.success &&
    done.data.paymentKey === paymentKey &&
    (done.data.status === "CANCELED" || done.data.status === "PARTIAL_CANCELED") &&
    isThisCancel(latestCancel(done.data.cancels), amountKrw)
  ) {
    return { ok: true };
  }
  const err = errorShape.safeParse(res);
  const text = err.success ? `${err.data.code} ${err.data.message}` : "결제사 응답을 알아볼 수 없음";
  return { ok: false, error: text.slice(0, 200) };
}


/**
 * 남은 금액 전부를 취소한 요청(취소 금액을 비워 보낸 전액 취소)의 결과를 셋으로 가른다.
 * ok — 결제 키가 같고 결제가 전부 취소됨(CANCELED)이며 마지막 취소 줄이 완료.
 * rejected — 결제사가 오류 꼴(code·message)로 답했다. 취소되지 않은 것이 확실하다.
 * unknown — 그 밖의 꼴. 응답을 받지 못한 경우(시간 초과·연결 끊김)와 같이, 결제사에서 취소가 됐을 수도 있다.
 */
export type FullCancelVerdict = { kind: "ok" } | { kind: "rejected"; error: string } | { kind: "unknown" };

export function fullCancelVerdict(res: unknown, paymentKey: string): FullCancelVerdict {
  const done = cancelShape.safeParse(res);
  if (done.success && done.data.paymentKey === paymentKey && done.data.status === "CANCELED" && latestCancel(done.data.cancels)?.cancelStatus === "DONE") {
    return { kind: "ok" };
  }
  const err = errorShape.safeParse(res);
  if (err.success) return { kind: "rejected", error: `${err.data.code} ${err.data.message}`.slice(0, 200) };
  return { kind: "unknown" };
}
