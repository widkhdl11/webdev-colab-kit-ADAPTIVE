"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { KIND_LABEL, NEXT_STEP_TEXT, STATE_LABEL, TIER_LABEL, type StateTone } from "@/entities/parcel/model/office-labels";
import type { OfficeParcel } from "@/entities/parcel/model/office-parcel";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";
import { countByParcelTab, filterParcels, PARCEL_TABS, type ParcelFilterTab } from "../model/parcel-filter";

// 관리자 「들어온 상자」 (office-workflow INV-W1·W7, design-rules 8절, 시안 admin/parcels.html).
// 상태를 바꾸는 버튼은 없다 — 「다음 단계」 칸에 어느 작업 화면에서 무엇을 스캔하면 되는지만 쓴다(INV-W1).
// 사람은 닉네임·크리에이터 이름으로만, 주소·전화 칸은 없다(INV-W7).

const TONE_CLASS: Record<StateTone, string> = { plain: a.tag, warn: `${a.tag} ${a.tagWarn}`, brand: `${a.tag} ${a.tagBrand}`, ink: `${a.tag} ${a.tagInk}` };

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

const WORK_PAGE: Partial<Record<OfficeParcel["nextStep"], string>> = {
  confirm_label: "/admin/work/inbound",
  inspect: "/admin/work/inspect",
  print_label: "/admin/work/outbound",
  print_return: "/admin/work/outbound",
  confirm_return: "/admin/work/outbound",
  confirm_shipment: "/admin/work/outbound",
  on_hold: "/admin/unmatched",
};

function NextStepCell({ parcel }: { parcel: OfficeParcel }) {
  const text = NEXT_STEP_TEXT[parcel.nextStep];
  if (!text) return null;
  const href = WORK_PAGE[parcel.nextStep];
  const envelope = (parcel.nextStep === "print_return" || parcel.nextStep === "confirm_return") && parcel.qr ? `봉투 ${parcel.qr} · ` : "";
  return (
    <>
      {envelope}
      {href ? (
        <Link className={a.link} href={href}>
          {text}
        </Link>
      ) : (
        text
      )}
    </>
  );
}

/** top = 목록 위에 붙일 구간(크리에이터가 고른 블루투스 상자의 운영자 처리 — office-workflow INV-W13). 라우트가 조립해 넘긴다 */
export function ParcelsPanel({ rows, top }: { rows: readonly OfficeParcel[]; top?: ReactNode }) {
  const [tab, setTab] = useState<ParcelFilterTab>("all");
  const [query, setQuery] = useState("");
  const shown = filterParcels(rows, tab, query);
  const counts = countByParcelTab(rows);

  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>들어온 상자</h1>
          <p>이름·주소·전화는 이 화면에 없어요. 닉네임과 주문번호로만 찾아요.</p>
        </div>
      </div>

      <div className={a.stack}>
        {top}
        <div className={a.toolbar}>
          <div className={a.tabs} role="group" aria-label="상태로 거르기">
            {PARCEL_TABS.map((t) => (
              <button key={t.key} type="button" className={a.tab} aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label} <span className={a.tabN}>{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className={a.search}>
            <label className="sr-only" htmlFor="parcel-search">
              주문번호 또는 닉네임 검색
            </label>
            <SearchIcon />
            <input id="parcel-search" type="search" placeholder="주문번호 · 닉네임 검색" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        <p className="sr-only" role="status">
          {shown.length}건
        </p>
        <div className={a.tblWrap}>
          <table className={a.tbl} style={{ minWidth: 880 }}>
            <caption className="sr-only">들어온 상자 목록</caption>
            <thead>
              <tr>
                <th scope="col">주문번호</th>
                <th scope="col">종류</th>
                <th scope="col">보낸 사람</th>
                <th scope="col">받는 사람</th>
                <th scope="col">구간</th>
                <th scope="col">상태</th>
                <th scope="col">입고 시각</th>
                <th scope="col">다음 단계</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={8} className={a.empty}>
                    {rows.length === 0 ? "아직 들어온 상자가 없어요." : "조건에 맞는 상자가 없어요."}
                  </td>
                </tr>
              ) : (
                shown.map((r) => {
                  const state = STATE_LABEL[r.state];
                  return (
                    <tr key={`${r.kind}-${r.orderNo}-${r.qr ?? ""}`}>
                      <td className={`${a.mono} ${a.nowrap}`}>
                        <strong>{r.orderNo}</strong>
                      </td>
                      <td>
                        <span className={r.kind === "revgift" ? `${a.tag} ${a.tagBrand}` : a.tag}>{KIND_LABEL[r.kind]}</span>
                      </td>
                      <td>{r.senderNickname}</td>
                      <td>{r.receiverName}</td>
                      <td>{TIER_LABEL[r.tier]}</td>
                      <td>
                        <span className={TONE_CLASS[state.tone]}>{state.text}</span>
                      </td>
                      <td className={`${a.mono} ${a.nowrap}`}>{r.receivedAt ? formatStamp(r.receivedAt) : "—"}</td>
                      <td className={a.sub}>
                        <NextStepCell parcel={r} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className={a.hint}>
          구간은 크기와 무게 중 큰 쪽으로 정해요. 대형을 넘는 상자는 검수에서 반송해요. 상자 상태는 입고·검수·출고 화면에서 스캔할 때만 바뀌어요 — 이 목록에는 상태를 바꾸는 버튼이 없어요. 원래 송장은 상자의 QR 번호가 적힌 봉투에 따로 보관하고, 반송·출고가 끝나면 파쇄해요.
        </p>
      </div>
    </>
  );
}
