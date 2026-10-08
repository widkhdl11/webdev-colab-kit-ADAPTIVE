"use client";

import { useState } from "react";
import type { PaymentRow, RefundStatus } from "@/entities/payment/model/payment-rows";
import { canRefund } from "@/features/admin-refund/model/refund-access";
import { RefundButton } from "@/features/admin-refund/ui/refund-button";
import a from "@/shared/ui/admin.module.css";
import { countByTab, filterPayments, PAYMENT_TABS, type PaymentTab } from "../model/payment-filter";

// 관리자 「결제·환불」 본문 (admin-console INV-K1·K7·K8, 시안 admin/payments.html).
// 결제 금액은 네 칸으로 나눠 보인다. 환불 금액은 서버가 주문 상태로 정한 값이고 이 화면에서 바꿀 수 없다.
// 환불 버튼은 대표에게만 보인다(design-rules 8절) — 판정은 서버·DB 가 다시 한다. 사람은 닉네임으로만(INV-K8).

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

const KIND_LABEL: Record<PaymentRow["paymentKind"], string | null> = { initial: null, difference: "차액", missing_box: "도착하지 않은 상자", revgift: "역조공" };

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

type Props = { rows: readonly PaymentRow[]; access: "staff" | "owner" };

export function PaymentsPanel({ rows, access }: Props) {
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
              <b>직원으로 보고 있어요.</b> 환불은 대표만 실행해요. 내역은 볼 수 있어요.
            </p>
          </div>
        )}

        <div className={a.toolbar}>
          <div className={a.tabs} role="group" aria-label="환불 상태로 거르기">
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
                      <td>{r.payerNickname}</td>
                      <td className={`${a.num} ${a.mono}`}>
                        <b>{won.format(r.amountKrw)}</b>
                      </td>
                      <td className={`${a.num} ${a.mono}`}>{won.format(r.goodsKrw)}</td>
                      <td className={`${a.num} ${a.mono}`}>{won.format(r.serviceFeeKrw)}</td>
                      <td className={`${a.num} ${a.mono}`}>{won.format(r.inspectionFeeKrw)}</td>
                      <td className={`${a.num} ${a.mono}`}>{won.format(r.shippingFeeKrw)}</td>
                      <td>
                        {tag ? <span className={`${a.tag} ${tag.className}`}>{tag.text}</span> : <span className={a.faint}>—</span>}
                        {r.refund.status === "failed" && r.refund.error && (
                          <span className={a.sub} style={{ display: "block", fontSize: 13, marginTop: 2 }}>
                            {r.refund.error}
                          </span>
                        )}
                      </td>
                      <td className={`${a.num} ${a.mono}`}>{r.refund.amountKrw === null ? "—" : `${won.format(r.refund.amountKrw)}원`}</td>
                      <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(r.paidAt)}</td>
                      <td className={`${a.act} ${a.stickyEnd}`}>
                        {canRefund(access, r.refund.status) && r.refund.amountKrw !== null && (
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
          네 칸을 더하면 결제 금액이에요. 역조공은 받는 팬 한 명 몫이 한 줄이고 검수비가 없어요. 요금표를 바꿔도 이미 결제한 주문의 칸은 그대로예요.
        </p>
      </div>
    </>
  );
}
