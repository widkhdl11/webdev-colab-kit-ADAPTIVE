import type { SupabaseClient } from "@supabase/supabase-js";
import { GATE_ONE } from "@/entities/article";
import { dayKey, dayStartIso } from "@/shared/lib/datetime";
import { candidateWindowStartIso } from "../lib/candidate-window";
import { PICKED_TITLES_LIMIT } from "../lib/budgets";
import { keywordEvidence } from "../lib/keyword-evidence";
import type { HotIssueCandidate, HotIssueSave } from "../lib/ports";

/**
 * 핫이슈 단계의 **DB 문만** 모은 자리 (hot-issue.md INV-G1 · G2 · G4 · H1).
 *
 * ── 왜 `api/ports.ts` 에서 내려왔나 (2026-09-21 테스트 감사) ─────────────────
 * 저쪽 파일은 첫 줄이 `import "server-only"` 다. 그래서 **유닛 테스트가 그 파일을 로드조차
 * 못 한다.** 단계 테스트(`run-hot-issue.test.ts`)는 포트를 전부 가짜로 갈아 끼우므로
 * 진짜 DB 문은 한 줄도 안 돈다.
 *
 * 결과가 실측으로 드러났다 — `saveHotIssue` 의 update 에서 `hot_issue_answers` 줄을 지워도
 * 검사 842개가 전부 통과했다. 「칸은 만들었는데 아무것도 안 들어간다」가 초록불이었다.
 * 감사가 지목한 다른 변이 여덟 개(`toGate` 무력화 · 조회 컬럼에서 `gate` 삭제 ·
 * 종류 저장 블록 삭제 · 배정을 `null` 로 · 문 조건 삭제 …)도 같은 뿌리다.
 *
 * 여기는 `server-only` 를 안 붙이고 **클라이언트를 인자로 받는다.** 그래서
 * ① 오프라인 유닛이 가짜 클라이언트로 체이닝을 검증할 수 있고(게이트가 도는 `npm test` 안)
 * ② 통합 테스트가 **진짜 이 함수를 불러** 쓰고 읽어 확인할 수 있다.
 *
 * **비밀값은 여기로 안 온다** — 클라이언트를 만드는 것은 여전히 `api/ports.ts` 이고,
 * 그 파일이 `server-only` 로 클라 번들 유출을 막는다(INV-S4). 이 파일은 받은 것을 쓸 뿐이다.
 * 모델을 부르는 `judgeHotIssue` 는 Anthropic 키가 필요해 저쪽에 남겼다.
 */

/** 이 모듈이 만드는 네 가지. `HotIssuePorts` 중 DB 만 쓰는 것들이다. */
export interface HotIssueDbPorts {
  listHotIssueCandidates(limit: number): Promise<HotIssueCandidate[]>;
  listPickedTitlesToday(now: Date): Promise<string[]>;
  saveHotIssue(rows: HotIssueSave[]): Promise<void>;
  assignGates(itemIds: string[]): Promise<void>;
}

export function createHotIssueDbPorts(db: SupabaseClient): HotIssueDbPorts {
  return {
    async listHotIssueCandidates(limit: number): Promise<HotIssueCandidate[]> {
      // 후보는 **아직 안 물어본 글**이다(`hot_issue_at is null`). 중요도 값으로 판정하면
      // 중요도 0 인 글이 영원히 후보로 남는다 — 0008 마이그레이션 주석과 같은 자리다.
      //
      // 본문을 여기서 안 받는다: 한 건이 2만 자라 120건이면 최악 2.4MB 를 받게 된다.
      // 요약글이 없는 건에 대해서만 2차로 받아 온다(`listKeywordCandidates` 와 같은 패턴).
      // 다른 후보 조회와 **같은 창**을 쓴다 (2026-09-22). 여기만 전체 기간을 보면
      // 그날 예산이 3주 전 글의 판정에 쓰이고, 정작 오늘 글이 화면에 안 선다.
      const from = candidateWindowStartIso(new Date());
      let query = db
        .from("item")
        .select("id, title, source_excerpt, source_id, published_at")
        .is("hot_issue_at", null);
      if (from !== null) query = query.gte("published_at", from);
      const { data, error } = await query
        .order("published_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);

      const rows = (data ?? []).map((r) => ({
        id: r.id as string,
        title: (r.title as string) ?? "",
        excerpt: (r.source_excerpt as string | null) ?? "",
        sourceId: (r.source_id as string) ?? "",
        publishedAt: (r.published_at as string) ?? "",
      }));

      const needBody = rows.filter((r) => r.excerpt.trim() === "").map((r) => r.id);
      const bodyById = new Map<string, string>();
      if (needBody.length > 0) {
        const { data: bodies, error: bodyError } = await db
          .from("item")
          .select("id, content_html")
          .in("id", needBody);
        if (bodyError) throw new Error(bodyError.message);
        for (const b of bodies ?? []) {
          bodyById.set(b.id as string, (b.content_html as string | null) ?? "");
        }
      }

      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        // 근거 자르기는 키워드와 같은 함수를 쓴다 — 두 벌로 두면 상한이 갈린다.
        evidence: keywordEvidence(r.excerpt, bodyById.get(r.id) ?? ""),
        sourceId: r.sourceId,
        publishedAt: r.publishedAt,
      }));
    },

    async listPickedTitlesToday(now: Date): Promise<string[]> {
      // "오늘"은 화면이 날짜를 묶는 기준과 같아야 한다 — 다르면 사용자가 보는 오늘과
      // 중복 제거가 보는 오늘이 어긋나, 같은 사건이 화면의 한 날짜 안에 둘 다 남는다.
      const start = dayStartIso(dayKey(now.toISOString()));
      const { data, error } = await db
        .from("item")
        .select("title")
        .eq("gate", GATE_ONE)
        .gte("published_at", start ?? now.toISOString())
        // 최신부터 받아 상한을 건다 (2026-09-21 리뷰 2순위).
        //
        // **하루 상한이 있던 동안에는 이 목록이 10건을 못 넘었다.** 그 상한을 없앴으므로
        // (INV-N4) 이제 위쪽 한계가 없다 — 큰 날에 수십 건이 되고, 그 목록이 판정
        // 지시문에 통째로 실려 매 호출의 입력이 같이 커진다. 요금이 건수의 제곱으로 는다.
        //
        // 자르면 아주 큰 날에 맨 아래 제목이 중복 판정에서 빠지는데, 그쪽이 낫다 —
        // 중복 하나가 남는 것과 그날 판정 요금이 통째로 튀는 것의 차이다.
        .order("published_at", { ascending: false })
        .limit(PICKED_TITLES_LIMIT);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => (r.title as string) ?? "").filter((t) => t !== "");
    },

    async saveHotIssue(rows: HotIssueSave[]): Promise<void> {
      if (rows.length === 0) return;
      const askedAt = new Date().toISOString();

      // ── 쓰는 순서가 규칙이다 (2026-09-21 리뷰 1순위) ─────────────────────────
      // **「물어봤다」 표시(`hot_issue_at`)를 제일 마지막에 쓴다.** 중간에 죽어도 표시가
      // 안 찍혔으면 그 글은 다음 주기에 다시 잡혀 처음부터 다시 판정받는다.
      //
      // 순서를 거꾸로 두면(표시 먼저) 그 사이에 죽은 글은 **표시만 찍힌 채 종류가 영영 빈다** —
      // 다음 주기 후보에서 빠지므로 아무도 다시 채우지 않는다. 조용한 영구 누락이고,
      // 같은 계열의 실패를 INV-G2 가 중요도 쪽에서 이미 한 번 막고 있다.
      //
      // 그래서 ① 종류 → ② 중요도·근거 → ③ 표시 순으로 쓴다.

      // ① 종류. 다대다다 (INV-G1). 이미 붙어 있으면 기본키가 막는다 — 조용히 넘긴다.
      const links = rows.flatMap((row) =>
        row.kinds.map((kind) => ({ item_id: row.itemId, kind })),
      );
      if (links.length > 0) {
        const { error } = await db.from("item_kind").upsert(links, { ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }

      // ②③ 중요도·근거·표시. 한 행에 같이 쓰므로 이 셋은 쪼개지지 않는다.
      for (const row of rows) {
        const { error } = await db
          .from("item")
          .update({
            importance: row.importance,
            // 판정 근거 (INV-G2 · S31). 키는 `HOT_ISSUE_QUESTIONS` 가 정한다 —
            // DB 는 모양을 강제하지 않으므로 질문이 바뀌어도 마이그레이션이 필요 없다.
            hot_issue_answers: row.answers,
            // 참인 질문의 근거 문장 (INV-G2 · 0011). 빈 객체 = 물어봤지만 쓸 만한 근거가 없었다.
            // null(0011 이전 행) 과 가른다.
            hot_issue_reasons: row.reasons,
            hot_issue_at: askedAt,
          })
          .eq("id", row.itemId);
        if (error) throw new Error(error.message);
      }
    },

    async assignGates(itemIds: string[]): Promise<void> {
      if (itemIds.length === 0) return;
      const { error } = await db.from("item").update({ gate: GATE_ONE }).in("id", itemIds);
      if (error) throw new Error(error.message);
    },
  };
}
