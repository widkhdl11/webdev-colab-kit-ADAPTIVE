import { z } from "zod";
import { ACCESS_DENY_REASONS, type AccessDenyReason } from "@/entities/address/model/access-log";
import { readOpenedFanAddress, type FanAddressLabel } from "@/entities/address/model/fan-address-plaintext";
import { surchargeRegionOf } from "@/entities/address/model/surcharge-region";
import { openEnvelope, parseEnvelope } from "@/shared/lib/envelope/envelope";
import type { CreatorLabelDeps } from "./print-creator-label";

// 선물함 송장 출력 — 신청 한 줄의 팬 주소를 여는 서버 코드(revgift-box INV-GB20). 순서는 역조공 송장 출력(print-share-label)과 같다:
//   로그인 토큰 검증 → (d) 대표인가 — 아니면 거부 줄 → DB 가 선물함·신청을 잠근 자리에서 (a)(c)·상한을 보고 「연 줄」을 남기며 봉인을 내줌
//   → 봉투 열기 → (b) 봉인 속 계정이 그 신청의 팬인가 → 출력 마무리(송장 출력함) → 연 우편번호로 할증 구분을 다시 정해 DB 에 넘김(INV-GB17).
//   봉투를 연 뒤 송장이 나오기 전에 실패하면 그 「연 줄」을 돌려받는다(reverse-gift INV-R13 과 같은 규칙 — 조건은 DB 가 잠근 자리에서 본다).
// DB 자격은 복호화 전용 역할(address_decryptor). 평문은 이 호출 안에서만 쓰고 라벨 다섯 칸만 돌려준다 — 로그·오류·기록 줄에 넣지 않는다.
// 바코드는 신청 번호(GB + 숫자)다 — 사무실 상자 QR(Q-…)이 아니다. 송장 출력 함수 묶음은 이 꼴을 보고 이리로 보낸다(invoice-decryptor).

export const BOX_LABEL_PATTERN = /^GB[0-9]{8,12}$/;

export type BoxLabelDeps = Omit<CreatorLabelDeps, "acceptedMethod">;

export type BoxLabelResult =
  | { kind: "printed"; waybill: string | null; reprint: boolean; label: FanAddressLabel }
  | { kind: "denied"; reason: AccessDenyReason }
  | { kind: "unauthenticated" }
  | { kind: "not_found" }
  | { kind: "failed" };

const claimShape = z.union([
  z.object({
    result: z.literal("opened"),
    print_no: z.number().int().min(1),
    log_id: z.number().int().positive(),
    label: z.string().regex(BOX_LABEL_PATTERN),
    fan_id: z.string().uuid(),
    printed: z.boolean(),
    envelope: z.unknown(),
  }),
  z.object({ result: z.literal("denied"), reason: z.enum(ACCESS_DENY_REASONS) }),
]);
const finishShape = z.object({ waybill: z.string().min(1).nullable(), first: z.boolean() });

async function logDenied(deps: BoxLabelDeps, label: string, requesterId: string, reason: AccessDenyReason): Promise<void> {
  const { error } = await deps.db.rpc("revgift_box_log_denied", { p_label: label, p_requester: requesterId, p_reason: reason });
  if (error) throw new Error("열람 기록을 남기지 못했다");
}

/** 연 뒤 송장이 나오기 전에 실패했다 — 그 「연 줄」을 돌려받는다. 결과는 보지 않는다(거부여도 이 출력은 실패 그대로). */
async function releaseOpened(deps: BoxLabelDeps, logId: number, requesterId: string): Promise<BoxLabelResult> {
  await deps.db.rpc("revgift_box_release_print", { p_log_id: logId, p_requester: requesterId });
  return { kind: "failed" };
}

export async function printBoxLabel(deps: BoxLabelDeps, input: { qr: string; accessToken: string }): Promise<BoxLabelResult> {
  if (!BOX_LABEL_PATTERN.test(input.qr)) return { kind: "not_found" };
  // 로그인 토큰은 이 함수가 스스로 검증한다. 못 믿으면 DB 도 부르지 않는다(기록 줄의 요청자를 정할 수 없다).
  const requesterId = input.accessToken === "" ? null : await deps.verifyRequester(input.accessToken);
  if (!requesterId) return { kind: "unauthenticated" };

  // (d) 대표 계정만 — 판단 근거는 이 함수 설정의 대표 ID 하나(address-protection INV-P8). 거부 줄은 운영자 내부 기록에 남는다
  if (deps.ownerUserId === "" || requesterId !== deps.ownerUserId) {
    const logged = await deps.db.rpc("revgift_box_log_denied", { p_label: input.qr, p_requester: requesterId, p_reason: "not_owner" });
    if (logged.error) return logged.error.code === "P0002" ? { kind: "not_found" } : { kind: "failed" };
    return { kind: "denied", reason: "not_owner" };
  }

  const claimReply = await deps.db.rpc("revgift_box_claim_print", { p_label: input.qr, p_requester: requesterId });
  if (claimReply.error) return claimReply.error.code === "P0002" ? { kind: "not_found" } : { kind: "failed" };
  const claim = claimShape.safeParse(claimReply.data);
  if (!claim.success) return { kind: "failed" };
  if (claim.data.result === "denied") return { kind: "denied", reason: claim.data.reason };

  const logId = claim.data.log_id;
  const envelope = parseEnvelope(claim.data.envelope);
  if (!envelope) return releaseOpened(deps, logId, requesterId);
  let plaintext: string;
  try {
    const dek = await deps.unwrapper.unwrap(envelope.wrappedKey);
    try {
      plaintext = await openEnvelope(envelope, dek);
    } finally {
      dek.fill(0);
    }
  } catch {
    return releaseOpened(deps, logId, requesterId);
  }

  // (b) 봉인 속 계정이 잠근 자리의 신청 팬과 다르면(다른 신청의 사본을 옮겨 붙임) 쓰지 않는다 — 송장은 안 나왔으니 연 줄을 돌려받고 거부 줄을 남긴다
  const opened = readOpenedFanAddress(plaintext);
  if (!opened || opened.accountId !== claim.data.fan_id) {
    await deps.db.rpc("revgift_box_release_print", { p_log_id: logId, p_requester: requesterId });
    await logDenied(deps, input.qr, requesterId, "order_mismatch");
    return { kind: "denied", reason: "order_mismatch" };
  }

  // 첫 출력이면 송장 출력 방식대로 받은 번호(수동 입력이면 null)로 송장 출력함, 다시 출력이면 DB 가 처음 번호를 돌려준다
  const finish = await deps.db.rpc("revgift_box_finish_print", { p_label: input.qr, p_waybill: claim.data.printed ? null : deps.newWaybill() });
  if (finish.error) return releaseOpened(deps, logId, requesterId);
  const finished = finishShape.safeParse(finish.data);
  if (!finished.success) return releaseOpened(deps, logId, requesterId);

  // INV-GB17 · address-protection INV-P20 ③: 연 우편번호로 다시 정한 구분만 넘긴다. 출력은 끝났으므로 실패해도 결과를 바꾸지 않는다
  const region = surchargeRegionOf(opened.label.zipCode);
  if (region !== null) {
    try {
      await deps.db.rpc("revgift_box_report_region", { p_label: input.qr, p_opened_region: region });
    } catch {
      // 출력 결과에 영향 없음
    }
  }
  return { kind: "printed", waybill: finished.data.waybill, reprint: !finished.data.first, label: opened.label };
}
