import type { NextConfig } from "next";
import { PHOTO_BODY_LIMIT } from "./src/features/creator-photo/model/photo-limits";

const nextConfig: NextConfig = {
  // 개발 서버는 localhost 가 아닌 주소에서 오는 개발용 파일 요청을 막는다. 127.0.0.1 로 열면 화면 스크립트가
  // 붙지 않아 로그인 버튼이 서버로 요청을 보내지 못했다(2026-10-02). 개발 서버에만 적용되는 설정이다.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // 프록시(src/proxy.ts)가 있으면 Next 가 요청 본문을 이 크기까지만 담아 라우트로 넘긴다(기본 10MB — 넘는 부분은 오류 없이 잘린다).
    // 사진 올리기 라우트의 본문 상한(10MB 사진 + 양식 머리줄)과 맞춘다 — 기본값이면 10MB 가까운 정상 사진이 잘려 거부된다(creator-link S9).
    proxyClientMaxBodySize: PHOTO_BODY_LIMIT,
  },
};

export default nextConfig;
