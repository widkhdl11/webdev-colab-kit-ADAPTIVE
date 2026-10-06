import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import type { DispatchResult } from "./dispatch-notifications";

// 알림 지금 보내기 (notifications INV-N5). 운영자(대표·직원) 누구나. 정해진 시각마다 부르는 장치는 배포 방식과 함께 정한다(스펙 비범위).
// 운영자 판정은 로그인한 사람의 세션 클라이언트로 한다. 일꾼은 앱 서버 키로 돌지만, 받는 사람·통로를 고르는 칸은 받지 않는다(INV-N3) —
// 무엇을 누구에게 보낼지는 발송 대기 줄이 이미 정했다.

const FAILED = "알림을 보내지 못했어요. 잠시 뒤 다시 해 주세요.";
const CONFIG = "알림 발송 설정이 빠져 있어요. 서버 설정을 확인해 주세요.";

const bodyShape = z.object({}).strict();

export async function runDispatch(session: Pick<SupabaseClient, "rpc">, body: unknown, dispatch: () => Promise<DispatchResult>): Promise<JsonReply> {
  if ((await readAdminAccess(session)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  if (!bodyShape.safeParse(body).success) return { status: 400, body: { message: "요청 꼴이 맞지 않아요." } };
  const result = await dispatch();
  if (!result.ok) return { status: 500, body: { message: result.reason === "config" ? CONFIG : FAILED } };
  return { status: 200, body: { counts: result.counts } };
}
