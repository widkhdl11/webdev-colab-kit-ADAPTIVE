import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { PHONE_CHANGE_COOKIE } from "@/features/phone-change/lib/verification-cookie";
import { PHONE_CHANGE_CLOSED } from "@/features/phone-change/model/change-phone";
import { checkPhoneCode } from "@/features/signup/model/phone-verification";
import { choosePhoneVerifier, readPhoneCodeSecret } from "@/shared/api/phone-verifier/verifier";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 번호 바꾸기 — 받은 인증번호 확인(INV-U1·U10·U15). 번호표는 쿠키에서만 읽고, 본문에서는 6자리만 쓴다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const viewer = await readViewer(await createRequestSupabase());
    if (!viewer) return { status: 401, body: { message: "로그인이 필요합니다." } };
    const verifier = choosePhoneVerifier(process.env);
    if (!verifier) return { status: 503, body: { message: PHONE_CHANGE_CLOSED } };
    const ticket = (await cookies()).get(PHONE_CHANGE_COOKIE)?.value;
    const code = body !== null && typeof body === "object" && "code" in body ? (body as { code: unknown }).code : undefined;
    const result = await checkPhoneCode(
      { admin: createAdminSupabase(), verifier, codeSecret: () => readPhoneCodeSecret(process.env) },
      { verificationId: ticket, code },
    );
    if (result.ok) return { status: 200, body: { status: "verified" } };
    return { status: result.status, body: { field: "code", reason: result.reason, message: result.message } };
  });
}
