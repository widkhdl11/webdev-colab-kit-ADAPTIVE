/**
 * URL 문자열 정리·스킴 추출. 도메인 지식은 없다(어느 프로젝트에 옮겨도 동작한다).
 *
 * 브라우저는 URL 을 읽기 전에 어떤 문자들을 버린다 — 앞뒤의 C0 제어문자·공백과,
 * 위치를 가리지 않는 탭·개행이다. 그래서 `java<탭>script:` 는 실제로 `javascript:` 로 실행된다.
 * 우리도 판정 전에 같은 정리를 한다.
 *
 * **이 정리는 보안 장치가 아니다.** 문자를 제거하기만 하므로 허용 범위를 넓히는 방향으로만
 * 작동한다 — 정리를 빼도 `<탭>javascript:` 는 "스킴을 못 찾음"이 되어 어차피 거부된다
 * (허용 목록 방식에서 못 찾음은 거부다). 정리가 실제로 하는 일은 그 반대다:
 *
 *   ① **멀쩡한 URL 이 조용히 버려지는 것을 막는다.** 수집 데이터에 흔한 앞뒤 공백 하나로
 *      출처 링크가 통째로 사라지면 안 된다.
 *   ② **검사한 문자열과 렌더할 문자열을 같게 만든다.** 브라우저가 버릴 문자를 우리가 남겨두면
 *      "검사한 것"과 "실행될 것"이 달라진다 — 그 틈이 진짜 공격면이다.
 */

/** 위치와 무관하게 버려지는 문자 — 브라우저가 URL 해석 전에 전부 제거한다. */
const STRIPPED_ANYWHERE = /[\t\n\r]/g;

/** 스킴 문법(RFC 3986): ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) ":" */
const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/** 앞뒤에서 잘라내는 경계: C0 제어문자와 공백(U+0000~U+0020). */
const TRIM_MAX_CODE = 0x20;

/**
 * 브라우저가 URL 을 해석하기 전에 버리는 문자들을 똑같이 버린다.
 *
 * 앞뒤 잘라내기를 정규식 문자 범위로 쓰지 않는 이유: 소스에 NUL 같은 제어문자가
 * 그대로 박히면 편집기·도구에 따라 조용히 뭉개진다. 코드포인트 비교가 안전하다.
 */
export function cleanUrlInput(raw: string): string {
  const s = raw.replace(STRIPPED_ANYWHERE, "");
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= TRIM_MAX_CODE) start += 1;
  while (end > start && s.charCodeAt(end - 1) <= TRIM_MAX_CODE) end -= 1;
  return s.slice(start, end);
}

/**
 * 정리된 URL 에서 스킴을 소문자로 뽑는다. 스킴이 없으면 null.
 *
 * null 은 "안전하다"가 아니라 "스킴을 못 찾았다"는 뜻이다 — 상대 주소와
 * 프로토콜 상대 주소(`//host`)가 모두 여기 해당한다. 허용 목록 방식에서는
 * 못 찾은 것도 통과시키지 않는다(부르는 쪽 책임).
 */
export function urlScheme(raw: string): string | null {
  const m = SCHEME.exec(cleanUrlInput(raw));
  return m ? m[1].toLowerCase() : null;
}
