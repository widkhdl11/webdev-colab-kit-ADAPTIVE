import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 서버는 localhost 가 아닌 주소에서 오는 개발용 파일 요청을 막는다. 127.0.0.1 로 열면 화면 스크립트가
  // 붙지 않아 로그인 버튼이 서버로 요청을 보내지 못했다(2026-10-02). 개발 서버에만 적용되는 설정이다.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
