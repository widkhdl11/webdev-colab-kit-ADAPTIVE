import type { SignUpField } from "../model/sign-up";
import { checkPhoneVerification, postSignup, type SignupBody } from "./signup-client";

// 가입 3단계 마무리 — 카카오톡 인증이 됐는지 서버에 묻고, 됐으면 가입을 보낸다.
// 화면은 결과만 받아 표시와 단계 이동을 한다. 번호표는 쿠키에 있어 여기서 다루지 않는다.
// 서버가 번호표를 쓸 수 없다고 하면(만료·사용됨·다른 번호) 요청부터 다시 받게 한다(dropVerification).

export type CompleteSignupOutcome =
  | { ok: true; loggedIn: boolean }
  | { ok: false; field: SignUpField; message: string; dropVerification: boolean };

export const NOT_YET_VERIFIED = "카카오톡 인증이 완료되지 않았습니다. 인증을 마친 뒤 ‘가입 완료’를 눌러 주세요.";

export async function completeSignup(body: SignupBody): Promise<CompleteSignupOutcome> {
  const checked = await checkPhoneVerification();
  if (!checked.ok) return { ok: false, field: "verification", message: checked.message, dropVerification: true };
  if (!checked.verified) return { ok: false, field: "verification", message: NOT_YET_VERIFIED, dropVerification: false };

  const r = await postSignup(body);
  if (r.ok) return { ok: true, loggedIn: r.loggedIn };
  return { ok: false, field: r.field, message: r.message, dropVerification: r.field === "verification" };
}
