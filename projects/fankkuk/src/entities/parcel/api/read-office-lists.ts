import type { SupabaseClient } from "@supabase/supabase-js";
import { officeParcelsFromRows, type OfficeParcel } from "../model/office-parcel";
import {
  expiryDueFromRows,
  findFlagsFromRows,
  inboundMetricsFromRows,
  pendingLabelFromRows,
  revgiftSharesFromRows,
  unmatchedFromRows,
  type ExpiryDue,
  type FindFlag,
  type InboundMetrics,
  type PendingLabel,
  type RevgiftShare,
  type UnmatchedParcel,
} from "../model/office-lists";

// 관리자 사무실 화면의 읽기 (office-workflow INV-W1·W2·W3·W5·W6·W7). 로그인한 운영자의 세션 클라이언트로 부른다 —
// 운영자가 아니면 DB 가 빈 결과를 준다. 관리자(서비스) 키는 쓰지 않는다. 꼴이 다른 답은 오류로 던진다.

type Rpc = Pick<SupabaseClient, "rpc">;

async function readRows<T>(client: Rpc, fn: string, label: string, parse: (rows: unknown) => T | null): Promise<T> {
  const { data, error } = await client.rpc(fn);
  if (error) throw new Error(`${label}을 읽지 못했다: ${error.code}`);
  const parsed = parse(data);
  if (parsed === null) throw new Error(`${label}의 모양이 다르다`);
  return parsed;
}

export function readOfficeParcels(client: Rpc): Promise<OfficeParcel[]> {
  return readRows(client, "admin_office_parcels", "들어온 상자 목록", officeParcelsFromRows);
}

/** 운영자 확인 목록 — 보류 상자(미확인 입고 + 출고를 멈춘 상자). inbound-address-code INV-C9: 주문번호·닉네임·6자리는 오지 않는다. */
export function readUnmatchedParcels(client: Rpc): Promise<UnmatchedParcel[]> {
  return readRows(client, "admin_unmatched_parcels", "보류 상자 목록", unmatchedFromRows);
}

/** INV-C10: 찾기 실패가 반복돼 확인 대상으로 표시된 계정 */
export function readFindFlags(client: Rpc): Promise<FindFlag[]> {
  return readRows(client, "admin_find_flags", "찾기 실패 반복 계정", findFlagsFromRows);
}

/** 측정 숫자(최근 30일) */
export function readInboundMetrics(client: Rpc): Promise<InboundMetrics> {
  return readRows(client, "admin_inbound_metrics", "입고 측정 숫자", inboundMetricsFromRows);
}

export function readExpiryDue(client: Rpc): Promise<ExpiryDue[]> {
  return readRows(client, "admin_expiry_due", "자동 처리 예정 목록", expiryDueFromRows);
}

export function readRevgiftShares(client: Rpc): Promise<RevgiftShare[]> {
  return readRows(client, "admin_revgift_shares", "역조공 몫 목록", revgiftSharesFromRows);
}

/** INV-W2: 이 작업자가 출력하고 아직 부착 확인하지 않은 라벨(없으면 null). */
export async function readMyPendingLabel(client: Rpc): Promise<PendingLabel | null> {
  const result = await readRows(client, "office_my_pending_label", "부착 대기 라벨", (rows) => {
    const r = pendingLabelFromRows(rows);
    return r.ok ? r : null;
  });
  return result.pending;
}
