import { normalizePublicHttpUrl } from "@/shared/lib/public-url";

/**
 * 리다이렉트를 따라가는 횟수 상한. 정상 소스는 한두 번이면 끝난다.
 * 상한이 없으면 끝없이 서로를 가리키는 주소 한 쌍이 수집을 매단다.
 */
const MAX_REDIRECTS = 5;

/**
 * 호스트가 바뀌는 칸에서 떨어뜨리는 헤더.
 *
 * 지금 부르는 쪽이 싣는 것은 `user-agent`·`accept` 뿐이라 새는 것이 없다. 그런데
 * **구조가 그것을 막고 있지 않았다** — 유료 피드 때문에 자격 증명 헤더를 하나 붙이는 순간,
 * 공개 소스가 남의 호스트로 돌려보내면 그 헤더가 따라간다.
 * 여기 헤더를 늘리려면 이 목록을 먼저 본다.
 */
const CREDENTIAL_HEADERS = ["authorization", "cookie", "proxy-authorization"];

function stripCredentials(init: RequestInit): RequestInit {
  const headers = new Headers(init.headers);
  for (const name of CREDENTIAL_HEADERS) headers.delete(name);
  return { ...init, headers };
}

/**
 * **밖으로 나가는 요청은 전부 이 함수를 지난다** (INV-IA5·INV-IA6).
 *
 * 리다이렉트를 브라우저처럼 자동으로 따라가지 않고 직접 한 칸씩 따라간다. 이유가 하나뿐이다 —
 * 첫 주소만 검사하면 **302 한 번으로 우회된다.** 공개 주소가 `http://169.254.169.254/` 로
 * 돌려보내면 자동 추적은 그것을 그대로 받아 온다.
 *
 * 보내는 주소는 **판정이 돌려준 정규화된 값**이다. 판정한 문자열과 보내는 문자열이 다르면
 * 그 틈이 곧 공격면이다.
 *
 * 거부는 던져서 알린다. 수집 파이프라인은 항목 하나의 실패를 이미 정상 실패로 처리한다 —
 * 조용히 빈 값을 돌려주면 "가져왔는데 비어 있다"와 구별되지 않는다.
 */
export async function fetchPublic(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  let next: string | null = rawUrl;
  let origin: string | null = null;
  let headers = init;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url: string | null = normalizePublicHttpUrl(next);
    if (url === null) throw new Error("공개 주소가 아니라 요청하지 않는다");

    const here = new URL(url).origin;
    if (origin !== null && here !== origin) headers = stripCredentials(headers);
    origin = here;

    const res = await fetch(url, { ...headers, redirect: "manual" });
    // **내용을 볼 수 없는 응답은 받지 않는다.** 브라우저에서 `redirect: "manual"` 은 상태가
    // 0 인 불투명 응답을 돌려주는데, 그것을 그대로 돌려주면 아래 판정이 통째로 건너뛰어진다 —
    // 막았다고 생각한 자리가 아무것도 안 막는 자리가 된다. 이 문은 서버에서만 도는 것이
    // 전제고(INV-IA5·IA6 의 강제 위치), 그 전제가 깨지면 여기서 걸린다.
    if (res.type === "opaqueredirect" || res.status === 0) {
      throw new Error("리다이렉트를 직접 따라갈 수 없는 자리에서 불렸다");
    }
    if (res.status < 300 || res.status >= 400) return res;

    const location = res.headers.get("location");
    if (location === null || location === "") return res; // 갈 곳을 안 알려 주면 그대로 돌려준다
    // 상대 주소·프로토콜 상대 주소로 올 수 있다. 지금 주소를 기준으로 푼 뒤 **다시 검사한다.**
    try {
      next = new URL(location, url).toString();
    } catch {
      throw new Error("리다이렉트 주소를 읽을 수 없다");
    }
  }
  throw new Error(`리다이렉트가 ${MAX_REDIRECTS}번을 넘었다`);
}
