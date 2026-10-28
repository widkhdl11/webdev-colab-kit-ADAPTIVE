// fetch 와 같은 꼴의 함수 — 송장 출력 함수(묶어 올린 앱 코드)의 DB·로그인 확인 요청이 기본 fetch 대신 이것을 쓴다.
// 안쪽은 outbound.mjs 의 outboundRequest 라서 허용 목록·https·내부망 차단·리다이렉트 금지가 그대로 걸린다.

import { outboundRequest } from "./outbound.mjs";

const NULL_BODY = new Set([101, 204, 205, 304]);

function headersObject(h) {
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  if (Array.isArray(h)) return Object.fromEntries(h);
  return { ...h };
}

async function bodyText(body) {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return Buffer.from(body).toString("utf8");
  throw new TypeError("지원하지 않는 요청 본문");
}

/** @param {string[]} allowedHosts */
export function createGuardedFetch(allowedHosts, request = outboundRequest) {
  return async function guardedFetch(input, init = {}) {
    const isRequest = typeof Request !== "undefined" && input instanceof Request;
    const url = isRequest ? input.url : String(input);
    const method = init.method ?? (isRequest ? input.method : "GET");
    const headers = { ...headersObject(isRequest ? input.headers : undefined), ...headersObject(init.headers) };
    const body = init.body !== undefined ? await bodyText(init.body) : isRequest && method !== "GET" ? await input.text() : undefined;
    const res = await request(url, { allowedHosts, method, headers, body });
    const outHeaders = new Headers();
    for (const [k, v] of Object.entries(res.headers)) {
      if (Array.isArray(v)) v.forEach((x) => outHeaders.append(k, x));
      else if (v !== undefined) outHeaders.set(k, String(v));
    }
    return new Response(NULL_BODY.has(res.status) ? null : res.body, { status: res.status, headers: outHeaders });
  };
}
