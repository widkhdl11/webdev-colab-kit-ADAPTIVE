"use client";

import { useState } from "react";
import { postOffice } from "@/entities/parcel/api/post-office-client";
import { BOX_STATUS_NAME, type ApplicationStatus, type BoxStatus } from "@/entities/revgift-box/model/box-status";
import { TIER_NAME, type InvoiceTier } from "@/entities/revgift-box/model/box-tiers";
import a from "@/shared/ui/admin.module.css";
import type { GiftBoxWrite } from "../model/scan-gift-box";

// 선물함 입고·실측 작업 화면 (revgift-box INV-GB10·GB12·GB13·GB16·GB23).
// ① 큰 상자 입고: 6자리 · 원 송장번호 · 착불 택배비 · 선반. 무효가 된 6자리면 보류로 들어간다(취소한 선물함이면 크리에이터에게 카드).
// ② 실측: 6자리로 선물함을 불러와 선물마다 바코드(신청 번호)를 스캔하거나 손글씨 닉네임을 넣고, 세 변 합·무게를 적는다.
//    구간은 서버가 정한다. 맞지 않는 선물은 「확인 필요」로 남고 크리에이터가 팬을 고른다.
// 상태를 고르는 칸은 없다(INV-GB1).

type Lookup = {
  name: string;
  status: BoxStatus;
  cartonCount: number | null;
  cartonsReceived: number;
  openHolds: number;
  applications: { label: string; nickname: string; status: ApplicationStatus; tier: InvoiceTier | null }[];
};

const post = (w: GiftBoxWrite) => postOffice("/api/admin/work/gift-boxes", w);
const RECEIVE_TEXT: Record<string, string> = {
  received: "입고했어요.",
  held: "이미 끝났거나 취소한 선물함이라 보류로 넣었어요. 보류 상자 화면에서 확인해 주세요.",
  unknown: "선물함 6자리가 아니에요. 일반 입고 화면에서 받아 주세요.",
};

function ReceiveCard() {
  const [code, setCode] = useState("");
  const [waybill, setWaybill] = useState("");
  const [cod, setCod] = useState("0");
  const [shelf, setShelf] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await post({ kind: "receive", code, waybillNo: waybill.replace(/\D/g, ""), codFeeKrw: Number(cod), shelf });
    setBusy(false);
    if (r.kind === "failed") return setMsg({ ok: false, text: r.message });
    const result = String(r.body.result);
    const name = typeof r.body.boxName === "string" ? `${r.body.boxName} · ` : "";
    setMsg({ ok: result === "received", text: name + (RECEIVE_TEXT[result] ?? "") });
    if (result === "received") setWaybill("");
  };
  return (
    <form className={`${a.card} ${a.stack}`} onSubmit={submit} aria-labelledby="gb-receive">
      <h2 className={a.sectionH} id="gb-receive">
        큰 상자 입고
      </h2>
      <div className={a.split}>
        <label className={a.field}>
          <span>선물함 6자리</span>
          <input className={`${a.input} ${a.mono}`} value={code} maxLength={8} required onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className={a.field}>
          <span>원 송장번호</span>
          <input className={`${a.input} ${a.mono}`} inputMode="numeric" value={waybill} maxLength={20} required onChange={(e) => setWaybill(e.target.value)} />
        </label>
        <label className={a.field}>
          <span>착불 택배비(원, 선불이면 0)</span>
          <input className={a.input} type="number" min={0} step={1} value={cod} required onChange={(e) => setCod(e.target.value)} />
        </label>
        <label className={a.field}>
          <span>선반</span>
          <input className={a.input} value={shelf} maxLength={20} required onChange={(e) => setShelf(e.target.value)} />
        </label>
      </div>
      <div className={a.btnRow}>
        <button className={a.btn} type="submit" disabled={busy}>
          {busy ? "처리 중…" : "입고"}
        </button>
      </div>
      <div role="status">{msg ? <p className={msg.ok ? a.noteOk : a.errorLine}>{msg.text}</p> : null}</div>
    </form>
  );
}

function MeasureCard() {
  const [code, setCode] = useState("");
  const [box, setBox] = useState<Lookup | null>(null);
  const [by, setBy] = useState<"label" | "nickname">("label");
  const [label, setLabel] = useState("");
  const [nickname, setNickname] = useState("");
  const [size, setSize] = useState("");
  const [weight, setWeight] = useState("");
  const [personal, setPersonal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async (c = code) => {
    const r = await post({ kind: "lookup", code: c });
    if (r.kind === "failed") {
      setBox(null);
      return setMsg({ ok: false, text: r.message });
    }
    setBox(r.body.box as Lookup);
  };
  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    await load();
  };
  const measure = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await post({
      kind: "measure",
      code,
      ...(by === "label" ? { label } : { nickname }),
      sizeCm: Number(size),
      weightKg: Number(weight),
      ...(personal.trim() ? { personalKrw: Number(personal) } : {}),
    });
    setBusy(false);
    if (r.kind === "failed") return setMsg({ ok: false, text: r.message });
    const tier = TIER_NAME[r.body.tier as InvoiceTier] ?? "";
    setMsg(
      r.body.result === "measured"
        ? { ok: true, text: `${String(r.body.nickname)} · ${tier}로 기록했어요.` }
        : { ok: false, text: `맞는 신청이 없어 확인 필요로 두었어요(${tier}). 크리에이터가 팬을 고르면 이어져요.` },
    );
    setLabel("");
    setNickname("");
    setSize("");
    setWeight("");
    setPersonal("");
    await load();
  };

  return (
    <section className={`${a.card} ${a.stack}`} aria-labelledby="gb-measure">
      <h2 className={a.sectionH} id="gb-measure">
        선물 실측
      </h2>
      <form className={a.toolbar} onSubmit={lookup}>
        <label className={a.field}>
          <span>선물함 6자리</span>
          <input className={`${a.input} ${a.mono}`} value={code} maxLength={8} required onChange={(e) => setCode(e.target.value)} />
        </label>
        <button className={`${a.btn} ${a.btnLine}`} type="submit">
          불러오기
        </button>
      </form>
      {box ? (
        <>
          <p className={a.sub}>
            {box.name} · {BOX_STATUS_NAME[box.status]} · 도착한 상자 {box.cartonsReceived}/{box.cartonCount ?? 1} · 확인 필요 {box.openHolds}
          </p>
          <div className={a.tblWrap}>
            <table className={a.tbl}>
              <thead>
                <tr>
                  <th scope="col">닉네임</th>
                  <th scope="col">신청 번호</th>
                  <th scope="col">실측</th>
                </tr>
              </thead>
              <tbody>
                {box.applications.map((x) => (
                  <tr key={x.label}>
                    <td>{x.nickname}</td>
                    <td className={a.mono}>{x.label}</td>
                    <td>{x.tier ? TIER_NAME[x.tier] : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className={a.stack} onSubmit={measure}>
            <div className={a.btnRow} role="radiogroup" aria-label="선물 찾기">
              <label className={a.check}>
                <input type="radio" name="gb-by" checked={by === "label"} onChange={() => setBy("label")} /> 바코드
              </label>
              <label className={a.check}>
                <input type="radio" name="gb-by" checked={by === "nickname"} onChange={() => setBy("nickname")} /> 손글씨 닉네임
              </label>
            </div>
            <div className={a.split}>
              {by === "label" ? (
                <label className={a.field}>
                  <span>바코드</span>
                  <input className={`${a.input} ${a.mono}`} value={label} maxLength={20} required onChange={(e) => setLabel(e.target.value)} />
                </label>
              ) : (
                <label className={a.field}>
                  <span>작성된 닉네임</span>
                  <input className={a.input} value={nickname} maxLength={40} required onChange={(e) => setNickname(e.target.value)} />
                </label>
              )}
              <label className={a.field}>
                <span>세 변 합(cm)</span>
                <input className={a.input} type="number" min={0.1} step={0.1} value={size} required onChange={(e) => setSize(e.target.value)} />
              </label>
              <label className={a.field}>
                <span>무게(kg)</span>
                <input className={a.input} type="number" min={0.01} step={0.01} value={weight} required onChange={(e) => setWeight(e.target.value)} />
              </label>
              <label className={a.field}>
                <span>우체국 실비(원, 140cm·15kg 초과만)</span>
                <input className={a.input} type="number" min={1} step={1} value={personal} onChange={(e) => setPersonal(e.target.value)} />
              </label>
            </div>
            <div className={a.btnRow}>
              <button className={a.btn} type="submit" disabled={busy}>
                {busy ? "처리 중…" : "실측 기록"}
              </button>
            </div>
          </form>
        </>
      ) : null}
      <div role="status">{msg ? <p className={msg.ok ? a.noteOk : a.errorLine}>{msg.text}</p> : null}</div>
    </section>
  );
}

export function GiftBoxWorkbench() {
  return (
    <div className={a.stack}>
      <ReceiveCard />
      <MeasureCard />
    </div>
  );
}
