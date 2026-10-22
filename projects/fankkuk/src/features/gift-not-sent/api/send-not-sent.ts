import { z } from "zod";

// 브라우저에서 「아직 보내지 않음」을 보낸다(/api/gifts/not-sent — office-workflow INV-W10). 보내는 값은 주문번호뿐이다 —
// 누구 주문인지·남길 수 있는 상태인지는 DB 가 로그인 토큰으로 판정한다.
// ok = 남김 / login = 세션이 끝났다 / refused = 서버가 거부했다(서버 문구) / failed = 그 밖의 실패

export type SendNotSentOutcome = { kind: "ok" } | { kind: "login" } | { kind: "refused"; message: string } | { kind: "failed" };

const refused = z.object({ message: z.string().min(1) });

export async function sendNotSent(input: { orderNo: string }): Promise<SendNotSentOutcome> {
  try {
    const res = await fetch("/api/gifts/not-sent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    if (res.ok) return { kind: "ok" };
    if (res.status === 401) return { kind: "login" };
    const parsed = refused.safeParse(await res.json().catch(() => null));
    return res.status < 500 && parsed.success ? { kind: "refused", message: parsed.data.message } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
