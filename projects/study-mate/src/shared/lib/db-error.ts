/** `postgrest-js` 가 돌려주는 오류에서 우리가 쓰는 것만. */
type DbError = { readonly code?: string; readonly message?: string };

/**
 * 데이터베이스가 거부한 것을 화면에 쓸 문구로 바꾼다.
 *
 * **원문을 그대로 내보내지 않는다.** PostgreSQL 이 짓는 문장에는 내가 보낸 값이 그대로
 * 되비치고(`invalid input syntax for type uuid: "<보낸 값>"`), 제약 이름·컬럼 이름·
 * `private.` 함수 이름 같은 내부 식별자가 섞인다. React 가 텍스트로 이스케이프하므로
 * 스크립트가 도는 것은 아니지만, **화면 하나로 데이터베이스 구조를 읽을 수 있게 된다.**
 *
 * **우리가 지은 문장은 그대로 보여 준다.** 트리거의 `raise exception` 은 `P0001` 로 오고
 * 그 안에 든 것은 한국어로 쓴 이유다("정원을 넘겨 수락할 수 없습니다: 정원 5, 수락 5").
 * 그건 사용자가 읽어야 하는 내용이라 덮으면 안 된다.
 *
 * 그 밖은 고정 문구로 덮고, 진짜 오류는 서버 로그로만 보낸다.
 *
 * @param what 무엇을 하려다 실패했는지 ("신청" · "보내기" 처럼 짧게)
 */
export function dbErrorMessage(what: string, error: DbError): string {
  // 우리가 지은 문장(트리거·검사 제약). 사용자가 읽으라고 쓴 것이다.
  if (error.code === "P0001" || error.code === "23514") {
    return error.message ?? `${what}하지 못했습니다`;
  }
  // 원인은 남기되 화면에는 안 보낸다.
  console.error(`[db] ${what} 실패 code=${error.code ?? "?"} message=${error.message ?? ""}`);
  return `${what}하지 못했습니다. 잠시 뒤 다시 시도해 주세요`;
}
