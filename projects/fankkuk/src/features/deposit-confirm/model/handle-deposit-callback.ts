import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { judgeDeposit } from "@/entities/payment/model/deposit";
import type { TossLookup } from "@/shared/api/toss-payments/client";
import type { JsonReply } from "@/shared/lib/http/private-json";
import type { DepositStore } from "../api/supabase-deposit-store";

// 토스 가상계좌 입금 알림(웹훅 DEPOSIT_CALLBACK) 처리 (payment INV-M22·M24).
// 본문(2026-10-15 공식 문서): createdAt·secret·status·transactionKey·orderId. secret 이 결제 승인 응답의 secret 과 같아야 정상 알림이다.
// 1) 본문의 orderId 로 우리 기록을 찾고, 본문 secret 의 해시를 승인 때 저장한 해시와 맞대어 본다 — 다르면 결제사 조회도 하지 않고 거부.
// 2) 결제사에 그 결제를 직접 조회한다. 본문의 status 는 쓰지 않는다 — 알림은 「지금 다시 조회하라」는 신호일 뿐이다.
// 3) 조회 결과로 판정(entities judgeDeposit)하고 DB 의 「입금 대기인 줄만 바꾸기」 함수로 반영한다 — 같은 알림이 여러 번 와도 한 번만 바뀐다.
// 처리에 실패하면(조회 실패·DB 오류) 200 을 돌려주지 않는다 — 토스가 1·4·16·64·256·1024·4096분 간격으로 다시 보낸다.
// 기한 지남 취소는 여기서 하지 않는다 — 결제사 취소까지 하는 예약 작업만(INV-M23).

export type DepositCallbackDeps = {
  store: DepositStore;
  lookup(orderId: string): Promise<TossLookup>;
  /** 결제 완료 반영(주문 등록·승인 요청·6자리) — 성공 주소의 확정과 같은 함수. 바꿨으면 true */
  settleDone(orderId: string, paymentKey: string): Promise<boolean>;
  now(): Date;
};

const bodyShape = z.object({
  orderId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  secret: z.string().min(1).max(100),
});

const sha256 = (v: string): Buffer => createHash("sha256").update(v, "utf8").digest();

/** 길이·내용에 따라 걸리는 시간이 달라지지 않게 해시끼리 비교한다. */
function sameSecret(storedSha256Hex: string, given: string): boolean {
  const stored = Buffer.from(storedSha256Hex, "hex");
  return stored.length === 32 && timingSafeEqual(stored, sha256(given));
}

const reply = (status: number, message: string): JsonReply => ({ status, body: { message } });

export async function handleDepositCallback(deps: DepositCallbackDeps, body: unknown): Promise<JsonReply> {
  const input = bodyShape.safeParse(body);
  if (!input.success) return reply(400, "bad_request");
  const { orderId, secret } = input.data;

  const record = await deps.store.find(orderId);
  // 기록이 없거나 비밀 값을 저장하지 않은 결제 — 승인 응답을 기록하기 전에 온 알림일 수 있어 200 이 아니다(다시 보내면 그때 본다)
  if (!record || record.secretSha256 === null) return reply(404, "not_found");
  if (!sameSecret(record.secretSha256, secret)) return reply(401, "secret_mismatch");

  const lookup = await deps.lookup(orderId);
  const decision = judgeDeposit(lookup, record, deps.now());
  switch (decision.kind) {
    case "error":
      return reply(503, "lookup_failed");
    case "done":
      await deps.settleDone(orderId, decision.paymentKey);
      break;
    case "close":
      await deps.store.close(orderId);
      break;
    case "reverted":
      await deps.store.markReverted(orderId);
      break;
    case "review":
      await deps.store.markReview(orderId);
      break;
    case "expire":
    case "keep":
      break;
  }
  return reply(200, "ok");
}
