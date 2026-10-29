import type { SignUpField } from "../model/sign-up";
import { postSignup, type SignupBody } from "./signup-client";

// 가입 3단계 마무리 — 인증번호 확인을 마친 뒤 가입을 보낸다. 확인 결과는 서버가 번호표(쿠키)로 DB 에서 찾는다(INV-U1).
// 화면은 결과만 받아 표시와 단계 이동을 한다.
// 서버가 확인을 쓸 수 없다고 하면(10분 지남·사용됨·다른 번호) 인증번호부터 다시 받게 한다(dropVerification).

export type CompleteSignupOutcome =
  | { ok: true; loggedIn: boolean }
  | { ok: false; field: SignUpField; message: string; dropVerification: boolean };

export async function completeSignup(body: SignupBody): Promise<CompleteSignupOutcome> {
  const r = await postSignup(body);
  if (r.ok) return { ok: true, loggedIn: r.loggedIn };
  return { ok: false, field: r.field, message: r.message, dropVerification: r.field === "verification" || r.field === "phone" };
}
