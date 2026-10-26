import { z } from "zod";
import type { PhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { phoneSchema, verificationIdSchema } from "./signup-input";

// 가입 3단계의 카카오톡 본인 확인. DB 함수는 모두 앱 서버 키 전용이다(가입하는 사람은 아직 로그인 전).
// 요청: 한도 기록(INV-U10) → 카카오에 요청 → 거래 값을 DB 에 단다. 화면에는 번호표만 준다 — 거래 값은 서버에만 있다.
// 결과: 번호표로 DB 에서 거래 값을 찾아 카카오에게 묻고, 카카오가 확인한 번호를 DB 에 적는다(INV-U1).
//       본문의 번호·거래 값·「확인됨」 표시는 읽지 않는다.

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;

export type PhoneVerificationDeps = {
  admin: { rpc: Rpc };
  /** null = 운영에서 아직 카카오 연결이 없다(INV-U9). */
  verifier: PhoneVerifier | null;
};

type Fail = { ok: false; status: 400 | 429 | 503; message: string };

const CLOSED: Fail = { ok: false, status: 503, message: "현재 회원가입을 이용할 수 없습니다." };
const RETRY: Fail = { ok: false, status: 400, message: "본인 확인을 다시 요청해 주세요." };

const startSchema = z.object({ phone: phoneSchema });
const checkSchema = z.object({ verificationId: verificationIdSchema });
const txRowsSchema = z.array(z.object({ phone: z.string(), provider_tx: z.string() }));

export async function startPhoneVerification(
  deps: PhoneVerificationDeps,
  body: unknown,
): Promise<{ ok: true; verificationId: string } | Fail> {
  if (!deps.verifier) return CLOSED;
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "휴대폰 번호를 확인해 주세요." };
  const phone = parsed.data.phone;

  const recorded = await deps.admin.rpc("request_phone_verification", { p_phone: phone });
  if (recorded.error) {
    if (recorded.error.code === "FK429") {
      return { ok: false, status: 429, message: "본인 확인 요청 횟수를 초과했습니다. 1시간 후 다시 시도해 주세요." };
    }
    if (recorded.error.code === "22023") return { ok: false, status: 400, message: "휴대폰 번호를 확인해 주세요." };
    throw new Error(`본인 확인 요청을 기록하지 못했다: ${recorded.error.code}`);
  }
  const verificationId = z.string().uuid().parse(recorded.data);

  const { tx } = await deps.verifier.request(phone);
  const attached = await deps.admin.rpc("attach_phone_verification_tx", { p_id: verificationId, p_tx: tx });
  if (attached.error) throw new Error(`거래 값을 달지 못했다: ${attached.error.code}`);
  return { ok: true, verificationId };
}

export async function checkPhoneVerification(
  deps: PhoneVerificationDeps,
  body: unknown,
): Promise<{ ok: true; status: "verified" | "pending" } | Fail> {
  if (!deps.verifier) return CLOSED;
  const parsed = checkSchema.safeParse(body);
  if (!parsed.success) return RETRY;
  const verificationId = parsed.data.verificationId;

  const found = await deps.admin.rpc("phone_verification_tx", { p_id: verificationId });
  if (found.error) throw new Error(`본인 확인 기록을 읽지 못했다: ${found.error.code}`);
  const row = txRowsSchema.parse(found.data)[0];
  if (!row) return RETRY;

  const result = await deps.verifier.result(row.provider_tx);
  if (result.status === "pending") return { ok: true, status: "pending" };
  if (result.status === "failed") return RETRY;

  const done = await deps.admin.rpc("complete_phone_verification", { p_id: verificationId, p_verified_phone: result.phone });
  if (done.error) throw new Error(`본인 확인 결과를 적지 못했다: ${done.error.code}`);
  return done.data === true ? { ok: true, status: "verified" } : RETRY;
}
