import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ACCESS_DENY_REASONS, ACCESS_REQUESTERS, MAX_DECRYPTS_PER_BOX, type AccessDenyReason, type AccessRequester } from "../model/access-log";

// 운영자 내부 주소 열람 기록 (address-protection INV-P7 — 2026-10-12 문제집 D12).
// 크리에이터·팬 열람 기록에는 주소가 열린 줄과 지운 줄만 간다. 거부 줄(직원 시도 「대표 아님」 포함)과 대표·직원 구분은
// 여기, 운영자만 부를 수 있는 DB 함수(admin_access_log)로만 읽는다 — 운영자가 아니면 DB 가 42501 로 거부한다.
// 사람은 닉네임으로만 온다(admin-console INV-K8). 계정 id·주소·운송장 번호는 어느 칸에도 없다.

/** gift = 팬 선물(크리에이터 주소), revgift = 역조공 몫(팬 주소). 역조공의 거부 사유는 팬 선물 목록 안에 있다. */
export type AdminAccessTarget = "gift" | "revgift";

export type AdminAccessEntry = {
  at: string;
  target: AdminAccessTarget;
  orderNo: string;
  requester: AccessRequester;
  /** 요청한 운영자의 닉네임. 계정이 지워졌으면 null. */
  requesterNickname: string | null;
  result: { kind: "opened"; printNo: number; released: boolean } | { kind: "denied"; reason: AccessDenyReason };
};

const base = {
  at: z.iso.datetime({ offset: true }),
  target: z.enum(["gift", "revgift"]),
  order_no: z.string().min(1),
  requester: z.enum(ACCESS_REQUESTERS),
  requester_nickname: z.string().nullable(),
};

const rowSchema = z.discriminatedUnion("result", [
  z.object({
    ...base,
    result: z.literal("opened"),
    print_no: z.number().int().min(1).max(MAX_DECRYPTS_PER_BOX),
    deny_reason: z.null(),
    released: z.boolean(),
  }),
  z.object({
    ...base,
    result: z.literal("denied"),
    print_no: z.null(),
    deny_reason: z.enum(ACCESS_DENY_REASONS),
    // 거부 줄은 돌려줄 것이 없다
    released: z.literal(false),
  }),
]);

export function parseAdminAccessLogRows(rows: unknown): AdminAccessEntry[] {
  return z
    .array(rowSchema)
    .parse(rows)
    .map((r) => ({
      at: new Date(r.at).toISOString(),
      target: r.target,
      orderNo: r.order_no,
      requester: r.requester,
      requesterNickname: r.requester_nickname,
      result: r.result === "opened" ? { kind: "opened", printNo: r.print_no, released: r.released } : { kind: "denied", reason: r.deny_reason },
    }));
}

/** 최신 200줄(팬 선물·역조공 합쳐서). 읽지 못하면 오류 코드만 담아 던진다. */
export async function readAdminAccessLog(client: Pick<SupabaseClient, "rpc">): Promise<AdminAccessEntry[]> {
  const { data, error } = await client.rpc("admin_access_log");
  if (error) throw new Error(`내부 열람 기록을 읽지 못했다: ${error.code}`);
  return parseAdminAccessLogRows(data);
}
