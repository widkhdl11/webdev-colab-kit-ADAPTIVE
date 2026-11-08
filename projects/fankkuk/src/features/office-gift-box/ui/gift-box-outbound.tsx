"use client";

import { useCallback, useEffect, useState } from "react";
import { postOffice } from "@/entities/parcel/api/post-office-client";
import { formatWaybill } from "@/entities/parcel/model/waybill-no";
import { APPLICATION_STATUS_OFFICE_NAME, BOX_STATUS_NAME, type ApplicationStatus, type BoxStatus } from "@/entities/revgift-box/model/box-status";
import { TIER_NAME, type InvoiceTier } from "@/entities/revgift-box/model/box-tiers";
import { formatDateTime } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";
import type { ShipGiftBoxWrite } from "../model/ship-gift-box";

// 선물함 출고·반송 작업 화면 (revgift-box INV-GB19·GB20).
// ① 출고: 선물의 바코드(신청 번호)를 스캔해 불러오고 → 송장 출력(대표만, 주소 열기 1회) → (수동 입력이면) 운송장 번호 → 송장 바코드 스캔으로 출고 확정.
//    결제가 끝난 신청만 출력된다. 주소는 출력한 그 응답에만 있고 다시 불러와도 나오지 않는다.
// ② 착불 반송: 결제가 없어 반송 중인 선물함 — 큰 상자 원 송장번호(그 송장의 보내는 사람 주소로 착불 반송) · 반송 송장번호를 넣어 반송됨.

type Application = {
  label: string;
  nickname: string;
  boxName: string;
  boxStatus: BoxStatus;
  status: ApplicationStatus;
  printed: boolean;
  waybill: string | null;
  shipped: boolean;
  regionMismatch: boolean;
  tier: InvoiceTier | null;
};
type LabelFields = { recipientName: string; phone: string; zipCode: string; address1: string; address2: string };
type ReturnBox = { id: string; name: string; creatorName: string; returningAt: string | null; cartonWaybills: string[] };

const post = (w: ShipGiftBoxWrite) => postOffice("/api/admin/work/gift-boxes/outbound", w);

function OutboundCard() {
  const [code, setCode] = useState("");
  const [app, setApp] = useState<Application | null>(null);
  const [opened, setOpened] = useState<LabelFields | null>(null);
  const [waybill, setWaybill] = useState("");
  const [scan, setScan] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async (label: string) => {
    const r = await post({ kind: "lookup", label });
    if (r.kind === "failed") {
      setApp(null);
      setMsg({ ok: false, text: r.message });
      return null;
    }
    const next = r.body.application as Application;
    setApp(next);
    return next;
  };
  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setOpened(null);
    await load(code);
  };
  const run = async (w: ShipGiftBoxWrite, ok: string) => {
    if (!app) return;
    setBusy(true);
    setMsg(null);
    const r = await post(w);
    setBusy(false);
    if (r.kind === "failed") return setMsg({ ok: false, text: r.message });
    if (w.kind === "print") setOpened((r.body.label as LabelFields) ?? null);
    setMsg({ ok: true, text: ok });
    await load(app.label);
  };

  return (
    <section className={`${a.card} ${a.stack}`} aria-labelledby="gb-out">
      <h2 className={a.sectionH} id="gb-out">
        출고
      </h2>
      <form className={a.toolbar} onSubmit={lookup}>
        <label className={a.field}>
          <span>선물 바코드</span>
          <input className={`${a.input} ${a.mono}`} value={code} maxLength={20} required onChange={(e) => setCode(e.target.value)} />
        </label>
        <button className={`${a.btn} ${a.btnLine}`} type="submit">
          불러오기
        </button>
      </form>
      {app ? (
        <>
          <p className={a.sub}>
            {app.boxName} · {BOX_STATUS_NAME[app.boxStatus]} · {app.nickname} · {APPLICATION_STATUS_OFFICE_NAME[app.status]}
            {app.tier ? ` · ${TIER_NAME[app.tier]}` : ""}
          </p>
          {app.regionMismatch ? <p className={a.errorLine}>할증 지역 불일치</p> : null}
          {opened ? (
            <dl className={a.stack}>
              <div>
                <dt>받는 사람</dt>
                <dd>{opened.recipientName}</dd>
              </div>
              <div>
                <dt>휴대폰 번호</dt>
                <dd className={a.mono}>{opened.phone}</dd>
              </div>
              <div>
                <dt>주소</dt>
                <dd>
                  ({opened.zipCode}) {opened.address1} {opened.address2}
                </dd>
              </div>
            </dl>
          ) : null}
          {app.status === "paid" ? (
            <div className={a.stack}>
              <div className={a.btnRow}>
                <button className={a.btn} type="button" disabled={busy} onClick={() => run({ kind: "print", label: app.label }, app.printed ? "송장을 다시 출력했어요." : "송장을 출력했어요.")}>
                  {app.printed ? "다시 출력" : "송장 출력"}
                </button>
              </div>
              {app.printed && !app.waybill ? (
                <form
                  className={a.toolbar}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run({ kind: "set_waybill", label: app.label, waybill }, "운송장 번호를 넣었어요.");
                  }}
                >
                  <label className={a.field}>
                    <span>운송장 번호</span>
                    <input className={`${a.input} ${a.mono}`} inputMode="numeric" value={waybill} maxLength={40} required onChange={(e) => setWaybill(e.target.value)} />
                  </label>
                  <button className={`${a.btn} ${a.btnLine}`} type="submit" disabled={busy}>
                    저장
                  </button>
                </form>
              ) : null}
              {app.printed && app.waybill ? (
                <form
                  className={a.toolbar}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run({ kind: "confirm_shipment", label: app.label, waybill: scan }, "출고했어요.");
                  }}
                >
                  <label className={a.field}>
                    <span>송장 바코드 스캔 (운송장 {formatWaybill(app.waybill)})</span>
                    <input className={`${a.input} ${a.mono}`} inputMode="numeric" value={scan} maxLength={40} required onChange={(e) => setScan(e.target.value)} />
                  </label>
                  <button className={a.btn} type="submit" disabled={busy}>
                    출고 확정
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      <div role="status">{msg ? <p className={msg.ok ? a.noteOk : a.errorLine}>{msg.text}</p> : null}</div>
    </section>
  );
}

function ReturnsCard() {
  const [boxes, setBoxes] = useState<ReturnBox[] | null>(null);
  const [input, setInput] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await post({ kind: "returns" });
    if (r.kind === "failed") return setMsg({ ok: false, text: r.message });
    setBoxes(r.body.boxes as ReturnBox[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async (boxId: string) => {
    setBusy(true);
    setMsg(null);
    const r = await post({ kind: "confirm_return", boxId, waybill: input[boxId] ?? "" });
    setBusy(false);
    if (r.kind === "failed") return setMsg({ ok: false, text: r.message });
    setMsg({ ok: true, text: "반송했어요." });
    await load();
  };

  return (
    <section className={`${a.card} ${a.stack}`} aria-labelledby="gb-return">
      <h2 className={a.sectionH} id="gb-return">
        착불 반송
      </h2>
      {boxes === null ? null : boxes.length === 0 ? (
        <p className={a.sub}>반송할 선물함이 없어요.</p>
      ) : (
        <div className={a.tblWrap}>
          <table className={a.tbl}>
            <thead>
              <tr>
                <th scope="col">선물함</th>
                <th scope="col">크리에이터</th>
                <th scope="col">원 송장번호</th>
                <th scope="col">반송 시작</th>
                <th scope="col">반송 송장번호</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.creatorName}</td>
                  <td className={a.mono}>{b.cartonWaybills.map(formatWaybill).join(", ") || "—"}</td>
                  <td>{b.returningAt ? formatDateTime(b.returningAt) : "—"}</td>
                  <td>
                    <form
                      className={a.toolbar}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void confirm(b.id);
                      }}
                    >
                      <input
                        className={`${a.input} ${a.mono}`}
                        aria-label={`${b.name} 반송 송장번호`}
                        inputMode="numeric"
                        maxLength={40}
                        required
                        value={input[b.id] ?? ""}
                        onChange={(e) => setInput({ ...input, [b.id]: e.target.value })}
                      />
                      <button className={`${a.btn} ${a.btnSm}`} type="submit" disabled={busy}>
                        반송 확정
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div role="status">{msg ? <p className={msg.ok ? a.noteOk : a.errorLine}>{msg.text}</p> : null}</div>
    </section>
  );
}

export function GiftBoxOutbound() {
  return (
    <div className={a.stack}>
      <OutboundCard />
      <ReturnsCard />
    </div>
  );
}
