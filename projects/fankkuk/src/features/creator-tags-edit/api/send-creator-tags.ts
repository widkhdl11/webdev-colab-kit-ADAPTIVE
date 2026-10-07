import { postJson } from "@/shared/lib/http/post-json-client";

// 브라우저에서 크리에이터 태그를 저장한다(/api/creator/tags). 서버가 준 문구를 그대로 보여 준다.
// ok = 저장됨 / login = 세션이 끝났다 / failed = 저장하지 못했다(문구를 보인다)

export type SendTagsOutcome = { kind: "ok" } | { kind: "login" } | { kind: "failed"; message: string };

export async function sendCreatorTags(input: { tagIds: readonly string[]; customTag: string | null }): Promise<SendTagsOutcome> {
  const outcome = await postJson("/api/creator/tags", { tagIds: input.tagIds, customTag: input.customTag ?? "" });
  if (outcome.kind === "ok") return { kind: "ok" };
  if (outcome.status === 401) return { kind: "login" };
  return { kind: "failed", message: outcome.message };
}
