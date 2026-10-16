import { TERMS_VERSIONS } from "@/features/signup/model/signup-input";
import { TO_FILL, type LegalDoc } from "./legal-doc";

// 약관·개인정보처리방침·환불 규정의 버전과 시행일. 약관을 바꿀 때 하는 일:
//   1. 지금 글을 ARCHIVE 에 그대로 옮겨 적는다(그때의 요금 숫자까지 글자로 굳힌 LegalDoc).
//   2. CURRENT 의 version·effectiveDate 를 새 값으로 바꾼다. 가입 동의 기록의 버전(TERMS_VERSIONS)도 같은 값으로.
//   3. 시행 7일 전(회원에게 불리하면 30일 전)부터 공지사항에 올린다(약관 제3조).
// effectiveDate 가 비어 있으면 화면에 「(출시 전 기재)」가 보인다.

export type VersionedKind = "terms" | "privacy" | "refund";

export type LegalVersion = { version: string; effectiveDate: string };

export type ArchivedDoc = LegalVersion & { doc: LegalDoc };

export const CURRENT: Readonly<Record<VersionedKind, LegalVersion>> = {
  terms: { version: TERMS_VERSIONS.service, effectiveDate: "" },
  privacy: { version: TERMS_VERSIONS.privacy, effectiveDate: "" },
  refund: { version: "2026-10-17", effectiveDate: "" },
};

/** 지난 버전 — 최신이 앞. 아직 시행 전이라 비어 있다. */
export const ARCHIVE: Readonly<Record<VersionedKind, readonly ArchivedDoc[]>> = {
  terms: [],
  privacy: [],
  refund: [],
};

export const effectiveText = (v: LegalVersion) => (v.effectiveDate.trim() === "" ? TO_FILL : v.effectiveDate);

export type VersionLink = { version: string; effective: string; current: boolean; href: string };

export type ResolvedLegal = { doc: LegalDoc; version: LegalVersion; current: boolean; history: readonly VersionLink[] };

/**
 * 주소의 ?v= 값으로 볼 버전을 고른다. 값이 없거나 지금 버전이면 지금 글, 지난 버전이면 그때 글, 모르는 값이면 null(404).
 * 고른 버전과 시행일은 글 맨 위 사실 칸에 붙인다.
 */
export function resolveLegal(
  kind: VersionedKind,
  path: string,
  currentDoc: LegalDoc,
  asked: string | undefined,
  current: LegalVersion = CURRENT[kind],
  archive: readonly ArchivedDoc[] = ARCHIVE[kind],
): ResolvedLegal | null {
  const history: VersionLink[] = [
    { version: current.version, effective: effectiveText(current), current: true, href: path },
    ...archive.map((a) => ({ version: a.version, effective: effectiveText(a), current: false, href: `${path}?v=${encodeURIComponent(a.version)}` })),
  ];
  const old = asked === undefined || asked === current.version ? undefined : archive.find((a) => a.version === asked);
  if (asked !== undefined && asked !== current.version && old === undefined) return null;
  const version = old ?? current;
  const base = old?.doc ?? currentDoc;
  const doc: LegalDoc = {
    ...base,
    facts: [["버전", version.version], ["시행일", effectiveText(version)], ...base.facts.filter(([k]) => k !== "시행일" && k !== "버전")],
  };
  return { doc, version, current: old === undefined, history };
}
