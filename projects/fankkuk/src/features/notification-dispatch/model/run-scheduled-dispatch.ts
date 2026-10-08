import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { JsonReply } from "@/shared/lib/http/private-json";
import type { DispatchResult } from "./dispatch-notifications";

// 예약 발송 입구 (notifications INV-N16). DB 예약 작업이 5분마다 부르고, 운영자의 「알림 지금 보내기」와 같은 일꾼을 한 번 돌린다.
// 로그인 대신 서버 설정의 비밀 값이 「Authorization: Bearer <값>」으로 같이 와야 일한다.
// - 서버에 비밀 값이 없거나 32자보다 짧으면 없는 주소처럼 404 — 설정을 빠뜨린 배포에서 아무나 일꾼을 돌리지 못하게.
// - 비교는 길이·내용에 따라 걸리는 시간이 달라지지 않게(값을 한 글자씩 짐작하지 못하게) 해시를 같은 길이로 맞춰 비교한다.
// - 본문 칸은 받지 않는다 — 무엇을 누구에게 보낼지는 발송 대기 줄이 이미 정했다(INV-N3).

export const SCHEDULE_SECRET_MIN = 32;

const bodyShape = z.object({}).strict();

type Input = { secret: string | undefined; authorization: string | null; body: unknown };

const digest = (v: string): Buffer => createHash("sha256").update(v, "utf8").digest();

function sameSecret(expected: string, authorization: string | null): boolean {
  const m = /^Bearer (.+)$/.exec(authorization ?? "");
  // 머리가 없거나 꼴이 달라도 같은 계산을 한 번 한다
  const given = m?.[1] ?? "";
  const equal = timingSafeEqual(digest(expected), digest(given));
  return m !== null && equal;
}

export async function runScheduledDispatch(input: Input, dispatch: () => Promise<DispatchResult>): Promise<JsonReply> {
  if (!input.secret || input.secret.length < SCHEDULE_SECRET_MIN) return { status: 404, body: { message: "찾을 수 없어요." } };
  if (!sameSecret(input.secret, input.authorization)) return { status: 401, body: { message: "인증이 필요해요." } };
  if (!bodyShape.safeParse(input.body).success) return { status: 400, body: { message: "요청 꼴이 맞지 않아요." } };
  const result = await dispatch();
  if (!result.ok) return { status: 500, body: { message: "알림을 보내지 못했어요.", counts: result.counts } };
  return { status: 200, body: { counts: result.counts } };
}
