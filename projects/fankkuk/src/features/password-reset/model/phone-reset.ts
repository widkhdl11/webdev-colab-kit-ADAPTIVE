import { randomBytes } from "node:crypto";
import { z } from "zod";
import { mobilePhoneOf } from "@/shared/lib/validation/phone-shape";
import { RESET_CLOSED, RESET_CODE_AGAIN, RESET_CODE_SENT_MESSAGE } from "./reset-messages";

// 휴대폰 비밀번호 찾기의 인증번호 받기·확인(session-login INV-L10·L11).
// 인증번호 받기·확인은 가입과 같은 함수(features/signup 의 phone-verification)를 쓴다 — 기능끼리 서로 부르지 않으므로 라우트(app)가 그 함수를 넘긴다(start·check).
// 받기: 보낼지는 DB 함수 password_reset_target(번호 해시 → 그 번호로 가입한 팬·크리에이터가 있나, 운영자는 false)에 묻는다.
//       응답은 번호 꼴 오류(400)·창구 없음(503) 말고 모두 같은 200·같은 문장이다 — 계정 없음·운영자 번호·한도 초과·보내기 실패 전부(INV-L10).
//       번호 꼴 오류는 입력한 사람이 이미 아는 사실이고, 창구 없음은 번호와 상관없이 모두에게 같다.
// 확인: 번호표는 쿠키 값만 읽는다. 인증번호가 맞으면 서버가 64자 16진수 표를 만들어 issue_phone_password_reset 에 번호표·번호 해시와 함께 넘긴다
//       (DB 는 표의 해시만 둔다, 10분·한 번 — INV-L11). 숫자 번호는 DB 에 넘기지 않는다(signup INV-U18).
//       틀린 숫자 응답은 확인 함수 그대로라 계정 없는 번호(보낸 인증번호 없음)와 숫자가 틀린 때가 같다(S8b).

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;

type StartReply = { ok: true; verificationId: string } | { ok: false; status: number; reason: string; message: string };
type CheckReply = { ok: true } | { ok: false; status: number; reason: string; message: string; remaining?: number };

export type RequestResetCodeDeps = {
  admin: { rpc: Rpc };
  /** 인증번호 받기(가입과 같은 함수) — 보낼지 묻는 함수와 「보내기 실패해도 버리지 않기」를 넘긴다 */
  start: (body: unknown, options: { sendIf: (phoneHash: string) => Promise<boolean>; keepOnSendFail: true }) => Promise<StartReply>;
};

export type RequestResetCodeResult =
  | { status: 200; message: string; verificationId: string | null }
  | { status: 400 | 503; reason: "phone" | "closed"; message: string };

export async function requestResetCode(deps: RequestResetCodeDeps, body: unknown): Promise<RequestResetCodeResult> {
  const started = await deps.start(body, {
    sendIf: async (phoneHash) => {
      const target = await deps.admin.rpc("password_reset_target", { p_phone_hash: phoneHash });
      if (target.error) throw new Error(`재설정 대상을 확인하지 못했다: ${target.error.code}`);
      return target.data === true;
    },
    keepOnSendFail: true,
  });
  if (started.ok) return { status: 200, message: RESET_CODE_SENT_MESSAGE, verificationId: started.verificationId };
  if (started.reason === "phone") return { status: 400, reason: "phone", message: started.message };
  if (started.reason === "closed") return { status: 503, reason: "closed", message: RESET_CLOSED };
  // 한도 초과(1분·하루)·보내기 실패 — 보낸 때와 같은 응답(INV-L10). 번호표는 없다(라우트는 쿠키를 건드리지 않는다)
  return { status: 200, message: RESET_CODE_SENT_MESSAGE, verificationId: null };
}

export type CheckResetCodeDeps = {
  admin: { rpc: Rpc };
  /** 인증번호 확인(가입과 같은 함수) */
  check: (body: { verificationId: string; code: string }) => Promise<CheckReply>;
  /** 번호 해시(signup INV-U18) */
  phoneHashOf: (phone: string) => string;
  /** 재설정 표 만들기 — 시험에서만 바꾼다 */
  makeToken?: () => string;
};

export type CheckResetCodeResult =
  | { ok: true; token: string }
  | { ok: false; status: number; reason: string; message: string; remaining?: number };

const checkSchema = z.object({ phone: z.string().max(40), code: z.string().max(20) });
const again = { ok: false, status: 400, reason: "invalid", message: RESET_CODE_AGAIN } as const;

/** body: { phone, code } · ticket: 번호표 쿠키 값(본문의 번호표는 읽지 않는다) */
export async function checkResetCode(deps: CheckResetCodeDeps, body: unknown, ticket: string | undefined): Promise<CheckResetCodeResult> {
  const parsed = checkSchema.safeParse(body);
  if (!parsed.success || !ticket) return again;
  const phone = mobilePhoneOf(parsed.data.phone);
  if (!phone) return again;

  const checked = await deps.check({ verificationId: ticket, code: parsed.data.code });
  if (!checked.ok) {
    if (checked.reason === "closed") return { ok: false, status: 503, reason: "closed", message: RESET_CLOSED };
    return checked;
  }

  const token = deps.makeToken ? deps.makeToken() : randomBytes(32).toString("hex");
  const issued = await deps.admin.rpc("issue_phone_password_reset", {
    p_verification_id: ticket,
    p_phone_hash: deps.phoneHashOf(phone),
    p_token: token,
  });
  if (issued.error) throw new Error(`재설정 표를 발급하지 못했다: ${issued.error.code}`);
  return issued.data === "issued" ? { ok: true, token } : again;
}
