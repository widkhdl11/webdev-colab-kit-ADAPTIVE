// session-login INV-L13: 로그인 뒤 돌아갈 주소는 같은 사이트의 경로만 받는다. 조건에 맞지 않거나 비어 있으면 메인(/).
// 서버는 이 값을 사이트 주소에 붙여 주소를 만들지 않고 경로 그대로 돌려준다 — 브라우저가 지금 열린 주소에 붙인다.
// 인코딩으로 감싼 값(%2F%2F → //, %5C → \, %0d%0a → 줄바꿈)도 받지 않는다: 풀 수 있을 때까지 풀어 가며 단계마다 같은 검사를 한다.

export const HOME_PATH = "/";

const MAX_LENGTH = 512;
const MAX_DECODE_ROUNDS = 5;
// eslint-disable-next-line no-control-regex -- 제어 문자를 찾는 것이 목적이다
const CONTROL_CHAR = /[\u0000-\u001f\u007f-\u009f]/;

function looksLikeSitePath(v: string): boolean {
  if (!v.startsWith("/")) return false;
  if (v.startsWith("//")) return false;
  if (v.includes("\\")) return false; // 앞의 /\ 를 포함한다 — 브라우저는 역슬래시를 / 로 읽는다
  if (v.includes("://")) return false;
  if (CONTROL_CHAR.test(v)) return false;
  return true;
}

export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) return HOME_PATH;
  let layer = raw;
  for (let round = 0; round < MAX_DECODE_ROUNDS; round += 1) {
    if (!looksLikeSitePath(layer)) return HOME_PATH;
    let decoded: string;
    try {
      decoded = decodeURIComponent(layer);
    } catch {
      return HOME_PATH; // 풀 수 없는 인코딩
    }
    if (decoded === layer) return raw;
    layer = decoded;
  }
  return HOME_PATH; // 다섯 번 넘게 감싼 값은 받지 않는다
}
