import type { JsonReply } from "./private-json";

// Postgres 오류 코드 → JSON 응답. DB 함수가 낸 문구는 그대로 내보내지 않고 화면용 문구로 바꾼다.
// 42501 권한 없음 → 403 · 22023 입력 한도 → 400 · P0002 없음 → 404 · 55000 이미 그 상태 → 409 · 그 밖 → 500.

export type PgErrorMessages = {
  /** 22023 — 어느 한도를 넘었는지 */
  limit: string;
  /** 55000 — 이미 처리된 경우. 그런 상태가 없는 쓰기면 비워 두고 failed 를 쓴다 */
  conflict?: string;
  /** 그 밖의 오류 */
  failed: string;
};

export const MESSAGE_FORBIDDEN = "권한이 없어요.";
export const MESSAGE_NOT_FOUND = "찾을 수 없어요.";

export function pgErrorReply(code: string | undefined, messages: PgErrorMessages): JsonReply {
  if (code === "42501") return { status: 403, body: { message: MESSAGE_FORBIDDEN } };
  if (code === "22023") return { status: 400, body: { message: messages.limit } };
  if (code === "P0002") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  if (code === "55000") return { status: 409, body: { message: messages.conflict ?? messages.failed } };
  return { status: 500, body: { message: messages.failed } };
}
