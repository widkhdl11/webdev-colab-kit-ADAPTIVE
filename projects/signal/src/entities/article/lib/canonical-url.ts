import { cleanUrlInput, urlScheme } from "@/shared/lib/url";

/**
 * 원문 URL 정규화 — ingestion-ranking INV-C2 강제 지점.
 *
 * 이 함수가 내놓는 값이 항목의 **유일성 기준**이다(INV-C1: DB unique(canonical_url)).
 * 그래서 여기서 한 글자만 갈려도 같은 기사가 두 건으로 적재된다.
 *
 * 정규화 이전의 원본 URL 은 버리지 않고 따로 보존한다 — 원문 링크로 나갈 때 쓴다.
 * (추적 파라미터를 지운 주소가 출처에서 404 가 되는 경우가 있다.)
 */

/**
 * 지우는 추적 파라미터. `utm_` 은 접두사 규칙이라 목록에 없는 이름도 지워진다.
 *
 * 목록을 넓히는 건 조심스럽다 — 여기 없는 이름을 지우면 다른 기사를 같은 기사로 합칠 수 있고,
 * 반대로 안 지우면 같은 기사가 갈린다. 둘 다 조용히 틀리므로 "광고·분석 도구가 붙이는,
 * 문서 내용과 무관한 것이 확실한 이름"만 넣는다.
 */
export const TRACKING_PARAMS = [
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "twclid",
  "yclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
] as const;

const TRACKING_PREFIX = "utm_";

/** 원문 링크가 될 수 있는 스킴만 유일성 키가 된다 (content-safety INV-D6 과 같은 목록). */
const ALLOWED_SCHEMES = ["http", "https"];

/**
 * 정규화된 canonical_url 을 돌려준다. 유일성 기준이 될 수 없으면 null.
 *
 * null 은 "이 항목을 적재하지 않는다"는 뜻이다(INV-C3: 필수 필드 누락 항목은 버린다).
 * 유일성 키가 없는 항목을 넣으면 중복 판정 자체가 불가능해진다.
 */
export function canonicalizeUrl(raw: string): string | null {
  if (typeof raw !== "string") return null;

  // 브라우저가 URL 해석 전에 버리는 문자를 먼저 똑같이 버린다.
  // 이걸 건너뛰면 `java<탭>script:` 가 스킴 검사를 지나친다 (shared/lib/url 주석 참조).
  const cleaned = cleanUrlInput(raw);
  const scheme = urlScheme(cleaned);
  if (scheme === null || !ALLOWED_SCHEMES.includes(scheme)) return null;

  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    return null;
  }
  // 특수 스킴(http·https)은 호스트가 비면 URL 생성자가 던지지만, 판정을 여기 명시해 둔다.
  if (url.hostname === "") return null;

  // 스킴·호스트 소문자화와 기본 포트 제거는 URL 이 이미 해 준다.
  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith(TRACKING_PREFIX) || (TRACKING_PARAMS as readonly string[]).includes(lower)) {
      url.searchParams.delete(key);
    }
  }

  // 트레일링 슬래시 정리. 루트("/")는 남긴다 — 지우면 "https://ex.com" 이 돼
  // URL 로서 표기가 달라지고, 같은 주소가 두 형태로 갈린다.
  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  // 남은 파라미터가 없으면 물음표까지 지운다 ("…/a?" 와 "…/a" 가 갈리지 않게).
  // 파라미터 **순서**는 건드리지 않는다: 순서만 다른 두 주소를 합치려면 정렬해야 하는데,
  // 그건 INV-C2 가 열거한 규칙 밖이라 여기서 발명하지 않는다.
  return url.searchParams.size === 0
    ? `${url.origin}${url.pathname}`
    : url.toString();
}
