import Link from "next/link";
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import type { MyAddressStatus } from "@/entities/address/api/my-address-status";
import type { DecidedRequestView } from "@/entities/order/model/decided-request";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import type { CreatorCheckView } from "@/entities/parcel/model/creator-check";
import { CreatorCheckList } from "@/features/creator-check/ui/creator-check-list";
import { ApprovalListWithAddress } from "./approval-list-with-address";
import { CreatorGiftTabs } from "./creator-gift-tabs";
import { PROMISE } from "@/shared/config/site-copy";
import s from "./approval-requests.module.css";

// 크리에이터 — 승인 요청. 탭: 승인 요청(한 건씩 보고 승인·거절, 전체 승인은 없다) · 확인할 선물(추적기 아님 블루투스·RF 상자를 받을지 —
// 답을 기다리는 상자가 있거나 그 탭으로 들어왔을 때만, 2026-10-12 (2) D3 ②). 받은 선물(상자·받았어요·답장)은 v18 시안대로 /creator/boxes 로 나눴다.
// 시안: docs/design/mockups/site/v18/creator-requests.html. 탭(확인할 선물 탭의 기억 INV-W4)은 그대로 — 받은 선물은 탭이 아니라 머리의 버튼으로 간다.
// 승인 대기·처리한 요청 구간은 id="wait"·id="done" — 사이드바 「승인 내역」이 /creator/requests#done 으로 온다.
// 헤더·푸터는 라우트(app)가 붙인다 — 위젯끼리는 서로 import 하지 않는다(FSD).
export function ApprovalRequestsPage({
  requests,
  decided,
  now,
  checks = [],
  initialTab = "requests",
  address,
  sealingKeyPem,
}: {
  requests: readonly ApprovalRequestView[];
  decided: readonly DecidedRequestView[];
  /** 남은 기간을 세는 기준 시각 — 화면을 그리는 서버가 넘긴다 */
  now: string;
  /** 답을 기다리는 확인할 선물(본인 것만, my_creator_checks) */
  checks?: readonly CreatorCheckView[];
  initialTab?: "requests" | "checks";
  /** 승인 전 주소 단계(INV-S13) — 로그인한 크리에이터 본인의 주소 상태. 주소 자체는 없다 */
  address: MyAddressStatus | null;
  /** 주소 봉인 공개키(PEM). 없으면 승인 창에서 주소를 입력할 수 없다 */
  sealingKeyPem: string | null;
}) {
  const showChecks = checks.length > 0 || initialTab === "checks";
  return (
    <div className={s.root}>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">
            승인·받은 선물<span className="ph-count">{requests.length}</span>
          </h1>
          <Link className="btn btn--sm" href="/creator/boxes">
            받은 선물 보기
          </Link>
        </div>
        <p className="ph-desc">팬이 보낸 선물을 받을지 정하고, 받은 선물에 답장을 남기는 곳이에요.</p>
      </header>

      <CreatorGiftTabs
        initial={initialTab}
        tabs={[
          {
            id: "requests",
            label: "승인 요청",
            count: requests.length,
            panel: (
              <div className={s.stack}>
                <section className={`card ${s.rule}`} aria-labelledby="rule-h">
                  <span className={s.icon} aria-hidden="true">
                    {/* lucide shield-check */}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </span>
                  <h2 className={s["rule-h"]} id="rule-h">
                    선물은 한 건씩, 카카오톡으로 승인해요.
                  </h2>
                  <p>
                    {PROMISE.address} {APPROVAL_DEADLINE_DAYS}일 안에 정하지 않으면 자동으로 받지 않음 처리돼요.
                  </p>
                </section>
                <ApprovalListWithAddress requests={requests} decided={decided} now={now} address={address} sealingKeyPem={sealingKeyPem} />
              </div>
            ),
          },
          ...(showChecks
            ? [{ id: "checks" as const, label: "확인할 선물", count: checks.length, panel: <CreatorCheckList checks={checks} now={now} /> }]
            : []),
        ]}
      />
    </div>
  );
}
