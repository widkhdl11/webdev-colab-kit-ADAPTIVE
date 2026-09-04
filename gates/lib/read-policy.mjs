// 결정 규칙 frontmatter 의 유일한 읽기 경로. 어휘는 docs/references/docs-contract.md 7절이 정본이다.
//
// 실패 방향이 이 파일의 요점이고, 스펙과 다르다.
//   스펙은 "모르면 승인 안 된 것으로 본다"가 항상 방벽을 닫는 쪽이다.
//   정책은 버리면 근거 없이 결정하고, 살리면 틀린 근거로 결정한다 — 양쪽이 다 나쁘다.
//
//   그래서 둘을 묶는다: 못 읽는 규칙은 **버리고**, 그 규칙의 scope 를 **사람에게 올린다**.
//   scope 조차 알 수 없으면 올릴 자리가 없으므로 그냥 버린다(어차피 아무 데도 안 주입됐다).
//
// throw 하지 않는다. 오타 하나로 게이트가 죽으면 사람이 그 파일을 지워서 우회한다.
//
// 본문은 파싱하지 않는다. 통째로 넘긴다 — 본문에서 값을 긁으면 숨은 스키마가 된다(v3.2 교훈).

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { frontmatterText, fmField, fmList, dupKeys } from "./frontmatter.mjs";

export const POLICY_STATUS = ["confirmed", "provisional"];
export const POLICY_SCOPES = ["ui", "data-model", "api", "copy", "harness"];

/**
 * 파일 내용에서 읽는다. 테스트·대조용으로 따로 열어 둔다.
 * 반환: { id, scope, status, lastApplied, body, dropped, escalate, problems }
 *   dropped  이 규칙을 근거로 쓸 수 없다
 *   escalate 이 규칙 때문에 사람에게 올려야 하는 scope 목록(버려졌을 때만 채워진다)
 */
export function readPolicyText(src, slug = "") {
  const problems = [];
  const drop = (why, escalate) => ({
    id: slug, scope: [], status: null, lastApplied: "", body: "",
    dropped: true, escalate, problems: [...problems, why],
  });

  const fmText = frontmatterText(src);
  if (fmText === null)
    return drop("frontmatter 가 없다 → 버린다(어느 scope 인지 알 수 없어 올릴 자리도 없다)", []);

  // scope 를 먼저 읽는다 — 뒤에서 버리게 되더라도 '어디를 올릴지'는 알아야 한다.
  const scope = [];
  for (const t of fmList(fmText, "scope") ?? []) {
    if (POLICY_SCOPES.includes(t)) scope.push(t);
    else problems.push(`scope 값 '${t}' 은 등재된 어휘가 아니다 → 그 값만 버린다`);
  }

  const dups = dupKeys(fmText);
  if (dups.length > 0)
    return drop(`같은 키가 두 번 있다(${dups.join("·")}) → 어느 줄을 읽었는지 모르므로 버리고 올린다`, scope);

  const id = fmField(fmText, "id") ?? "";
  if (slug !== "" && id !== slug)
    return drop(`id '${id}' 가 파일명 '${slug}' 과 다르다 → 버리고 올린다`, scope);

  const status = fmField(fmText, "status") ?? "";
  if (!POLICY_STATUS.includes(status))
    return drop(`status 값 '${status}' 은 등재된 어휘가 아니다 → 버리고 올린다`, scope);

  if (scope.length === 0) return drop("남은 scope 가 없다 → 버린다", []);

  const end = src.indexOf("\n---", src.indexOf("---") + 3);
  const body = end === -1 ? "" : src.slice(src.indexOf("\n", end + 1) + 1);

  return {
    id, scope, status,
    lastApplied: fmField(fmText, "last_applied") ?? "",
    body, dropped: false, escalate: [], problems,
  };
}

/** 파일 경로에서 읽는다. 파일명이 곧 slug 다(스펙과 같은 규약). */
export function readPolicy(file) {
  return readPolicyText(readFileSync(file, "utf-8"), basename(file).replace(/\.md$/, ""));
}