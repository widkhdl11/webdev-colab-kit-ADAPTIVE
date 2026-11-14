import type { OfficeAddressBody } from "../model/save-office-address";

// 브라우저에서 팬꾹 주소를 저장한다(/api/admin/office-address). 서버가 준 문구를 그대로 보여 준다.

export type SaveOfficeAddressOutcome = { kind: "ok" } | { kind: "failed"; message: string };

const FALLBACK = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export async function postOfficeAddress(body: OfficeAddressBody): Promise<SaveOfficeAddressOutcome> {
  try {
    const res = await fetch("/api/admin/office-address", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { kind: "ok" };
    const got = (await res.json().catch(() => null)) as { message?: unknown } | null;
    return { kind: "failed", message: typeof got?.message === "string" ? got.message : FALLBACK };
  } catch {
    return { kind: "failed", message: FALLBACK };
  }
}
