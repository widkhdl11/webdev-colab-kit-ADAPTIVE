import { pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 사무실 작업 DB 함수의 오류 코드 → 응답 (office-workflow INV-W1·W2·W3·W4).
// 42501 권한 없음 → 403 · 22023 스캔 값·입력 → 400 · P0002 없음 → 404 · 55000 단계가 아님 · 23505 같은 줄 두 번 → 409
// P0041 출고 조건 → 409 · P0042 앞 상자 라벨 부착 대기 → 409 · P0043 이 상자의 라벨·송장이 아님 → 400 · P0044 검수 기록 없음 → 409.
// reason 은 화면이 어느 거부 카드를 보일지 고르는 데 쓴다.

export const OFFICE_MESSAGE = {
  wrongStep: "이미 처리됐거나 지금 단계가 아니에요.",
  notShippable: "출고 조건이 아직 안 됐어요.",
  pendingLabel: "앞 상자 라벨 부착을 먼저 확인해 주세요.",
  wrongCode: "이 상자의 라벨·송장이 아니에요.",
  noInspection: "검수 기록을 먼저 저장해 주세요.",
} as const;

export type OfficeRejectReason = "wrong_step" | "not_shippable" | "pending_label" | "wrong_code" | "no_inspection";

function reject(status: number, message: string, reason: OfficeRejectReason): JsonReply {
  return { status, body: { message, reason } };
}

/** conflict: 55000·23505 의 문구를 쓰기마다 바꿀 때(예: 「이미 검수 기록이 있어요」). 없으면 「이미 처리됐거나 지금 단계가 아니에요」 */
export function officeErrorReply(code: string | undefined, messages: { limit: string; failed: string; conflict?: string }): JsonReply {
  // INV-W2: 동시에 두 번 들어와 DB 가 막은 경우(상태 확인 55000 · 유일 제약 23505) — 둘 다 「이미 처리됨」
  if (code === "55000" || code === "23505") return reject(409, messages.conflict ?? OFFICE_MESSAGE.wrongStep, "wrong_step");
  if (code === "P0041") return reject(409, OFFICE_MESSAGE.notShippable, "not_shippable");
  if (code === "P0042") return reject(409, OFFICE_MESSAGE.pendingLabel, "pending_label");
  if (code === "P0043") return reject(400, OFFICE_MESSAGE.wrongCode, "wrong_code");
  if (code === "P0044") return reject(409, OFFICE_MESSAGE.noInspection, "no_inspection");
  return pgErrorReply(code, messages);
}

/** 거부를 받은 뒤 화면의 상자를 다시 읽어야 하나. 409·404 는 화면이 낡았다는 뜻이다(다른 사람·다른 탭이 먼저 처리).
 *  검수 기록이 없다는 거부(no_inspection)만은 상자가 그대로라 다시 읽지 않는다 — 양식을 그대로 두고 저장하게 한다. */
export function needsReload(failure: { status: number; reason: OfficeRejectReason | null }): boolean {
  if (failure.status !== 409 && failure.status !== 404) return false;
  return failure.reason !== "no_inspection";
}
