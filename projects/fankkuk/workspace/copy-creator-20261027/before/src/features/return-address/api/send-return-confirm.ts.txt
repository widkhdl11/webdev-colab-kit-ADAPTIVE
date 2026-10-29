import { z } from "zod";
import type { ReturnAddressWrite } from "../model/confirm-return-address";

// 브라우저에서 반송 주소 확인을 보낸다(/api/me/return-address — office-workflow INV-W15, action-center INV-J4).
// 보내는 값은 주문번호와 상자 순번(팬 선물만)뿐이다 — 주소는 오가지 않는다. 등록 주소 암호문을 상자에 복사하는 것은 DB 다.
// ok = 확인됨 / login = 세션이 끝났다 / refused = 서버가 거부했다(사유 코드) / failed = 그 밖의 실패

export type ReturnRefusal = "not_found" | "no_address" | "expired" | "closed" | "retry";
export type SendReturnConfirmOutcome = { kind: "ok" } | { kind: "login" } | { kind: "refused"; reason: ReturnRefusal } | { kind: "failed" };

const refused = z.object({ reason: z.enum(["not_found", "no_address", "expired", "closed", "retry"]) });

export async function sendReturnConfirm(write: ReturnAddressWrite): Promise<SendReturnConfirmOutcome> {
  try {
    const res = await fetch("/api/me/return-address", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(write) });
    if (res.ok) return { kind: "ok" };
    if (res.status === 401) return { kind: "login" };
    const parsed = refused.safeParse(await res.json().catch(() => null));
    return res.status < 500 && parsed.success ? { kind: "refused", reason: parsed.data.reason } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
