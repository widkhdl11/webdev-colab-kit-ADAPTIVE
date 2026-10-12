import type { CreatorCheckAnswer } from "@/entities/parcel/model/creator-check";

// 브라우저에서 크리에이터 확인의 답을 저장한다(/api/creator/checks). 보내는 값은 주문번호·상자 순번·답뿐이다.
// ok = 저장됨 / login = 세션이 끝났다 / refused = 서버가 거부했다(문구를 그대로 보인다) / failed = 그 밖의 실패

export type SendCheckAnswerOutcome = { kind: "ok" } | { kind: "login" } | { kind: "refused"; message: string } | { kind: "failed" };

export async function sendCheckAnswer(orderNo: string, boxSeq: number, answer: CreatorCheckAnswer): Promise<SendCheckAnswerOutcome> {
  try {
    const res = await fetch("/api/creator/checks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderNo, boxSeq, answer }),
    });
    if (res.ok) return { kind: "ok" };
    if (res.status === 401) return { kind: "login" };
    const body: unknown = await res.json().catch(() => null);
    const message = (body as { message?: unknown } | null)?.message;
    return res.status < 500 && typeof message === "string" ? { kind: "refused", message } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
