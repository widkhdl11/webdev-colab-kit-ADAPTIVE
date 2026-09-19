import { OFFICIAL_BASES, type OfficialBasis } from "../model/types";

/**
 * 저장된 값 → 근거 (INV-O2). **모르는 값은 `none` 이다.**
 *
 * 컬럼이 없을 때(마이그레이션 전)와 값이 깨졌을 때가 같은 결과여야 한다 —
 * 둘 다 "판단할 근거가 없다"이고, 그때 표시를 안 붙이는 게 안전한 쪽이다.
 */
export function toOfficialBasis(value: unknown): OfficialBasis {
  return (OFFICIAL_BASES as readonly string[]).includes(value as string)
    ? (value as OfficialBasis)
    : "none";
}

/**
 * 원문 주소의 호스트 (`www.` 제거, 소문자). 주소가 아니거나 http/https 가 아니면 null.
 *
 * 스킴을 여기서 보는 이유: `new URL` 은 `javascript://anthropic.com/…` 에서도 authority 를
 * 읽어 hostname 을 `anthropic.com` 으로 돌려준다. 지금은 적재 경계(canonicalizeUrl)가 먼저
 * 걸러 닿지 않지만, 그 순서를 이 함수 밖의 다른 파일이 지키고 있다 — 여기서 한 번 더 막는다.
 */
export function hostFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  // 끝점 표기(`anthropic.com.`)는 같은 호스트를 가리키는 다른 글자다. 안 지우면 대조에서 빠진다.
  return parsed.hostname.replace(/^www\./, "").replace(/\.$/, "").toLowerCase();
}

/**
 * 주체가 발표를 내는 자리. **모양만 맞춘 타입이다** — entities 끼리는 서로 import 하지 않으므로
 * 정본(`entities/source` 의 `SubjectSite`)을 가져오지 않고 구조로 받는다.
 */
export interface SubjectSiteLike {
  host: string;
  pathPrefix?: string;
}

/**
 * `byUrl` 공식 여부 판정 — content-selection INV-O3.
 *
 * 모델을 거치지 않는다. 원문 주소의 호스트·경로가 설정에 적힌 자리와 맞는지만 본다 —
 * 확실한 근거(주소)를 모델 판단으로 바꾸면 INV-O2 의 구분(byUrl vs byContent)이 무의미해진다.
 */
export function isOfficialByUrl(url: string, sites: readonly SubjectSiteLike[]): boolean {
  const host = hostFromUrl(url);
  if (host === null) return false;

  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }

  return sites.some((site) => {
    const expected = site.host.replace(/^www\./, "").replace(/\.$/, "").toLowerCase();
    if (expected === "") return false;
    // **하위 도메인은 안 받는다.** `endsWith(".도메인")` 으로 열면 사람이 글을 올리는
    // 하위 도메인(포럼·커뮤니티)까지 확정 공식이 된다.
    if (host !== expected) return false;
    return site.pathPrefix === undefined || path.startsWith(site.pathPrefix);
  });
}

/**
 * 근거는 **올라가기만 한다** (INV-O2).
 *
 * 이 규칙이 features 의 조건문으로만 존재하면 화면이나 경로가 하나 늘 때 한쪽만 고쳐도
 * 컴파일이 된다. `byUrl` 은 기계가 대조한 사실이라 모델 판단으로 덮이지 않는다.
 */
export function nextOfficialBasis(
  current: OfficialBasis,
  claimedByContent: boolean,
): OfficialBasis {
  if (current === "byUrl") return "byUrl";
  return claimedByContent ? "byContent" : current;
}

/**
 * 재적재 때 이 근거를 페이로드에 실을지 (INV-O2).
 *
 * `byUrl` 만 싣는다 — 주소에서 기계적으로 나오는 값이라 매번 같고, 다시 실어도 덮을 게 없다.
 * `none` 을 실으면 재수집이 **모델이 붙인 `byContent` 를 매 주기 지운다.**
 */
export function persistsOnReingest(basis: OfficialBasis): boolean {
  return basis === "byUrl";
}
