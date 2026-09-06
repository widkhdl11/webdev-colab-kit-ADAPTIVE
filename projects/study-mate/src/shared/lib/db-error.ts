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
  //
  // **`23514` 를 통째로 통과시키지 않는다.** 트리거의 `raise exception … using
  // errcode = 'check_violation'` 은 우리가 한국어로 쓴 문장이지만, **표의 CHECK 제약이
  // 걸릴 때는 같은 코드로 PostgreSQL 이 지은 영어 문장이 온다** —
  // `new row for relation "studies" violates check constraint "studies_recruit_until_finite"`.
  // 그걸 통과시키면 제약 이름·표 이름이 폼 하나로 새 나가고, 그것이 바로 이 함수가
  // 막겠다고 적어 둔 것이다 (2026-09-06 security-reviewer · code-reviewer).
  //
  // 둘을 가르는 값이 코드에는 없으므로 **문장의 모양으로 가른다.** PostgreSQL 이 짓는
  // 제약 위반 문장은 언제나 `violates check constraint` 를 담는다.
  const ours =
    error.code === "P0001" ||
    (error.code === "23514" && !/violates check constraint/i.test(error.message ?? ""));
  if (ours) {
    return error.message ?? `${what}하지 못했습니다`;
  }
  // 원인은 남기되 화면에는 안 보낸다.
  console.error(`[db] ${what} 실패 code=${error.code ?? "?"} message=${error.message ?? ""}`);
  return `${what}하지 못했습니다. 잠시 뒤 다시 시도해 주세요`;
}

/**
 * 조회가 실패했을 때 던지는 짝. **원문을 문구에 담지 않는다** — 위 `dbErrorMessage` 와
 * 같은 이유고, 그 규칙이 조회 함수마다 따로 복사되던 것을 한자리로 모은 것이다.
 *
 * 액션이 아니라 조회에 쓴다. 액션은 실패를 값으로 돌려주지만(`ActionResult`), 조회는
 * 화면을 그릴 재료가 없는 상태라 던져서 오류 경계로 보내는 편이 맞다.
 *
 * @param what 무엇을 읽으려다 실패했는지 ("내 신청 현황" 처럼)
 */
export function throwDbError(what: string, error: DbError): never {
  console.error(`[db] ${what} 조회 실패 code=${error.code ?? "?"} message=${error.message ?? ""}`);
  throw new Error(`${what}을(를) 읽지 못했다`);
}

/**
 * 임베드 응답의 모양이 어긋났을 때. **행 원문을 문구에 담지 않는다** — 개발 서버의 오류
 * 오버레이에는 그대로 뜨고, 나중에 `error.tsx` 가 `error.message` 를 그리면 화면에도 나간다.
 * 원문은 로그로만 간다.
 *
 * "안 보인다"로 떨어뜨리지 않고 던지는 이유: 그러면 고장이 「지워진 스터디」로 그려진다.
 *
 * @param where 어느 행에서 났는지 (로그로만 나간다)
 */
export function throwShapeError(what: string, where: string, embed: unknown): never {
  console.error(`[db] ${what} 임베드의 모양이 다르다 at=${where} row=${JSON.stringify(embed)}`);
  throw new Error(`${what}을(를) 읽지 못했다`);
}
