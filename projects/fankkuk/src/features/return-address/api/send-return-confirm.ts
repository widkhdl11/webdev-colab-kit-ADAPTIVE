import { z } from "zod";
import type { ReturnAddressWrite } from "../model/confirm-return-address";

// 브라우저에서 반송 주소 확인을 보낸다(/api/me/return-address — office-workflow INV-W15, action-center INV-J4).
// 보내는 값은 주문번호와 상자 순번(팬 선물만), 「다른 주소 입력」이면 이 브라우저에서 봉인한 주소(address) — 평문은 오가지 않는다.
// 결제 때 받은 주문 사본·크리에이터 등록 주소를 상자에 복사하는 것은 DB 다.
// ok = 확인됨 / login = 세션이 끝났다 / refused = 서버가 거부했다(사유 코드) / failed = 그 밖의 실패

export type ReturnRefusal = "not_found" | "no_address" | "expired" | "closed" | "retry";
export type SendReturnConfirmOutcome =
  | { kind: "ok" }
  | { kind: "login" }
  | { kind: "refused"; reason: ReturnRefusal }
  | { kind: "invalid"; message: string }
  | { kind: "failed" };
const invalid = z.object({ message: z.string() });

const refused = z.object({ reason: z.enum(["not_found", "no_address", "expired", "closed", "retry"]) });

export async function sendReturnConfirm(write: ReturnAddressWrite): Promise<SendReturnConfirmOutcome> {
  try {
    const res = await fetch("/api/me/return-address", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(write) });
    if (res.ok) return { kind: "ok" };
    if (res.status === 401) return { kind: "login" };
    const json: unknown = await res.json().catch(() => null);
    // 봉인을 받지 않았다(400) — 서버 문구를 칸에 그대로 보인다
    const bad = invalid.safeParse(json);
    if (res.status === 400 && bad.success) return { kind: "invalid", message: bad.data.message };
    const parsed = refused.safeParse(json);
    return res.status < 500 && parsed.success ? { kind: "refused", reason: parsed.data.reason } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
