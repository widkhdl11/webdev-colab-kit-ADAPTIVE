import { cleanUrlInput, urlScheme } from "@/shared/lib/url";

/**
 * 서버가 **밖으로 요청을 보내도 되는 주소인가**를 판정한다. 도메인 지식은 없다.
 *
 * 왜 있나: 수집은 피드가 준 주소로 서버가 직접 요청을 보낸다. 소스 목록은 우리가 정하지만
 * **피드 안의 링크는 발행처가 정한다.** 소스 한 곳이 내부 주소를 실으면 서버가 그것을 받아 와
 * 본문으로 저장하고, 그 내용이 공개 화면에 렌더된다. 스크립트가 도는 것이 아니라
 * **내부 응답이 밖으로 나가는 것**이 문제다.
 *
 * 허용 목록 방식이다 — 스킴은 http·https 둘뿐이고, 호스트는 아래 차단 대역에 걸리지 않아야 한다.
 * 판정할 수 없는 것은 전부 거부다("모르면 막는 쪽").
 *
 * **막지 못하는 것**: 공개 이름이 사설 주소로 풀리는 경우(DNS 리바인딩). 이름을 실제로 풀어
 * 그 주소를 봐야 잡히는데, 그러면 푼 주소와 요청이 쓰는 주소가 달라질 수 있는 문제가 따로 생긴다.
 * 그 위험은 스펙 `ingest-auth.md` 의 비범위 절에 적어 두었다.
 */

/** 이 스킴만 서버가 부른다. content-safety INV-D6 의 본문 링크 목록과는 다르다(mailto 가 없다). */
const ALLOWED_SCHEMES = ["http", "https"];

/** 이름 자체가 내부를 가리키는 접미사. 점 없는 `localhost` 도 따로 본다. */
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan"];

/** 점 넷짜리 IPv4 인가. `new URL` 이 이미 정규화하므로 여기 오는 것은 이 꼴뿐이다. */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * 공개 인터넷이 아닌 IPv4 대역.
 *
 * `169.254.169.254`(클라우드 메타데이터)가 이 목록의 이유 절반이다 — 그 한 주소가
 * 인스턴스의 자격 증명을 평문으로 돌려준다.
 */
function isBlockedIpv4(host: string): boolean {
  const m = IPV4.exec(host);
  if (m === null) return false;
  if (m.slice(1).some((p) => Number(p) > 255)) return true; // 점 넷인데 값이 범위 밖 — 모르면 막는다
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (a === 0) return true; // 0.0.0.0/8 "이 네트워크"
  if (a === 10) return true; // 사설
  if (a === 127) return true; // 루프백
  if (a === 100 && b >= 64 && b <= 127) return true; // 통신사 내부(CGNAT)
  if (a === 169 && b === 254) return true; // 링크 로컬 — 클라우드 메타데이터가 여기다
  if (a === 172 && b >= 16 && b <= 31) return true; // 사설
  if (a === 192 && b === 168) return true; // 사설
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0/24 프로토콜 할당
  if (a === 198 && (b === 18 || b === 19)) return true; // 성능 시험용
  if (a >= 224) return true; // 멀티캐스트·예약·브로드캐스트
  return false;
}

/**
 * 공개 인터넷이 아닌 IPv6 대역. `new URL` 은 대괄호를 남기고 소문자 16진으로 접어 준다.
 *
 * IPv4 를 품은 표기(`::ffff:7f00:1`)를 따로 푸는 것이 여기서 제일 중요하다 —
 * 그 표기를 놓치면 루프백 차단이 한 줄로 우회된다.
 */
function expandIpv6(inner: string): number[] | null {
  const halves = inner.split("::");
  if (halves.length > 2) return null;
  const toGroups = (text: string): number[] | null => {
    if (text === "") return [];
    const out: number[] = [];
    for (const part of text.split(":")) {
      const v4 = IPV4.exec(part); // 끝에 붙는 점 넷 표기
      if (v4 !== null) {
        if (v4.slice(1).some((p) => Number(p) > 255)) return null;
        out.push((Number(v4[1]) << 8) | Number(v4[2]), (Number(v4[3]) << 8) | Number(v4[4]));
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
      out.push(parseInt(part, 16));
    }
    return out;
  };
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (head === null || tail === null) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const gap = 8 - head.length - tail.length;
  if (gap < 0) return null;
  return [...head, ...Array<number>(gap).fill(0), ...tail];
}

/**
 * 공개 인터넷이 아닌 IPv6 대역. `new URL` 은 대괄호를 남기고 소문자 16진으로 접어 준다.
 *
 * **IPv4 를 품은 표기를 푸는 것이 여기서 제일 중요하다.** 그것을 놓치면 루프백 차단이
 * 한 줄로 우회된다. 표기가 여럿이라(`::7f00:1` · `::ffff:7f00:1` · `::ffff:0:7f00:1` ·
 * NAT64 의 `64:ff9b::7f00:1`) 문자열로 맞추지 않고 여덟 덩어리로 펴서 본다.
 *
 * **못 읽으면 막는다.** 여기 오는 값은 이미 `new URL` 이 정규화한 것이라 정상 주소는
 * 전부 읽힌다 — 안 읽히는 것은 우리가 모르는 표기이고, 모르는 것은 막는 쪽이다.
 */
function isBlockedIpv6(host: string): boolean {
  if (!host.startsWith("[") || !host.endsWith("]")) return false;
  const inner = host.slice(1, -1).toLowerCase().split("%")[0]; // 영역 id(%eth0)는 버린다
  const g = expandIpv6(inner);
  if (g === null) return true;

  if (g.every((x) => x === 0)) return true; // :: 미지정
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1 루프백
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 고유 로컬
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 링크 로컬
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 멀티캐스트

  // 6to4 — 접두가 2002 면 **바로 다음 두 덩어리**가 IPv4 다(뒤 둘이 아니다).
  if (g[0] === 0x2002) return isBlockedIpv4(`${g[1] >> 8}.${g[1] & 0xff}.${g[2] >> 8}.${g[2] & 0xff}`);

  // IPv4 를 품은 표기 — 앞 넷이 0 이고 다섯째·여섯째가 0 이나 ffff 면 뒤 둘이 IPv4 다.
  const embedsV4 =
    (g.slice(0, 4).every((x) => x === 0) &&
      (g[4] === 0 || g[4] === 0xffff) &&
      (g[5] === 0 || g[5] === 0xffff)) ||
    (g[0] === 0x64 && g[1] === 0xff9b); // NAT64 의 약속된 접두
  if (!embedsV4) return false;
  const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
  return isBlockedIpv4(v4);
}

/**
 * 보내도 되는 주소면 **정규화된 주소 문자열**을, 아니면 `null` 을 돌려준다.
 *
 * 문자열을 돌려주는 이유가 있다: 판정은 정규화한 주소로 하고 요청은 원본 문자열로 보내면
 * **검사한 것과 보내는 것이 다른 값**이 된다. 지금은 둘이 같은 파서를 쓰지만, 그것은 코드가
 * 보장하는 것이 아니라 우연이다. 부르는 쪽이 이 반환값을 그대로 보내면 그 틈이 사라진다.
 * (`url.ts` 주석 ②와 같은 원칙이다)
 *
 * `null` 은 "안전하지 않다"가 아니라 **"보내도 된다고 말할 수 없다"**이다.
 */
export function normalizePublicHttpUrl(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = cleanUrlInput(raw);
  const scheme = urlScheme(cleaned);
  if (scheme === null || !ALLOWED_SCHEMES.includes(scheme)) return null;

  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    return null;
  }
  // 자격 증명이 든 주소는 안 보낸다. 요청 라이브러리가 어차피 거부하는데, 그 거부는
  // 우리 메시지가 아니라 낯선 예외로 올라온다.
  if (url.username !== "" || url.password !== "") return null;

  // **뒤에 붙은 점을 먼저 떼어낸다.** `localhost.` 는 이름 경로에서 점이 그대로 남아서
  // 아래 이름 대조를 통째로 지나가는데, DNS 는 그것을 완전한 이름으로 읽어 그대로 푼다.
  // (IP 표기는 URL 파서가 이미 떼어 준다 — `127.0.0.1.` 은 여기 오기 전에 정규화된다)
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (host === "") return null;

  const isIpLiteral = host.startsWith("[") || IPV4.test(host);
  // 점이 하나도 없는 이름은 거부한다. 사내망·컨테이너망에서는 검색 도메인이 붙어 내부
  // 호스트로 풀린다(`http://intranet/`·컨테이너 서비스 이름). 공개 발행처에는 이런 이름이
  // 있을 수 없어서 멀쩡한 소스를 막을 위험이 없다.
  if (!isIpLiteral && !host.includes(".")) return null;
  if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return null;
  if (isBlockedIpv4(host)) return null;
  if (isBlockedIpv6(host)) return null;
  return url.toString();
}

/** 보내도 되는 주소인가. 판정만 필요할 때 쓴다. */
export function isPublicHttpUrl(raw: string): boolean {
  return normalizePublicHttpUrl(raw) !== null;
}
