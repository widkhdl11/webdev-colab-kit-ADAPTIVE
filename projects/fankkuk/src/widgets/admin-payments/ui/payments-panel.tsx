"use client";

import { useState } from "react";
import type { PaymentRow, RefundStatus } from "@/entities/payment/model/payment-rows";
import type { PendingBox } from "@/entities/payment/model/pending-boxes";
import { canRefund } from "@/features/admin-refund/model/refund-access";
import { RefundButton } from "@/features/admin-refund/ui/refund-button";
import { ReceivedCancelForm } from "@/features/admin-order-cancel/ui/received-cancel-form";
import { PendingBoxesSection } from "@/features/admin-pending-box/ui/pending-boxes-section";
import a from "@/shared/ui/admin.module.css";
import { countByTab, filterPayments, PAYMENT_TABS, REVIEW_NOTICE, type PaymentTab } from "../model/payment-filter";
import { splitRefundError } from "../model/refund-error-text";

// 관리자 「결제·환불」 본문 (admin-console INV-K1·K7·K8, 시안 admin/payments.html).
// 결제 금액은 네 칸으로 나눠 보인다. 환불 금액은 서버가 주문 상태로 정한 값이고 이 화면에서 바꿀 수 없다.
// 환불 버튼은 대표에게만 보인다(design-rules 8절) — 판정은 서버·DB 가 다시 한다. 사람은 닉네임으로만(INV-K8).
// 「입고 뒤 취소」 양식(payment INV-M17)도 대표에게만 — 표 아래에 둔다.
// 결제사 기록과 달라 확인 필요인 줄(payment INV-M19)은 환불 상태 칸에 그 표시를 단다 — 환불 버튼은 없다(결제가 끝나지 않았다, canRefund).
// 그 줄의 시각은 결제 시각이 아니라 승인을 시도한 시각이라 「(승인 시도)」를 붙인다.

const won = new Intl.NumberFormat("ko-KR");
const stamp = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "10-03 09:30" (서울 시각) */
function formatStamp(iso: string): string {
  const parts = stamp.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

const STATUS_TAG: Record<RefundStatus, { text: string; className: string } | null> = {
  none: null,
  due: { text: "환불 대기", className: a.tagWarn },
  requesting: { text: "처리 중", className: a.tagWarn },
  failed: { text: "환불 실패", className: a.tagInk },
  done: { text: "환불 완료", className: a.tagBrand },
};

const KIND_LABEL: Record<PaymentRow["paymentKind"], string | null> = { initial: null, difference: "차액", missing_box: "도착하지 않은 상자", late_box: "늦게 온 상자", revgift: "역조공" };

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.01" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

type Props = { rows: readonly PaymentRow[]; pendingBoxes: readonly PendingBox[]; access: "staff" | "owner" };

export function PaymentsPanel({ rows, pendingBoxes, access }: Props) {
  const [tab, setTab] = useState<PaymentTab>("all");
  const [query, setQuery] = useState("");
  const shown = filterPayments(rows, tab, query);
  const counts = countByTab(rows);

  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1 id="payments-title" tabIndex={-1}>
            결제·환불 내역
          </h1>
          <p>결제 금액은 네 칸으로 나뉘어 있어요. 환불 금액은 서버가 주문 상태로 정해서 이 화면에서 바꿀 수 없어요.</p>
        </div>
      </div>

      <div className={a.stack}>
        {access === "staff" && (
          <div className={a.note}>
            <InfoIcon />
            <p>
              <b>직원으로 보고 있어요.</b> 환불과 상자의 도착하지 않음 처리는 대표만 해요. 내역은 볼 수 있어요.
            </p>
          </div>
        )}

        <div className={a.toolbar}>
          <div className={a.tabs} role="group" aria-label="상태로 거르기">
            {PAYMENT_TABS.map((t) => (
              <button key={t.key} type="button" className={a.tab} aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label} <span className={a.tabN}>{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className={a.search}>
            <label className="sr-only" htmlFor="payment-search">
              주문번호 또는 닉네임 검색
            </label>
            <SearchIcon />
            <input id="payment-search" type="search" placeholder="주문번호 · 닉네임" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        <p className="sr-only" role="status">
          {shown.length}건
        </p>
        <div className={a.tblWrap}>
          <table className={a.tbl} style={{ minWidth: 1060 }}>
            <caption className="sr-only">결제 및 환불 내역</caption>
            <thead>
              <tr>
                <th scope="col">주문번호</th>
                <th scope="col">결제한 사람</th>
                <th scope="col" className={a.num}>
                  결제 금액
                </th>
                <th scope="col" className={a.num}>
                  상품 대금
                </th>
                <th scope="col" className={a.num}>
                  기본 서비스료
                </th>
                <th scope="col" className={a.num}>
                  검수비
                </th>
                <th scope="col" className={a.num}>
                  배송비
                </th>
                <th scope="col">환불 상태</th>
                <th scope="col" className={a.num}>
                  환불 금액
                </th>
                <th scope="col">결제 시각</th>
                <th scope="col" className={a.stickyEnd}>
                  <span className="sr-only">환불</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={11} className={a.empty}>
                    {rows.length === 0 ? "아직 결제 내역이 없어요." : "조건에 맞는 내역이 없어요."}
                  </td>
                </tr>
              ) : (
                shown.map((r) => {
                  const tag = STATUS_TAG[r.refund.status];
                  const kind = KIND_LABEL[r.paymentKind];
                  return (
                    <tr key={`${r.unitKind}-${r.unitId}`}>
                      <td className={`${a.mono} ${a.nowrap}`}>
                        <strong>{r.orderNo}</strong>
                        {kind && <span className={a.sub}> · {kind}</span>}
                      </td>
                      <td className={a.nowrap}>{r.payerNickname}</td>
                      <td className={`${a.num} ${a.mono}`}>
                        <b>{won.format(r.amountKrw)}</b>
                      </td>
                      <td className={`${a.num} ${a.mono}`}>{won.format(r.goodsKrw)}</td>
                      <td className={`${a.num} ${a.mono}`}>{won.format(r.serviceFeeKrw)}</td>
                      <td className={`${a.num} ${a.mono}`}>{won.format(r.inspectionFeeKrw)}</td>
                      <td className={`${a.num} ${a.mono}`}>{won.format(r.shippingFeeKrw)}</td>
                      <td>
                        {r.needsReview ? (
                          <span className={`${a.tag} ${a.tagWarn}`}>{REVIEW_NOTICE}</span>
                        ) : tag ? (
                          <span className={`${a.tag} ${tag.className}`}>{tag.text}</span>
                        ) : (
                          <span className={a.faint}>—</span>
                        )}
                        {r.refund.status === "failed" && r.refund.error && (
                          <RefundErrorText raw={r.refund.error} />
                        )}
                      </td>
                      <td className={`${a.num} ${a.mono}`}>{r.refund.amountKrw === null ? "—" : `${won.format(r.refund.amountKrw)}원`}</td>
                      <td className={`${a.mono} ${a.nowrap}`}>
                        {formatStamp(r.paidAt)}
                        {r.needsReview && <span className={a.sub}> (승인 시도)</span>}
                      </td>
                      <td className={`${a.act} ${a.stickyEnd}`}>
                        {canRefund(access, r.refund.status, r.needsReview) && r.refund.amountKrw !== null && (
                          <RefundButton
                            unitKind={r.unitKind}
                            unitId={r.unitId}
                            orderNo={r.orderNo}
                            payerNickname={r.payerNickname}
                            amountKrw={r.refund.amountKrw}
                            retry={r.refund.status === "failed"}
                            returnFocusId="payments-title"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className={a.hint}>
          네 칸을 더하면 결제 금액이에요. 역조공은 받는 팬 한 명 몫이 한 줄이고 검수비가 없어요. 요금표를 바꿔도 이미 결제한 주문의 칸은 그대로예요. 확인 필요 줄은 결제가 끝나지 않아 여기서 환불할 수 없어요. 결제사 관리 화면에서 처리해요.
        </p>
        <PendingBoxesSection boxes={pendingBoxes} access={access} />
        {access === "owner" && <ReceivedCancelForm />}
      </div>
    </>
  );
}

// 결제사 답은 사람 말을 먼저, 코드는 결제사 문의용으로 뒤에 흐리게
function RefundErrorText({ raw }: { raw: string }) {
  const { message, code } = splitRefundError(raw);
  return (
    <span className={a.sub} style={{ display: "block", fontSize: 13, marginTop: 2 }}>
      {message}
      {code && <span className={a.faint}> · 결제사 코드 {code}</span>}
    </span>
  );
}
