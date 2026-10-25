import type { NextConfig } from "next";
import { PHOTO_BODY_LIMIT } from "./src/shared/lib/image/photo-limits";

// 보안 헤더(CSP) — 2026-10-14 추가분 3. 지금은 막지 않고 위반만 브라우저 콘솔에 남기는 모드(Report-Only)다.
// 결제 창(토스)·글꼴(jsdelivr)·프로필 사진(Supabase 저장소)이 깨지지 않는 것을 운영에서 확인한 뒤 막는 모드로 바꾼다(BACKLOG).
// 기준: Next 문서의 「Without Nonces」 예시 + 이 사이트가 실제로 부르는 바깥 출처.
const isDev = process.env.NODE_ENV === "development";
const storageOrigin = (() => {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : "";
  } catch {
    return "";
  }
})();
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://js.tosspayments.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  `img-src 'self' blob: data: ${storageOrigin}`.trim(),
  "connect-src 'self' https://*.tosspayments.com",
  "frame-src https://*.tosspayments.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.tosspayments.com",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy-Report-Only", value: csp },
          // 다른 사이트가 이 화면을 끼워 넣지 못하게 — CSP 의 frame-ancestors 는 기록만 하는 모드라 막지 않으므로 이 헤더로 지금 막는다(보안 리뷰 2026-10-14)
          { key: "X-Frame-Options", value: "DENY" },
          // 다른 사이트로 가는 요청에는 출처(https://fankkuk.com)만 보낸다 — 비밀번호 재설정·이메일 확인 화면은 주소에 링크 값을 담으므로
          // 경로까지 넘어가면 안 된다. 요즘 브라우저 기본값과 같지만 브라우저마다 다를 수 있어 적어 둔다(v18 보안 리뷰 낮음 ②, OWASP 권장값)
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  // 개발 서버는 localhost 가 아닌 주소에서 오는 개발용 파일 요청을 막는다. 127.0.0.1 로 열면 화면 스크립트가
  // 붙지 않아 로그인 버튼이 서버로 요청을 보내지 못했다(2026-10-02). 개발 서버에만 적용되는 설정이다.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // 프록시(src/proxy.ts)가 있으면 Next 가 요청 본문을 이 크기까지만 담아 라우트로 넘긴다(기본 10MB — 넘는 부분은 오류 없이 잘린다).
    // 사진 올리기 라우트의 본문 상한(10MB 사진 + 양식 머리줄)과 맞춘다 — 기본값이면 10MB 가까운 정상 사진이 잘려 거부된다(creator-link S9).
    proxyClientMaxBodySize: PHOTO_BODY_LIMIT,
    // 통째로 미리 받은 화면(링크에 마우스를 올렸을 때, shared/ui/intent-prefetch)을 다시 쓰는 시간 — 기본 5분이면 선물 상태·처리할 일 숫자가
    // 몇 분 전 값으로 보일 수 있어 30초로 줄인다(사용자 결정 2026-10-18). 요청마다 새로 그리는 페이지의 기본값(dynamic 0초)은 그대로 둔다.
    staleTimes: { static: 30 },
  },
};

export default nextConfig;
