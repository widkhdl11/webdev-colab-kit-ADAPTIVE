/**
 * 데이터베이스가 uuid 로 받아들이는 표기 전부. 여기 적힌 것은 **실측**이다
 * (`select $1::uuid`, 2026-09-06):
 *
 * ```
 * 받는다  "a0eebc999c0b4ef8bb6d6bb9bd380a11"        -> a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11
 * 받는다  "{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}"  -> (같음)
 * 받는다  "a0eebc99-9c0b4ef8-bb6d6bb9bd380a11"      -> (같음)   ← 하이픈 위치가 달라도 받는다
 * 받는다  "A0EEBC99-...-6BB9BD380A11"               -> (같음)   ← 소문자로 돌려준다
 * 거절    35글자 · 앞뒤 공백                          -> 22P02
 * ```
 *
 * 중괄호를 벗기고 하이픈을 지운 뒤 16진수 32글자인가만 본다.
 */
const HEX32 = /^[0-9a-f]{32}$/i;

/** 정규 표기(소문자 8-4-4-4-12)인가. */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 데이터베이스와 **같은 규칙으로** 읽어서 정규 표기로 돌려준다. 아니면 null.
 *
 * **왜 거르지 않고 고쳐 쓰나.** 이 값은 폼에서 오고, 쓰기는 데이터베이스가 처리한다.
 * 데이터베이스는 위 네 가지 표기를 전부 받으므로, 우리가 정규 표기만 통과시키면
 * **쓰기는 성공하고 캐시 무효화만 조용히 건너뛴다** — 오류도 로그도 없이 남의 화면이
 * 낡은 값을 그대로 보여 준다. 반대로 표기를 그대로 캐시 경로에 쓰면 같은 것을 가리키는
 * 경로가 둘이 되어 어느 쪽도 안 지워진다. 그래서 데이터베이스가 저장한 그 표기로 맞춘다.
 *
 * **인가가 아니라 표기 검사다.** 이 값이 맞다고 그 행을 볼 수 있는 것은 아니다 —
 * 그것은 접근 정책이 정한다.
 */
export function canonicalUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const inner = value.startsWith("{") && value.endsWith("}") ? value.slice(1, -1) : value;
  const hex = inner.replace(/-/g, "");
  if (!HEX32.test(hex)) return null;
  const h = hex.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * 이미 정규 표기의 uuid 인가.
 *
 * 고쳐 쓰지 않고 **있는 그대로 판정**해야 하는 자리에서 쓴다. 폼에서 온 값을 경로로
 * 이어 붙이는 자리는 이것이 아니라 `canonicalUuid` 다 — 거기서는 거르는 것이 답이 아니다.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_SHAPE.test(value);
}
