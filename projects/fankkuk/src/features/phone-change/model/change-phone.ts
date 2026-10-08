import { PASSWORD_LOCKED_MESSAGE } from "@/entities/session/api/password-attempts";
import { z } from "zod";
import { passwordMatches, type AccountPasswordDeps } from "@/entities/session/api/account-password";
import { CURRENT_PASSWORD_EMPTY, CURRENT_PASSWORD_WRONG } from "@/entities/session/model/password-rule";
import type { Viewer } from "@/entities/session/model/viewer";
import { MOBILE_PHONE_SHAPE } from "@/shared/lib/validation/phone-shape";

// 휴대폰 번호 바꾸기(signup INV-U12). 가입과 같은 카카오 본인 확인을 새 번호로 다시 받고, 지금 비밀번호도 맞아야 한다.
// 카카오 확인은 「새 번호가 바꾸는 사람 것」만 증명한다 — 세션만 빼앗은 사람이 자기 번호로 확인받아 바꾸는 것은 비밀번호가 막는다.
// 사람은 세션에서 확인한 사람(INV-L2)뿐이고, 본인 확인 번호표는 스크립트가 못 읽는 쿠키에서만 받는다(부르는 쪽이 넘긴다).
// 확인 줄 잠금·사용 표시·번호 바꾸기·기록 한 줄은 DB 함수 change_my_phone 이 한 처리에서 한다(앱 서버 키 전용).
// 운영에서 카카오 연결 전에는 거부한다(INV-U9) — 본인 확인 창구가 없으면 verifierReady 가 false 다.
// 지금 번호와 같은 번호로는 바꾸지 않는다 — 카카오 확인 요청 전에(startPhoneChange) 거부하고, DB 함수도 FKU03 으로 다시 거부한다.

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;

export type ChangePhoneDeps = AccountPasswordDeps & {
  admin: { rpc: Rpc };
  viewer: Viewer | null;
  verifierReady: boolean;
};

export type ChangePhoneField = "phone" | "verification" | "currentPassword";

export type ChangePhoneResult = { ok: true } | { ok: false; status: 400 | 401 | 409 | 429 | 503; field?: ChangePhoneField; message: string };

export const PHONE_CHANGE_CLOSED = "지금은 휴대폰 번호를 바꿀 수 없어요. 준비가 끝나면 알려 드릴게요.";
export const VERIFY_AGAIN = "본인 확인을 다시 해 주세요.";
export const SAME_AS_CURRENT_PHONE = "지금 번호와 같아요. 바꿀 새 번호를 적어 주세요.";
const LOGIN_NEEDED = "로그인이 필요해요.";
const CHECK_PHONE = "휴대폰 번호를 확인해 주세요.";

const inputSchema = z.object({
  phone: z
    .string()
    .max(40)
    .transform((s) => s.replace(/[\s-]/g, "")),
  currentPassword: z.string().max(200),
});

export async function changePhone(deps: ChangePhoneDeps, body: unknown, verificationId: string | undefined): Promise<ChangePhoneResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: LOGIN_NEEDED };
  if (!deps.verifierReady) return { ok: false, status: 503, message: PHONE_CHANGE_CLOSED };
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success || !MOBILE_PHONE_SHAPE.test(parsed.data.phone)) {
    return { ok: false, status: 400, field: "phone", message: CHECK_PHONE };
  }
  if (!verificationId || !z.string().uuid().safeParse(verificationId).success) {
    return { ok: false, status: 400, field: "verification", message: VERIFY_AGAIN };
  }
  if (parsed.data.currentPassword === "") {
    return { ok: false, status: 400, field: "currentPassword", message: CURRENT_PASSWORD_EMPTY };
  }
  const check = await passwordMatches(deps, deps.viewer.userId, parsed.data.currentPassword);
  // INV-L14: 아이디별 확인 횟수를 넘겼으면 묻지 않았다
  if (check === "locked") return { ok: false, status: 429, field: "currentPassword", message: PASSWORD_LOCKED_MESSAGE };
  if (check === "wrong") return { ok: false, status: 400, field: "currentPassword", message: CURRENT_PASSWORD_WRONG };

  const changed = await deps.admin.rpc("change_my_phone", {
    p_account_id: deps.viewer.userId,
    p_phone: parsed.data.phone,
    p_verification_id: verificationId,
  });
  if (changed.error) {
    if (changed.error.code === "FKU01") return { ok: false, status: 400, field: "verification", message: VERIFY_AGAIN };
    if (changed.error.code === "FKU02") return { ok: false, status: 409, field: "phone", message: "이미 가입된 번호예요." };
    if (changed.error.code === "FKU03") return { ok: false, status: 400, field: "phone", message: SAME_AS_CURRENT_PHONE };
    if (changed.error.code === "22023") return { ok: false, status: 400, field: "phone", message: CHECK_PHONE };
    if (changed.error.code === "42501") return { ok: false, status: 401, message: LOGIN_NEEDED };
    throw new Error(`휴대폰 번호를 바꾸지 못했다: ${changed.error.code}`);
  }
  if (changed.data !== "changed") throw new Error("휴대폰 번호 바꾸기 응답이 틀렸다");
  return { ok: true };
}

export type PhoneChangeStartDeps = { admin: { rpc: Rpc }; viewer: Viewer | null; verifierReady: boolean };

export type PhoneChangeStartCheck = { ok: true; phone: string } | { ok: false; status: 400 | 401 | 503; field?: "phone"; message: string };

/**
 * 번호 바꾸기 1단계(새 번호로 카카오톡 본인 확인 요청) 앞의 검사. 통과하면 부르는 쪽(라우트)이 가입과 같은 요청 함수·같은 한도
 * (번호당 한 시간 다섯 번, INV-U10)로 카카오에 요청한다.
 * 지금 번호와 같은지 DB 에 묻는다(is_my_current_phone, 앱 서버 키 전용) — 같으면 카카오 요청도 한도 기록도 하지 않는다.
 * 알려 주는 것은 「이 번호가 내 지금 번호인가」뿐이라 다른 계정의 번호 여부는 새지 않는다(INV-U11).
 */
export async function checkPhoneChangeStart(deps: PhoneChangeStartDeps, body: unknown): Promise<PhoneChangeStartCheck> {
  if (!deps.viewer) return { ok: false, status: 401, message: LOGIN_NEEDED };
  if (!deps.verifierReady) return { ok: false, status: 503, message: PHONE_CHANGE_CLOSED };
  const parsed = inputSchema.pick({ phone: true }).safeParse(body);
  if (!parsed.success || !MOBILE_PHONE_SHAPE.test(parsed.data.phone)) {
    return { ok: false, status: 400, field: "phone", message: CHECK_PHONE };
  }
  const same = await deps.admin.rpc("is_my_current_phone", { p_account_id: deps.viewer.userId, p_phone: parsed.data.phone });
  if (same.error) throw new Error(`지금 번호와 비교하지 못했다: ${same.error.code}`);
  if (same.data === true) return { ok: false, status: 400, field: "phone", message: SAME_AS_CURRENT_PHONE };
  return { ok: true, phone: parsed.data.phone };
}
