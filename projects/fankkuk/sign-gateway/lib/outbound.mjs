// 게이트웨이가 밖으로 보내는 요청의 유일한 창구.
//
// - https 만, 허용 목록에 정확히 있는 호스트만 (config 가 드림시큐리티·카카오 접미사 안으로 이미 묶어 둠)
// - IP 를 직접 적은 주소는 거부
// - DNS 가 돌려준 주소가 내부망(사설·루프백·링크 로컬·169.254.169.254 등)이면 거부.
//   검사한 주소로 바로 연결하므로, 검사 뒤 DNS 답이 바뀌어도 내부망으로 가지 않는다.
// - 리다이렉트는 따라가지 않는다 (3xx 는 오류)

import dns from "node:dns";
import https from "node:https";
import net from "node:net";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_000_000;

export class OutboundBlockedError extends Error {}

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  blocked.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96], // NAT64
  ["2002::", 16], // 6to4
  ["fc00::", 7], // fd00:ec2::254(EC2 IPv6 메타데이터) 포함
  ["fe80::", 10],
  ["ff00::", 8],
]) {
  blocked.addSubnet(addr, prefix, "ipv6");
}

export function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) {
    // ::ffff:10.0.0.1 같은 IPv4 매핑 주소는 IPv4 로 다시 본다
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    // 16진 표기 매핑 주소(::ffff:a00:1)는 DNS 가 정상적으로 돌려주지 않는다 — 통째로 거부.
    // BlockList 에 ::ffff:0:0/96 을 넣으면 Node 가 모든 IPv4 주소를 거기에 걸린 것으로 본다.
    if (/^::ffff:/i.test(address)) return true;
    return blocked.check(address, "ipv6");
  }
  return true;
}

/** https.request 의 lookup 자리에 끼우는 함수. 내부망 주소가 하나라도 섞이면 연결하지 않는다. */
export function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err);
    const bad = addresses.find((a) => isBlockedAddress(a.address));
    if (bad || addresses.length === 0) {
      return callback(new OutboundBlockedError(`${hostname} 가 내부망 주소로 풀린다`));
    }
    if (options && options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

export function assertAllowedUrl(rawUrl, allowedHosts) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new OutboundBlockedError("주소 형식이 아니다");
  }
  if (url.protocol !== "https:") throw new OutboundBlockedError("https 만 허용한다");
  if (url.username || url.password) throw new OutboundBlockedError("주소에 계정 정보를 넣을 수 없다");
  if (url.port !== "" && url.port !== "443") throw new OutboundBlockedError("443 포트만 허용한다");
  const host = url.hostname.toLowerCase();
  if (net.isIP(host.replace(/^\[|\]$/g, ""))) throw new OutboundBlockedError("IP 주소로는 요청하지 않는다");
  if (!allowedHosts.includes(host)) throw new OutboundBlockedError(`${host} 는 허용 목록에 없다`);
  return url;
}

/**
 * @param {string} rawUrl
 * @param {{ allowedHosts: string[], method?: string, headers?: Record<string,string>, body?: string, timeoutMs?: number }} opts
 * @returns {Promise<{ status: number, headers: import("node:http").IncomingHttpHeaders, body: string }>}
 */
export function outboundRequest(rawUrl, opts) {
  const url = assertAllowedUrl(rawUrl, opts.allowedHosts);
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: opts.method ?? "GET",
        headers: opts.headers,
        lookup: guardedLookup,
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          reject(new OutboundBlockedError(`리다이렉트(${status})는 따라가지 않는다`));
          return;
        }
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            req.destroy(new Error("응답이 너무 크다"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("외부 요청 시간 초과")));
    req.on("error", reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}
