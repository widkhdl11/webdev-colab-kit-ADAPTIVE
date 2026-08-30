---
name: scaffold
description: 프로젝트 골격(FSD 6레이어 + tsconfig + 워킹 스켈레톤)을 생성한다
disable-model-invocation: true
allowed-tools: Bash
---
# 스캐폴딩 (멱등 — 기존 파일은 보존됨)
프로젝트는 `projects/<프로젝트명>/` 에 생성된다.
- 최초 생성: `node scripts/scaffold.mjs <프로젝트명>` (소문자·숫자·하이픈)
- 재생성(projects/ 아래 프로젝트가 하나면): !`node scripts/scaffold.mjs`

결과를 보고하고 `node gates/run-gates.mjs`로 골격을 검증한다.
