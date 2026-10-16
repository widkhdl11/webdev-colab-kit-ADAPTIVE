"use client";

import { useRouter } from "next/navigation";
import type { MyFanAddressStatus } from "@/entities/address/api/my-fan-address-status";
import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import type { FanAccessEntry } from "@/entities/revgift/model/fan-access-log";
import type { ReceivedRevgift } from "@/entities/revgift/model/revgift-rows";
import { daysLeft, receivedStage } from "@/entities/revgift/model/received-stage";
import { replyDeadlineText } from "@/entities/revgift/ui/received-status";
import { FanAddressForm } from "@/features/fan-address/ui/fan-address-form";
import { ReceiveFlow } from "@/features/revgift-receive/ui/receive-flow";
import { ADDRESS_KEY_MISSING_TEXT } from "@/shared/ui/sealed-address-form";
import { RevgiftAccessLog } from "./revgift-access-log";
import s from "./revgift-receive.module.css";

// 받은 역조공 하나(팬). 시안: docs/design/mockups/site/v18/revgift-receive.html (가운데 틀 안 한 기둥 720)
// 남은 날·기한 문구는 서버에서 한 번 계산해 넘긴다 — 브라우저 시계로 다시 계산하면 첫 화면과 글자가 달라질 수 있다.
// accessLog: 이 몫의 내 주소 열람 기록(INV-R16). null 이면 읽지 못한 것 — 그 칸만 안내로 바뀐다.
// 받기 판의 주소 칸은 받을 주소 기능(features/fan-address)의 입력 칸을 붙인다 — 받기 기능과 주소 기능은 서로 import 하지 않는다(FSD).
// 봉인 속 식별값은 로그인한 팬의 계정(reverse-gift INV-R5, address-protection INV-P17).
export function RevgiftReceivePage({
  item,
  nowMs,
  accountId,
  address,
  sealingKeyPem,
  accessLog,
}: {
  item: ReceivedRevgift;
  nowMs: number;
  /** 로그인한 팬의 계정 ID — 받을 주소를 봉인할 때 묶는다 */
  accountId: string;
  /** 로그인한 팬의 받을 주소 상태. 읽지 못했으면 null */
  address: MyFanAddressStatus | null;
  sealingKeyPem: string | null;
  accessLog: readonly FanAccessEntry[] | null;
}) {
  const router = useRouter();
  const tierRule = PARCEL_TIER_GUIDE[item.tier].rule;
  const stage = receivedStage(item, nowMs);
  return (
    <main id="main" className={`page-centered ${s.page}`}>
      <div>
        <div className={s.col}>
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
            address={{
              status: address,
              canEnter: sealingKeyPem !== null,
              missingKeyText: ADDRESS_KEY_MISSING_TEXT,
              renderForm: (p) =>
                sealingKeyPem ? (
                  <FanAddressForm
                    accountId={accountId}
                    sealingKeyPem={sealingKeyPem}
                    initialLabel={p.initialLabel}
                    autoFocusFirst={p.autoFocusFirst}
                    onSaved={p.onSaved}
                    onCancel={p.onCancel}
                    onLoginExpired={() => router.push(`/login?next=${encodeURIComponent(`/me/revgifts/${item.orderNo}`)}`)}
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
