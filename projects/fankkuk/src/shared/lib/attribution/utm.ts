// 공유 링크의 utm 값(source·medium·campaign)을 처음 들어온 순간에만 쿠키에 남기는 도구.
// 값은 영문 소문자·숫자·밑줄·하이픈 1~50자만 남기고 그 밖은 버린다 — 이 꼴이면 쿠키·DB·화면 어디에 들어가도 글자 그대로다.
// 쿠키 값은 「source.medium.campaign」(빈 값은 빈칸). 점은 허용 글자가 아니라 구분자로만 쓰인다. 읽을 때도 다시 거른다.

export const UTM_COOKIE = "fk_utm";
/** 처음 들어온 경로를 30일 동안 기억한다 */
export const UTM_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** 화면 스크립트가 읽지 않는 쿠키 — 가입 처리(서버)만 읽는다. 사이트 어디로 들어와도 같은 값을 보게 경로는 전체. */
export function utmCookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: UTM_COOKIE_MAX_AGE };
}

export type Utm = { source: string | null; medium: string | null; campaign: string | null };

const UTM_SHAPE = /^[a-z0-9_-]{1,50}$/;

/** 꼴이 맞으면 그대로, 아니면 null(버린다). */
export function cleanUtmValue(value: string | null | undefined): string | null {
  return typeof value === "string" && UTM_SHAPE.test(value) ? value : null;
}

function nonEmpty(u: Utm): Utm | null {
  return u.source || u.medium || u.campaign ? u : null;
}

/** 주소의 utm 세 값을 하나씩 거른다. 남는 값이 하나도 없으면 null. */
export function utmFromSearch(params: URLSearchParams): Utm | null {
  return nonEmpty({
    source: cleanUtmValue(params.get("utm_source")),
    medium: cleanUtmValue(params.get("utm_medium")),
    campaign: cleanUtmValue(params.get("utm_campaign")),
  });
}

export function encodeUtm(u: Utm): string {
  return [u.source ?? "", u.medium ?? "", u.campaign ?? ""].join(".");
}

/** 쿠키 값을 읽어 다시 거른다. 꼴이 틀리거나 남는 값이 없으면 null. */
export function decodeUtm(raw: string | undefined): Utm | null {
  if (typeof raw !== "string") return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [source, medium, campaign] = parts.map((p) => cleanUtmValue(p));
  return nonEmpty({ source: source ?? null, medium: medium ?? null, campaign: campaign ?? null });
}

/**
 * 이번 요청에 새로 심을 쿠키 값. 이미 읽을 수 있는 값이 있으면(처음 들어온 기록) 덮어쓰지 않고 null,
 * 주소에 거른 뒤 남는 utm 이 없어도 null.
 */
export function firstTouchUtmCookie(params: URLSearchParams, existing: string | undefined): string | null {
  if (decodeUtm(existing)) return null;
  const u = utmFromSearch(params);
  return u ? encodeUtm(u) : null;
}
