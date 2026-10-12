import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseFanAccessLogRows, type FanAccessEntry } from "../model/fan-access-log";
import { parseReceivedRows, parseSentRows, type ReceivedRevgift, type SentRevgift } from "../model/revgift-rows";

// 역조공 읽기 — 로그인한 사람의 토큰으로 DB 읽기 함수를 부른다(누구 것인지는 DB 가 auth.uid() 로 정한다).

export async function readSentRevgifts(client: SupabaseClient): Promise<SentRevgift[]> {
  const { data, error } = await client.rpc("my_sent_revgifts");
  if (error) throw new Error(`보낸 역조공을 읽지 못했다: ${error.code}`);
  return parseSentRows(data);
}

export async function readReceivedRevgifts(client: SupabaseClient): Promise<ReceivedRevgift[]> {
  const { data, error } = await client.rpc("my_received_revgifts");
  if (error) throw new Error(`받은 역조공을 읽지 못했다: ${error.code}`);
  return parseReceivedRows(data);
}

/** 받기 화면용 — 로그인한 팬이 받는 몫 하나. 남의 몫·없는 번호는 null. */
export async function readReceivedRevgift(client: SupabaseClient, orderNo: string): Promise<ReceivedRevgift | null> {
  const { data, error } = await client.rpc("my_received_revgift", { p_order_no: orderNo });
  if (error) throw new Error(`받은 역조공을 읽지 못했다: ${error.code}`);
  return parseReceivedRows(data)[0] ?? null;
}

/**
 * INV-R16: 로그인한 팬이 받는 몫 하나의 주소 열람 기록(시각 역순). 누구 몫인지는 DB 가 로그인 토큰으로 판정한다 —
 * 남의 몫·없는 번호는 빈 목록. 읽지 못했거나 꼴이 다르면 null — 받기 화면 전체를 막지 않고 그 칸만 「불러오지 못했어요」로 둔다.
 */
export async function readMyRevgiftAccessLog(client: Pick<SupabaseClient, "rpc">, orderNo: string): Promise<FanAccessEntry[] | null> {
  const { data, error } = await client.rpc("my_revgift_access_log", { p_order_no: orderNo });
  // 서버 로그에는 코드·경로만 — 몫 번호·오류 메시지·받은 값은 남기지 않는다
  if (error) {
    console.error("my_revgift_access_log 읽기 실패:", error.code);
    return null;
  }
  return parseFanAccessLogRows(data, (issues) => {
    console.error("my_revgift_access_log 꼴 어긋남:", issues.map((i) => `${i.path || "(전체)"} ${i.code}`).join(", "));
  });
}

const followerRow = z.object({ fan_id: z.string().uuid(), nickname: z.string() }).strict();

export type RevgiftFollower = { fanId: string; nickname: string };

/**
 * INV-R2: 로그인한 크리에이터를 지금 팔로우하는 팬 목록(최근 팔로우 순). 누구의 팔로워인지는 DB 가 로그인 토큰으로 정한다 —
 * 크리에이터가 아니면 빈 목록. 한 줄에는 계정 ID 와 닉네임만 온다(그 밖의 칸이 오면 꼴 오류로 멈춘다).
 */
export async function readRevgiftFollowers(client: Pick<SupabaseClient, "rpc">): Promise<RevgiftFollower[]> {
  const { data, error } = await client.rpc("my_revgift_followers");
  if (error) throw new Error(`팔로워 목록을 읽지 못했다: ${error.code}`);
  return z
    .array(followerRow)
    .parse(data)
    .map((r) => ({ fanId: r.fan_id, nickname: r.nickname }));
}
