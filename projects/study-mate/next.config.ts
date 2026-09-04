import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 은 개발 서버를 띄울 때 프로젝트 폴더에 에이전트 규칙 파일(CLAUDE.md · AGENTS.md)을
  // 스스로 만든다. 이 저장소에는 이미 그 이름의 협업 규칙 문서가 루트에 있고 두 벌이 대조되는
  // 구조라, 프로젝트 안에 같은 이름의 파일이 또 생기면 규칙의 출처가 둘이 된다.
  // (2026-09-04: 첫 `npm run dev` 가 실제로 두 파일을 만들었다)
  agentRules: false,
};

export default nextConfig;
