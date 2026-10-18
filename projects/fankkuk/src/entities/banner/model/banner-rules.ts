import { charCount } from "@/shared/lib/validation/char-count";

// 광고 배너 저장 규칙 (docs/specs/banners.md INV-Y3·Y6). DB 제약(마이그레이션 20261018000001 의 banner_link_ok·banner_text_ok)과
// 같은 규칙이다 — 글자 묶음도 같은 목록을 쓰고, 통합 시험(banners-db)이 같은 글을 둘에 넣어 답이 같은지 본다.
// 화면(입력 칸 미리 검사)·서버(저장 경로)·그리는 부품(링크 갈래)이 모두 이 파일을 쓴다.

export const BANNER_TITLE_MAX = 30;
export const BANNER_DESCRIPTION_MAX = 40;
const LINK_MAX = 500;

/** 앞뒤 빈칸·주소 안에 올 수 없는 글자 — JavaScript 의 \s 와 제어 문자. DB 쪽 목록과 같다. */
const BLANK = "\\u0000-\\u0020\\u007f-\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff";
/** 글 안에 올 수 없는 제어 문자 — DB 쪽 목록과 같다. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

// INV-Y3 ⓐ 팬꾹 안 주소: / 로 시작, 두 번째 글자가 / \ 가 아님, 빈칸·제어 문자 없음
const INTERNAL = new RegExp(`^/(?:[^/\\\\${BLANK}][^${BLANK}]*)?$`, "u");
// INV-Y3 ⓑ 바깥 주소: https:// + 호스트(영문·숫자·점·붙임표) + 포트(선택) + 나머지(빈칸 없음)
const EXTERNAL = new RegExp(`^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^${BLANK}]*)?$`, "u");
const EDGE_BLANK = new RegExp(`^[${BLANK}]|[${BLANK}]$`, "u");

export type BannerLinkKind = "internal" | "external";

/** 시작·끝 날짜 — YYYY-MM-DD 이고 달력에 있는 날(2026-02-30·13월은 아니다). DB 날짜 형식과 같은 꼴 */
export function isBannerDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** INV-Y3: 저장할 수 있는 링크면 그 갈래(팬꾹 안 → 같은 탭, 바깥 → 새 탭), 아니면 null. */
export function bannerLinkKind(link: string): BannerLinkKind | null {
  if (charCount(link) > LINK_MAX) return null;
  if (INTERNAL.test(link)) return "internal";
  if (EXTERNAL.test(link)) return "external";
  return null;
}

/** INV-Y6: 제목 1~30자·설명 0~40자(코드 포인트 — DB char_length 와 같은 기준), 앞뒤 빈칸·제어 문자 없음. 다듬은 뒤의 값을 본다. */
export function bannerTextOk(title: string, description: string): boolean {
  const titleCount = charCount(title);
  return (
    titleCount >= 1 &&
    titleCount <= BANNER_TITLE_MAX &&
    charCount(description) <= BANNER_DESCRIPTION_MAX &&
    !EDGE_BLANK.test(title) &&
    !EDGE_BLANK.test(description) &&
    !CONTROL.test(title) &&
    !CONTROL.test(description)
  );
}
