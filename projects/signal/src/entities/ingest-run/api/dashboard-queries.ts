// 개발자용 대시보드만 읽는 테이블이라 secret 키로 읽는다 — ingest_run 에는 공개 select
// 정책이 없다(0005 마이그레이션). publicSupabase 로는 애초에 아무것도 안 돌아온다.
import "server-only";

import { serverSupabase } from "@/shared/api/supabase-server";
import { toIngestRunRecord, toRunSourceItem } from "./row";
import type { IngestRunRecord, RunSourceItem } from "../model/types";

const RUN_COLUMNS = "id, started_at, elapsed_ms, budget, usage, sources";

/** 가장 최근 실행 하나. 실행 기록이 없으면 null — 부르는 쪽이 "실행 없음"으로 그린다. */
export async function fetchLatestIngestRun(): Promise<IngestRunRecord | null> {
  const { data, error } = await serverSupabase()
    .from("ingest_run")
    .select(RUN_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`실행 이력 조회 실패: ${error.message}`);
  return data === null ? null : toIngestRunRecord(data);
}

/**
 * 이 실행에서 그 소스가 다룬 글(새로 넣었거나 다시 확인한 것 모두).
 *
 * `last_ingest_run_id` 로 고른다 — 소스의 전체 보관분이 아니라 **이번 실행분만**이다.
 * 걸러진 글은 여기 안 나온다(INV-F2: 걸러진 것은 애초에 적재되지 않는다) — 그건
 * `IngestRunSourceStat.filteredTitles` 가 따로 들고 있다.
 */
export async function fetchRunSourceItems(
  runId: string,
  sourceId: string,
): Promise<RunSourceItem[]> {
  const { data, error } = await serverSupabase()
    .from("item")
    .select("id, title, title_ko, original_url, published_at")
    .eq("last_ingest_run_id", runId)
    .eq("source_id", sourceId)
    .order("published_at", { ascending: false });
  if (error) throw new Error(`소스별 글 조회 실패: ${error.message}`);

  // 못 믿을 행은 버린다(null) — 이 값들은 남의 RSS 가 준 제목·주소라 신뢰 경계다
  // (rules/supabase). 행 하나가 이상하다고 목록 전체가 죽으면 안 된다.
  return (data ?? []).map(toRunSourceItem).filter((r): r is RunSourceItem => r !== null);
}
