"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useFormDraft } from "@/shared/lib/form-draft/use-form-draft";
import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { revgiftPriceOf, serviceFeeOf } from "@/entities/payment/model/charge";
import { PRICED_TIERS, checkPriceTable, type PriceTable, type PricedTier, type TierPrice } from "@/entities/payment/model/price-table";
import a from "@/shared/ui/admin.module.css";
import { postPricing } from "../api/post-pricing-client";
import { PRICE_RULES, formatWon, parseWon, ruleOfProblem } from "../model/price-input";
import { pricingRowsOf } from "../model/save-pricing";

// 요금표 표 (admin-console INV-K2·K4, 시안 admin/pricing.html).
// 대표(editable)는 구간마다 세 칸을 고치고 「저장 전 검사」를 통과해야 저장된다. 직원은 같은 표를 값으로만 본다 —
// 입력칸·버튼 자체가 없다(design-rules 8절). 저장 권한은 화면이 아니라 DB 가 다시 판정한다.

type FieldKey = keyof TierPrice;
type Draft = Record<PricedTier, Record<FieldKey, string>>;

const FIELDS: readonly { key: FieldKey; name: string }[] = [
  { key: "priceKrw", name: "받는 값" },
  { key: "carrierCostKrw", name: "택배 원가" },
  { key: "inspectionFeeKrw", name: "검수비" },
];

function draftOf(table: PriceTable): Draft {
  const out = {} as Draft;
  for (const tier of PRICED_TIERS) {
    out[tier] = { priceKrw: formatWon(table[tier].priceKrw), carrierCostKrw: formatWon(table[tier].carrierCostKrw), inspectionFeeKrw: formatWon(table[tier].inspectionFeeKrw) };
  }
  return out;
}

function numbersOf(draft: Draft): Record<PricedTier, TierPrice> {
  const out = {} as Record<PricedTier, TierPrice>;
  for (const tier of PRICED_TIERS) {
    out[tier] = { priceKrw: parseWon(draft[tier].priceKrw), carrierCostKrw: parseWon(draft[tier].carrierCostKrw), inspectionFeeKrw: parseWon(draft[tier].inspectionFeeKrw) };
  }
  return out;
}

function sameDraft(x: Draft, y: Draft): boolean {
  return PRICED_TIERS.every((tier) => FIELDS.every((f) => parseWon(x[tier][f.key]) === parseWon(y[tier][f.key]) || x[tier][f.key] === y[tier][f.key]));
}

export function PricingForm({ table, editable }: { table: PriceTable; editable: boolean }) {
  const router = useRouter();
  const [base, setBase] = useState<Draft>(() => draftOf(table));
  const [draft, setDraft] = useState<Draft>(base);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // 고치던 값 임시 저장(session-login INV-L20). 직원 화면은 입력칸이 없어 저장할 것도 없다.
  // 서버 요금표를 기준값으로 함께 남긴다 — 다시 열 때 그사이 요금표가 바뀌었으면 옛 입력으로 덮지 않는다
  const formRef = useRef<HTMLFormElement>(null);
  const { clear } = useFormDraft(formRef, "admin-pricing-form", { baseline: JSON.stringify(table) });

  const numbers = numbersOf(draft);
  const checked = checkPriceTable(numbers);
  const badRule = checked.ok ? null : ruleOfProblem(checked.problem);
  const changed = !sameDraft(draft, base);
  const canSave = checked.ok && changed && !busy;
  const saveLabel = busy ? "저장하는 중…" : !checked.ok ? "검사를 통과해야 저장돼요" : changed ? "요금표 저장" : "바뀐 곳이 없어요";

  function edit(tier: PricedTier, key: FieldKey, value: string) {
    setDraft((d) => ({ ...d, [tier]: { ...d[tier], [key]: value } }));
    setMessage(null);
  }

  function tidy(tier: PricedTier, key: FieldKey) {
    const n = parseWon(draft[tier][key]);
    if (Number.isFinite(n)) edit(tier, key, formatWon(n));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!checked.ok || !canSave) return;
    setBusy(true);
    const outcome = await postPricing(pricingRowsOf(checked.table));
    setBusy(false);
    if (outcome.kind === "ok") {
      clear();
      const saved = draftOf(checked.table);
      setBase(saved);
      setDraft(saved);
      setMessage({ ok: true, text: "저장했어요. 새 주문부터 이 요금으로 계산해요." });
      router.refresh(); // 바꾼 기록 표를 다시 읽는다
    } else {
      setMessage({ ok: false, text: outcome.message });
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate>
      <div className={a.tblWrap}>
        <table className={a.tbl} style={{ minWidth: 900 }}>
          <caption className="sr-only">구간별 요금표</caption>
          <thead>
            <tr>
              <th scope="col">구간</th>
              <th scope="col">기준 (세 변 합·무게)</th>
              {FIELDS.map((f) => (
                <th key={f.key} scope="col" className={a.num}>
                  {f.name}
                </th>
              ))}
              <th scope="col" className={a.num}>
                기본 서비스료 <span className={a.faint}>자동</span>
              </th>
              <th scope="col" className={a.num}>
                역조공 요금 <span className={a.faint}>자동</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {PRICED_TIERS.map((tier) => {
              const guide = PARCEL_TIER_GUIDE[tier];
              return (
                <tr key={tier}>
                  <th scope="row">{guide.name}</th>
                  <td className={a.sub}>{guide.rule}</td>
                  {FIELDS.map((f) => (
                    <td key={f.key} className={a.num}>
                      {editable ? (
                        <>
                          <label className="sr-only" htmlFor={`price-${tier}-${f.key}`}>
                            {guide.name} {f.name}
                          </label>
                          <input
                            id={`price-${tier}-${f.key}`}
                            className={`${a.input} ${a.num}`}
                            style={{ width: 116 }}
                            inputMode="numeric"
                            autoComplete="off"
                            value={draft[tier][f.key]}
                            onChange={(e) => edit(tier, f.key, e.target.value)}
                            onBlur={() => tidy(tier, f.key)}
                          />{" "}
                          원
                        </>
                      ) : (
                        <>
                          <b className={a.mono}>{formatWon(table[tier][f.key])}</b> 원
                        </>
                      )}
                    </td>
                  ))}
                  <td className={a.num}>
                    <b>{formatWon(serviceFeeOf(numbers[tier]))}</b> 원
                  </td>
                  <td className={a.num}>
                    <b>{formatWon(revgiftPriceOf(numbers[tier]))}</b> 원
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editable && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "end", gap: 20, marginTop: 12 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--sub)", marginBottom: 6 }}>저장 전 검사</p>
            <ul className={a.checks} aria-live="polite">
              {PRICE_RULES.map((r) => {
                // 검사는 첫 번째로 어긴 조건만 알려 준다. 그 조건 말고는 통과했는지 모르므로 ✓ 를 붙이지 않는다.
                const state = checked.ok ? "pass" : r.rule === badRule ? "bad" : "unchecked";
                return (
                  <li key={r.rule} className={state === "bad" ? a.bad : state === "unchecked" ? a.unchecked : undefined}>
                    <span className={a.mk} aria-hidden="true">
                      {state === "pass" ? "✓" : state === "bad" ? "!" : "·"}
                    </span>
                    {state === "bad" && <span className="sr-only">어긋남: </span>}
                    {state === "unchecked" && <span className="sr-only">확인 전: </span>}
                    {r.text}
                  </li>
                );
              })}
            </ul>
            {message && (
              <p role="status" style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: message.ok ? "var(--brand-ink)" : "var(--ink)" }}>
                {message.text}
              </p>
            )}
          </div>
          <div className={a.btnRow}>
            <button
              type="button"
              className={`${a.btn} ${a.btnLine}`}
              onClick={() => {
                setDraft(base);
                setMessage(null);
              }}
            >
              되돌리기
            </button>
            <button type="submit" className={`${a.btn} ${a.btnLg}`} aria-disabled={!canSave}>
              {saveLabel}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
