"use client";

import { useState } from "react";
import type { RevgiftShare } from "@/entities/parcel/model/office-lists";
import { TIER_LABEL } from "@/entities/parcel/model/office-labels";
import { canRefundShare } from "@/features/admin-refund/model/refund-access";
import { RefundButton } from "@/features/admin-refund/ui/refund-button";
import { formatMonthDay, formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";
import { countByShareTab, filterShares, SHARE_TABS, type ShareTab } from "../model/share-filter";

// 관리자 「역조공 처리」 (office-workflow INV-W3·W6, reverse-gift INV-R10·R11, 시안 admin/revgifts.html).
// 몫마다 팬의 답·받기 기한·입고. 환불은 팬이 받지 않은(거절·기한 지남) 몫에만, 대표에게만 버튼이 보인다(design-rules 8절).
// 금액은 몫 상태로 서버가 정한다 — 입력 칸이 없다. 반송은 출고 화면에서 QR 스캔으로만 한다(이 화면에 반송 버튼은 없다).

const REPLY_TAG: Record<RevgiftShare["reply"], { text: string; className: string }> = {
  waiting: { text: "기다리는 중", className: `${a.tag} ${a.tagWarn}` },
  accepted: { text: "받음", className: `${a.tag} ${a.tagBrand}` },
  declined: { text: "거절", className: a.tag },
  expired: { text: "기한 지남", className: `${a.tag} ${a.tagInk}` },
};

const REFUND_TAG: Record<NonNullable<RevgiftShare["refundStatus"]>, { text: string; className: string }> = {
  requesting: { text: "환불 처리 중", className: `${a.tag} ${a.tagWarn}` },
  done: { text: "환불 완료", className: `${a.tag} ${a.tagBrand}` },
  failed: { text: "환불 실패", className: `${a.tag} ${a.tagInk}` },
};

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

type Props = { rows: readonly RevgiftShare[]; access: "staff" | "owner" };

export function RevgiftsPanel({ rows, access }: Props) {
  const [tab, setTab] = useState<ShareTab>("all");
  const [query, setQuery] = useState("");
  const shown = filterShares(rows, tab, query);
  const counts = countByShareTab(rows);

  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1 id="revgifts-title" tabIndex={-1}>
            역조공 처리
          </h1>
          <p>크리에이터가 팬에게 보낸 선물의 몫별 상태예요. 몫마다 환불이나 반송을 따로 해요.</p>
        </div>
      </div>

      <div className={a.stack}>
        {access === "staff" && (
          <div className={a.note}>
            <InfoIcon />
            <p>
              <b>직원으로 보고 있어요.</b> 환불은 대표만 해요. 반송은 직원도 출고 화면에서 해요.
            </p>
          </div>
        )}

        <div className={a.toolbar}>
          <div className={a.tabs} role="group" aria-label="답으로 거르기">
            {SHARE_TABS.map((t) => (
              <button key={t.key} type="button" className={a.tab} aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label} <span className={a.tabN}>{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className={a.search}>
            <label className="sr-only" htmlFor="share-search">
              주문번호 또는 닉네임 검색
            </label>
            <SearchIcon />
            <input id="share-search" type="search" placeholder="주문번호 · 닉네임" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        <p className="sr-only" role="status">
          {shown.length}건
        </p>
        <div className={a.tblWrap}>
          <table className={a.tbl} style={{ minWidth: 980 }}>
            <caption className="sr-only">역조공 몫 목록</caption>
            <thead>
              <tr>
                <th scope="col">주문번호</th>
                <th scope="col">크리에이터</th>
                <th scope="col">팬</th>
                <th scope="col">구간</th>
                <th scope="col">팬의 답</th>
                <th scope="col">받기 기한</th>
                <th scope="col">입고</th>
                <th scope="col">환불</th>
                <th scope="col" className={a.stickyEnd}>
                  <span className="sr-only">처리</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={9} className={a.empty}>
                    {rows.length === 0 ? "아직 역조공 몫이 없어요." : "조건에 맞는 몫이 없어요."}
                  </td>
                </tr>
              ) : (
                shown.map((r) => {
                  const reply = REPLY_TAG[r.reply];
                  const refund = r.refundStatus ? REFUND_TAG[r.refundStatus] : null;
                  return (
                    <tr key={r.shareId}>
                      <td className={`${a.mono} ${a.nowrap}`}>
                        <strong>{r.orderNo}</strong>
                      </td>
                      <td>{r.creatorName}</td>
                      <td>{r.fanNickname}</td>
                      <td>{TIER_LABEL[r.tier]}</td>
                      <td>
                        <span className={reply.className}>{reply.text}</span>
                      </td>
                      <td className={`${a.mono} ${a.nowrap}`}>{formatMonthDay(r.deadlineAt)}</td>
                      <td className={`${a.mono} ${a.nowrap}`}>{r.receivedAt ? formatStamp(r.receivedAt) : <span className={a.faint}>미입고</span>}</td>
                      <td>{refund ? <span className={refund.className}>{refund.text}</span> : <span className={a.faint}>—</span>}</td>
                      <td className={`${a.act} ${a.stickyEnd}`}>
                        {canRefundShare(access, r) && (
                          <RefundButton
                            unitKind="revgift"
                            unitId={r.shareId}
                            orderNo={r.orderNo}
                            payerNickname={r.fanNickname}
                            payerLabel="팬"
                            amountKrw={null}
                            retry={r.refundStatus === "failed"}
                            returnFocusId="revgifts-title"
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
          환불은 팬이 받지 않은(거절·기한 지남) 몫에만 켜지고 대표만 해요. 받지 않은 몫의 상자는 출고 화면에서 QR 을 스캔하면 크리에이터 쪽 반송 송장이 나와요 — 이 화면에 반송 버튼은 없어요. 환불 금액은 몫의 상태로 서버가 정해요. 팬의 주소는 이 화면에 없어요.
        </p>
      </div>
    </>
  );
}
