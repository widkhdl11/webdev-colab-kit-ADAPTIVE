// 액션이 성공·실패를 돌려주는 방식. 도메인 개념이 아니라 앱 전체의 반환 규약이라
// 여기 둔다 — 세션과 무관한 기능들이 결과 타입 때문에 세션 슬라이스를 import 하지 않게.

export type ActionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };
