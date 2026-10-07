import { OFFICE_REJECT_REASONS, type OfficeRejectReason } from "../model/office-error";

// 브라우저에서 사무실 작업 주소로 POST 한다. postJson 과 같지만 거부 이유(reason)를 같이 돌려준다 —
// 화면이 「앞 상자 라벨 대기」「검수 기록 없음」 같은 거부 카드를 고르는 데 쓴다(office-workflow INV-W2·W4).

export type OfficePostOutcome =
  | { kind: "ok"; body: Record<string, unknown> }
  | { kind: "failed"; status: number; message: string; reason: OfficeRejectReason | null };

const FALLBACK = "처리하지 못했어요. 잠시 뒤 다시 해 주세요.";

function reasonOf(value: unknown): OfficeRejectReason | null {
  return OFFICE_REJECT_REASONS.find((r) => r === value) ?? null;
}

export async function postOffice(url: string, payload: unknown): Promise<OfficePostOutcome> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok) return { kind: "ok", body: body ?? {} };
    return { kind: "failed", status: res.status, message: typeof body?.message === "string" ? body.message : FALLBACK, reason: reasonOf(body?.reason) };
  } catch {
    return { kind: "failed", status: 0, message: FALLBACK, reason: null };
  }
}
