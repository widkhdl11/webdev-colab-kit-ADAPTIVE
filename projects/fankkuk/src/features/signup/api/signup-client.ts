// 브라우저에서 가입 단계를 서버에 보낸다. 서버가 준 문구를 그대로 보여 준다.
// 브라우저는 번호표만 들고 있다 — 인증이 됐는지는 서버가 카카오에게 묻는다(signup INV-U1).

export type SignupField = "verification" | "loginId" | "phone" | "form";

export type SignupBody = {
  role: "fan" | "creator";
  loginId: string;
  email: string;
  password: string;
  phone: string;
  terms: { service: boolean; privacy: boolean; news: boolean };
  verificationId: string;
};

const FALLBACK = "잠시 문제가 생겼어요. 조금 뒤 다시 해 주세요.";

async function post(url: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

const messageOf = (data: Record<string, unknown> | null) => (typeof data?.message === "string" ? data.message : FALLBACK);

export async function requestPhoneVerification(phone: string): Promise<{ ok: true; verificationId: string } | { ok: false; message: string }> {
  try {
    const { status, data } = await post("/api/signup/phone", { phone });
    if (status === 200 && typeof data?.verificationId === "string") return { ok: true, verificationId: data.verificationId };
    return { ok: false, message: messageOf(data) };
  } catch {
    return { ok: false, message: FALLBACK };
  }
}

export async function checkPhoneVerification(
  verificationId: string,
): Promise<{ ok: true; verified: boolean } | { ok: false; message: string }> {
  try {
    const { status, data } = await post("/api/signup/phone/check", { verificationId });
    if (status === 200) return { ok: true, verified: data?.status === "verified" };
    return { ok: false, message: messageOf(data) };
  } catch {
    return { ok: false, message: FALLBACK };
  }
}

export async function postSignup(
  body: SignupBody,
): Promise<{ ok: true; loggedIn: boolean; mailSent: boolean } | { ok: false; field: SignupField; message: string }> {
  try {
    const { status, data } = await post("/api/signup", body);
    if (status === 200) return { ok: true, loggedIn: data?.loggedIn === true, mailSent: data?.mailSent === true };
    const field = data?.field;
    return {
      ok: false,
      field: field === "verification" || field === "loginId" || field === "phone" ? field : "form",
      message: messageOf(data),
    };
  } catch {
    return { ok: false, field: "form", message: FALLBACK };
  }
}
