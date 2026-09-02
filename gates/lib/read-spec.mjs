// 스펙 frontmatter 의 유일한 읽기 경로. 어휘는 docs/references/docs-contract.md 가 정본이다.
//
// 실패 방향이 이 파일의 요점이다 — 모르는 값은 항상 더 엄격한 쪽으로 떨어진다.
//   status   모르는 값 → draft      (승인 안 된 것으로 본다)
//   surfaces 모르는 값 → 버린다      (그 표면을 커버하지 않는 것으로 본다)
// throw 하지 않는다. 오타 하나로 게이트가 죽으면 사람이 그 스펙을 지워서 우회한다.
//
// 현행 정규식도 이미 이 두 방향으로 떨어진다(check-read-spec 의 D·E 가 붙기 전에도 통과한다).
// 그러니 여기서 새로 만드는 성질이 아니라 깨뜨리면 안 되는 성질이다.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { frontmatterText, fmField, fmList } from "./frontmatter.mjs";

export const SPEC_STATUS = ["draft", "approved", "parked"];
export const SPEC_SURFACES = ["auth", "payment", "authz", "concurrency"];

/** 파일 내용에서 읽는다. 테스트·대조용으로 따로 열어 둔다. */
export function readSpecText(src, slug = "") {
  const fmText = frontmatterText(src);
  const problems = [];
  if (fmText === null)
    return { slug, feature: "", status: "draft", surfaces: [], problems: ["frontmatter 없음 → draft 로 본다"] };

  const feature = fmField(fmText, "feature") ?? "";

  const rawStatus = fmField(fmText, "status") ?? "";
  let status = "draft";
  if (rawStatus === "") problems.push("status 값이 비어 있다(다음 줄로 접혔을 수 있다) → draft 로 본다");
  else if (SPEC_STATUS.includes(rawStatus)) status = rawStatus;
  else problems.push(`status 값 '${rawStatus}' 은 등재된 어휘가 아니다 → draft 로 본다`);

  const surfaces = [];
  for (const t of fmList(fmText, "surfaces") ?? []) {
    if (SPEC_SURFACES.includes(t)) surfaces.push(t);
    else problems.push(`surfaces 값 '${t}' 은 등재된 어휘가 아니다 → 커버로 인정하지 않는다`);
  }

  return { slug, feature, status, surfaces, problems };
}

/** 파일 경로에서 읽는다. */
export function readSpec(file) {
  return readSpecText(readFileSync(file, "utf-8"), basename(file).replace(/\.md$/, ""));
}
