import type { SignOutcome } from "@/features/approval-request/model/approval-sign";

/** 승인 서명 두 라우트의 응답 꼴 — 성공은 화면 상태, 실패는 문구와(화면이 갈래를 나눌 때만) code. */
export function signReply(r: SignOutcome): { status: number; body: Record<string, unknown> } {
  if (r.ok) return { status: 200, body: { view: r.view } };
  return { status: r.status, body: r.code ? { message: r.message, code: r.code } : { message: r.message } };
}
