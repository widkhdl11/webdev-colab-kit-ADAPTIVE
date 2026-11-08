"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { giftDetailHref } from "@/entities/action-item/model/action-items";
import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import type { FanAccessEntry } from "@/entities/revgift/model/fan-access-log";
import type { ReceivedRevgift } from "@/entities/revgift/model/revgift-rows";
import { daysLeft, receivedStage } from "@/entities/revgift/model/received-stage";
import { replyDeadlineText } from "@/entities/revgift/ui/received-status";
import { FanAddressFields } from "@/entities/address/ui/fan-address-fields";
import { ReceiveFlow } from "@/features/revgift-receive/ui/receive-flow";
import { ADDRESS_KEY_MISSING_TEXT } from "@/shared/ui/sealed-address-form";
import { RevgiftAccessLog } from "./revgift-access-log";
import s from "./revgift-receive.module.css";

// 받은 역조공 하나(팬) — 선물 상세 `/gifts/RG-…`(action-center INV-J12). 시안: docs/design/mockups/site/v35-part1/revgift-detail.html (좁은 틀 800, design-rules 22절)
// todo: 이 몫이 처리할 일 읽기 결과에 있다 — 그때만 맨 위 칸(#todo)에서 받기·받지 않기·주소 입력을 한다(INV-J13).
// 남은 날·기한 문구는 서버에서 한 번 계산해 넘긴다 — 브라우저 시계로 다시 계산하면 첫 화면과 글자가 달라질 수 있다.
// accessLog: 이 몫의 내 주소 열람 기록(INV-R16). null 이면 읽지 못한 것 — 그 칸만 안내로 바뀐다.
// 받기 판의 주소 칸은 팬 주소 입력 칸(entities/address)을 붙이고, 보내는 일(봉인한 주소로 받기)은 받기 기능이 정한다(reverse-gift INV-R4).
// 봉인 속 식별값은 로그인한 팬의 계정(reverse-gift INV-R5, address-protection INV-P17). 팬 등록 주소는 없다(2026-11-08).
export function RevgiftReceivePage({
  item,
  nowMs,
  accountId,
  sealingKeyPem,
  accessLog,
  todo,
}: {
  item: ReceivedRevgift;
  todo: boolean;
  nowMs: number;
  /** 로그인한 팬의 계정 ID — 받을 주소를 봉인할 때 묶는다 */
  accountId: string;
  sealingKeyPem: string | null;
  accessLog: readonly FanAccessEntry[] | null;
}) {
  const router = useRouter();
  const tierRule = PARCEL_TIER_GUIDE[item.tier].rule;
  const stage = receivedStage(item, nowMs);
  return (
    <main id="main" className={`page-centered v34 ${s.page}`}>
      <div>
        <div className={s.col}>
          <Link className={s.back} href="/me/revgifts">
            ‹ 받은 선물로
          </Link>
          {/* key: 새로 읽은 상태가 달라지면(이미 정해졌다는 응답 뒤 새로고침) 화면 상태를 처음부터 다시 잡는다 */}
          <ReceiveFlow
            key={stage}
            orderNo={item.orderNo}
            creatorName={item.creatorName}
            tierName={PARCEL_TIER_GUIDE[item.tier].name}
            tierRule={tierRule}
            stage={stage}
            daysLeftText={`${daysLeft(item.deadline, nowMs)}일 남음`}
            deadlineText={replyDeadlineText(item.deadline)}
            todo={todo}
            address={{
              canEnter: sealingKeyPem !== null,
              missingKeyText: ADDRESS_KEY_MISSING_TEXT,
              renderForm: (p) =>
                sealingKeyPem ? (
                  <FanAddressFields
                    idPrefix="rv"
                    accountId={accountId}
                    sealingKeyPem={sealingKeyPem}
                    send={(envelope) => p.send(envelope)}
                    onSaved={p.onDone}
                    onCancel={p.onCancel}
                    submitContent={(busy) => (busy ? "보내는 중…" : "받기")}
                    onLoginExpired={() => router.push(`/login?next=${encodeURIComponent(giftDetailHref(item.orderNo))}`)}
                  />
                ) : null,
            }}
          >
            <RevgiftAccessLog entries={accessLog} finished={stage !== "waiting" && stage !== "accepted"} />
          </ReceiveFlow>
        </div>
      </div>
    </main>
  );
}
