"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MyBox, PriceTable } from "@/entities/revgift-box/api/box-reads";
import { CHOSEN_TIERS, estimateKrw, TIER_NAME, TIER_RULE, type ChosenTier } from "@/entities/revgift-box/model/box-tiers";
import { sendSubmitTiers } from "../api/box-requests";
import s from "./box-manage.module.css";

// 2페이지 — 상자 선택 (revgift-box INV-GB1·GB12·GB13 · UX 명세 creator-revgifts-new.md 「2페이지」 tier_empty·tier_partial·tier_full).
// 담길 팬마다 구간을 고르고 「다음」. 예상 금액은 표시일 뿐이다 — 명세서는 실측 뒤 서버가 실측 구간으로 계산한다(INV-GB13).
// 「다음」은 모든 팬의 구간을 골랐을 때만 누를 수 있고, 판정은 서버가 다시 한다(구간 없는 신청이 있으면 거부, INV-GB1 S1c).

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function BoxTierPanel({ box, price }: { box: MyBox; price: PriceTable }) {
  const router = useRouter();
  const selected = box.applications.filter((a) => a.status === "selected");
  const [tiers, setTiers] = useState<Record<string, ChosenTier | null>>(() => Object.fromEntries(selected.map((a) => [a.id, a.chosenTier])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = selected.map((a) => tiers[a.id] ?? null);
  const done = chosen.every((t) => t !== null);
  const estimate = estimateKrw(chosen, price);
  const setAll = (t: ChosenTier) => setTiers(Object.fromEntries(selected.map((a) => [a.id, t])));

  const submit = async () => {
    if (!done || busy) return;
    setBusy(true);
    setError(null);
    const o = await sendSubmitTiers(box.id, Object.fromEntries(selected.map((a) => [a.id, tiers[a.id] as ChosenTier])));
    setBusy(false);
    if (o.kind === "ok") return router.refresh();
    if (o.kind === "login") return router.push(`/login?next=${encodeURIComponent(`/creator/revgift-boxes/${box.id}`)}`);
    setError(o.kind === "refused" ? o.message : "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  };

  return (
    <div className={s.stack}>
      <section aria-labelledby="tier-fees">
        <h2 className={s.secH} id="tier-fees">
          상자 크기별 택배비
        </h2>
        <ul className={s.fees}>
          {CHOSEN_TIERS.map((t) => (
            <li key={t} className={s.fee}>
              <span className={s.feeName}>{TIER_NAME[t]}</span>
              <span className={s.feeRule}>
                세 변 합 {TIER_RULE[t].sizeCm}cm · {TIER_RULE[t].weightKg}kg
              </span>
              <span className={s.feeKrw}>{won(price.fees[t])}</span>
            </li>
          ))}
        </ul>
        <ul className={s.notes}>
          <li>크기와 무게 중 큰 쪽으로 정합니다.</li>
          <li>세 변 합 140cm 또는 15kg을 넘는 선물은 개인접수로 바뀌어 우체국 실비로 청구합니다.</li>
          <li>팬마다 서비스료 {won(price.serviceFeeKrw)}이 더해집니다.</li>
        </ul>
      </section>

      <section aria-labelledby="tier-list">
        <div className={s.listHead}>
          <h2 className={s.secH} id="tier-list">
            상자 선택<span className={s.count}>{selected.length}명</span>
          </h2>
          <div className={s.linkBtns}>
            <button type="button" className="btn btn--line btn--sm" onClick={() => setAll("xsmall")}>
              전부 극소형
            </button>
            <button type="button" className="btn btn--line btn--sm" onClick={() => setAll("small")}>
              전부 소형
            </button>
          </div>
        </div>
        <ul className={s.rows}>
          {selected.map((a) => (
            <li key={a.id} className={`${s.row} ${s.tierRow}`}>
              <span className={s.nick} title={a.nickname}>
                {a.nickname}
              </span>
              <select
                className={`input ${s.tierSelect}`}
                aria-label={`${a.nickname} 상자 크기`}
                value={tiers[a.id] ?? ""}
                onChange={(e) => setTiers((all) => ({ ...all, [a.id]: (e.target.value || null) as ChosenTier | null }))}
              >
                <option value="">선택</option>
                {CHOSEN_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {TIER_NAME[t]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </section>

      <div className={s.estimate} aria-live="polite">
        <span>예상 금액</span>
        <strong>{won(estimate)}</strong>
        <span className={s.estimateNote}>입고 실측 후 확정됩니다</span>
      </div>
      <div role="alert">{error ? <p className="err">{error}</p> : null}</div>
      <div className={s.actions}>
        <button type="button" className="btn" disabled={!done || busy} onClick={submit}>
          {busy ? "저장 중…" : "다음"}
        </button>
      </div>
    </div>
  );
}
