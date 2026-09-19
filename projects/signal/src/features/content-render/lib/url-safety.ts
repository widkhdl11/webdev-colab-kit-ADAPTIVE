import { cleanUrlInput, urlScheme } from "@/shared/lib/url";

// content-safety.md INV-D6 강제 지점.
//
// 아웃바운드 URL 의 허용 스킴 목록은 **여기가 정본이다.** sanitize 설정도, 출처 링크
// 컴포넌트도 이 파일을 참조한다. 목록이 두 곳에 복제되면 한쪽만 고쳐지는 날이 온다 —
// 2026-08-06 review 에서 발견된 빈칸이 정확히 그 모양이었다. sanitize 는 본문 URL 만
// 훑는데 출처 링크는 본문 밖 필드라, 방벽이 있는 줄 알았지만 닿지 않는 자리가 있었다.

/**
 * 본문(원문 HTML) 안 링크의 허용 스킴.
 * 원문에 이메일 링크가 섞여 오는 경우가 있어 mailto 를 포함한다.
 */
export const BODY_URL_SCHEMES = ["http", "https", "mailto"] as const;

/**
 * 출처 링크(`sourceUrl`)의 허용 스킴.
 * 출처는 '원문이 있는 웹 주소'다 — mailto 를 받을 이유가 없고,
 * 목록을 넓게 잡아두면 나중에 왜 넓은지 아무도 설명하지 못한다.
 */
export const SOURCE_URL_SCHEMES = ["http", "https"] as const;

function isAllowed(raw: string, allowed: readonly string[]): boolean {
  const scheme = urlScheme(raw);
  // 정확히 일치해야 한다. 접두 비교(startsWith)로 쓰면 `https-evil:`·`httpx:` 처럼
  // 허용 스킴으로 시작하는 **다른 스킴**이 통과한다(RFC 3986 상 유효한 스킴 문자열이다).
  return scheme !== null && allowed.includes(scheme);
}

/**
 * 출처 링크로 쓸 수 있으면 정리된 URL 을, 아니면 null 을 돌려준다 (INV-D6).
 *
 * null 이면 **링크를 렌더하지 않는다.** href 만 비우고 링크 모양을 남기면
 * 눌러도 아무 일이 없는 버튼이 되어 화면이 거짓말을 한다.
 *
 * 돌려주는 값이 원본이 아니라 정리본인 이유: 검사한 문자열과 렌더하는 문자열이
 * 다르면 검사가 의미를 잃는다(브라우저가 버리는 문자를 우리가 남기면 그 틈이 공격면이다).
 */
export function safeSourceUrl(raw: string): string | null {
  // 타입은 string 이라고 하지만 이 필드는 신뢰 경계 밖이다(content-safety 신뢰 경계 절).
  // 조회가 붙어 null·누락이 오면 아래 문자열 연산이 던져서 링크 하나가 아니라
  // 상세 페이지 전체가 500 이 된다.
  if (typeof raw !== "string") return null;
  return isAllowed(raw, SOURCE_URL_SCHEMES) ? cleanUrlInput(raw) : null;
}
