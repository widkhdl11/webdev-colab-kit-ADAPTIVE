import { mobilePhoneOf, normalizeMobilePhone } from "@/shared/lib/validation/phone-shape";

// 승인 서명 연결 정보 (approval-signature INV-S16) — 이름·생년월일·휴대폰 번호. 이 값은 브라우저에서 봉인된 뒤에만 서버로 간다.
// 서버는 봉투를 열 수 없어 이 검사를 다시 하지 못한다 — 틀린 값이면 시험 서명이 오지 않아 연결되지 않는다(서명 대상 지정이 실패).
// 봉인 내용에는 그 크리에이터의 식별값도 넣는다 — 다른 크리에이터의 봉투를 옮겨 붙여도 게이트웨이가 가려낼 수 있게(주소 봉인 INV-P13 과 같은 꼴).

export type LinkIdentityField = "name" | "birth" | "phone";
export type LinkIdentityInput = { name: string; birth: string; phone: string };

export const LINK_NAME_MAX = 30;

const NAME_SHAPE = /^[가-힣A-Za-z][가-힣A-Za-z .·-]*$/;

export const LINK_IDENTITY_MESSAGE: Record<LinkIdentityField, string> = {
  name: "이름을 확인해 주세요.",
  birth: "생년월일 8자리를 확인해 주세요.",
  phone: "휴대폰 번호를 확인해 주세요.",
};

function validBirth(raw: string, today: Date): boolean {
  if (!/^\d{8}$/.test(raw)) return false;
  const y = Number(raw.slice(0, 4));
  const m = Number(raw.slice(4, 6));
  const d = Number(raw.slice(6, 8));
  if (y < 1900) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return false;
  return date.getTime() <= today.getTime();
}

/** 칸 셋의 첫 문제(없으면 null). 이름은 앞뒤 공백을 떼고, 번호는 숫자만 본다. */
export function checkLinkIdentity(v: LinkIdentityInput, today: Date = new Date()): { field: LinkIdentityField; message: string } | null {
  const name = v.name.trim();
  if (name.length === 0 || name.length > LINK_NAME_MAX || !NAME_SHAPE.test(name)) return { field: "name", message: LINK_IDENTITY_MESSAGE.name };
  if (!validBirth(v.birth.trim(), today)) return { field: "birth", message: LINK_IDENTITY_MESSAGE.birth };
  if (mobilePhoneOf(v.phone) === null) return { field: "phone", message: LINK_IDENTITY_MESSAGE.phone };
  return null;
}

/** 봉인할 평문 — 이 함수 밖에서 평문을 만들지 않는다. 검사를 통과한 값만 넣는다. */
export function linkIdentityPlaintext(v: LinkIdentityInput, creatorId: string): string {
  return JSON.stringify({ v: 1, name: v.name.trim(), birth: v.birth.trim(), phone: normalizeMobilePhone(v.phone), creatorId });
}

/** 휴대폰 칸 보이는 꼴 — 숫자만 11자리까지, 010-1234-5678 */
export function formatLinkPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  const mid = d.length === 11 ? 4 : 3;
  if (d.length <= 3 + mid) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 3 + mid)}-${d.slice(3 + mid)}`;
}
