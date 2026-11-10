"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import {
  CARRIER_ROUTES,
  CARRIER_ROUTE_NAME,
  SHIP_TIERS,
  SHIP_TIER_GUIDE,
  type CarrierPricing,
  type CarrierRoute,
  type PricingProblem,
  type ShipTier,
} from "@/entities/payment/model/carrier-pricing";
import { PRICED_TIERS, type PriceTable, type PricedTier } from "@/entities/payment/model/price-table";
import a from "@/shared/ui/admin.module.css";
import { postCarrierPricing } from "../api/post-carrier-pricing-client";
import { raisesCarrierPricing } from "../model/price-raise";
import { formatWon, parseWon } from "../model/price-input";
import type { CarrierPricingBody } from "../model/save-carrier-pricing";
import { RaiseNoticeDialog } from "./raise-notice-dialog";

// 택배 원가 경로표 · 기본 경로 · 팬에게 보내기 택배비 (admin-console INV-K15·K16, ux pages/admin-pricing.md).
// 대표(editable)만 입력칸·저장 버튼이 있다. 저장 권한과 검사는 DB 가 다시 판정한다.
// 검사에 걸리면 서버가 준 수정안을 보여 주고, 「이 값으로 채우기」로 입력칸에 넣은 뒤 다시 저장한다 —
// 팬 선물 받는 값 수정안은 이 양식이 요금표 세 줄과 함께 한 번에 저장한다(S16 「함께 저장하면 전환된다」).

type RouteDraft = Record<CarrierRoute, Record<ShipTier, string>>;
type FeeDraft = Record<ShipTier, string>;
type PriceOverride = Partial<Record<PricedTier, string>>;

function routeDraftOf(p: CarrierPricing): RouteDraft {
  const out = {} as RouteDraft;
  for (const route of CARRIER_ROUTES) {
    out[route] = {} as Record<ShipTier, string>;
    for (const t of SHIP_TIERS) {
      const v = p.routes[route][t];
      out[route][t] = v === null ? "" : formatWon(v);
    }
  }
  return out;
}

function feeDraftOf(p: CarrierPricing): FeeDraft {
  const out = {} as FeeDraft;
  for (const t of SHIP_TIERS) out[t] = formatWon(p.sendFees[t]);
  return out;
}

/** 경로 칸 글자 → 원. 빈칸은 null(값 없음), 숫자가 아니면 NaN. */
function costOf(text: string): number | null {
  return text.trim() === "" ? null : parseWon(text);
}

function okWon(n: number | null): boolean {
  return n === null || (Number.isInteger(n) && n >= 0 && n <= 10_000_000);
}

function isComplete(draft: Record<ShipTier, string>): boolean {
  return SHIP_TIERS.every((t) => {
    const c = costOf(draft[t]);
    return c !== null && okWon(c);
  });
}

type Built = { ok: true; body: CarrierPricingBody | null } | { ok: false };

/** 바뀐 곳만 담은 저장 몸통. 바뀐 곳이 없으면 body = null. */
function buildBody(pricing: CarrierPricing, table: PriceTable, routes: RouteDraft, defaultRoute: CarrierRoute, fees: FeeDraft, prices: PriceOverride): Built {
  const body: CarrierPricingBody = {};
  const routeDiff: NonNullable<CarrierPricingBody["routes"]> = {};
  for (const route of CARRIER_ROUTES) {
    for (const t of SHIP_TIERS) {
      const c = costOf(routes[route][t]);
      if (!okWon(c)) return { ok: false };
      if (c !== pricing.routes[route][t]) routeDiff[route] = { ...routeDiff[route], [t]: c };
    }
  }
  if (Object.keys(routeDiff).length > 0) body.routes = routeDiff;

  const feeDiff: NonNullable<CarrierPricingBody["send_fees"]> = {};
  for (const t of SHIP_TIERS) {
    const f = parseWon(fees[t]);
    if (!Number.isInteger(f) || f < 0 || f > 10_000_000) return { ok: false };
    if (f !== pricing.sendFees[t]) feeDiff[t] = f;
  }
  if (Object.keys(feeDiff).length > 0) body.send_fees = feeDiff;

  if (defaultRoute !== pricing.defaultRoute) body.default_route = defaultRoute;

  if (Object.keys(prices).length > 0) {
    const rows = [];
    for (const tier of PRICED_TIERS) {
      const text = prices[tier];
      const price = text === undefined ? table[tier].priceKrw : parseWon(text);
      if (!Number.isInteger(price) || price < 1 || price > 10_000_000) return { ok: false };
      rows.push({ tier, price_krw: price, inspection_fee_krw: table[tier].inspectionFeeKrw });
    }
    body.prices = rows;
  }
  return { ok: true, body: Object.keys(body).length > 0 ? body : null };
}

function problemText(p: PricingProblem, table: PriceTable): string {
  const name = SHIP_TIER_GUIDE[p.tier].name;
  if (p.kind === "route_incomplete") return `기본 경로의 ${name} 택배 원가가 비어 있어요.`;
  if (p.kind === "fan_gift") {
    const tier = p.tier as PricedTier;
    const service = Math.max(table[tier].priceKrw - table[tier].carrierCostKrw - table[tier].inspectionFeeKrw, 0);
    return `팬 선물 ${name} 받는 값 ${formatWon(p.amountKrw)}원 → 수정안 ${formatWon(p.proposalKrw)}원 (택배 원가 + 검수비 ${formatWon(p.minimumKrw)}원 + 지금 기본 서비스료 ${formatWon(service)}원)`;
  }
  return `팬에게 보내기 ${name} 택배비 ${formatWon(p.amountKrw)}원 → 수정안 ${formatWon(p.proposalKrw)}원 (택배 원가를 100원 단위로 반올림)`;
}

type Props = { pricing: CarrierPricing; table: PriceTable; editable: boolean };

export function CarrierPricingForm({ pricing, table, editable }: Props) {
  const router = useRouter();
  const [routes, setRoutes] = useState<RouteDraft>(() => routeDraftOf(pricing));
  const [defaultRoute, setDefaultRoute] = useState<CarrierRoute>(pricing.defaultRoute);
  const [fees, setFees] = useState<FeeDraft>(() => feeDraftOf(pricing));
  const [prices, setPrices] = useState<PriceOverride>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [problems, setProblems] = useState<PricingProblem[]>([]);
  // 택배비·함께 저장하는 받는 값을 올리는 저장이면 30일 공지 확인 창을 먼저 띄운다(ux pages/admin-pricing.md raise_notice_confirm).
  // 경로별 택배 원가·기본 경로만 바꾼 저장에는 창이 없다
  const noticeRef = useRef<HTMLDialogElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  const built = buildBody(pricing, table, routes, defaultRoute, fees, prices);
  const canSave = built.ok && built.body !== null && !busy;
  const saveLabel = busy ? "저장하는 중…" : !built.ok ? "금액을 확인해 주세요" : built.body ? "경로표 저장" : "바뀐 곳이 없어요";

  function touched() {
    setMessage(null);
  }

  function reset() {
    setRoutes(routeDraftOf(pricing));
    setDefaultRoute(pricing.defaultRoute);
    setFees(feeDraftOf(pricing));
    setPrices({});
    setProblems([]);
    setMessage(null);
  }

  /** 수정안을 입력칸에 넣는다 — 대표가 금액을 더 고칠 수 있게 저장은 따로 누른다 */
  function fillProposals() {
    const nextFees = { ...fees };
    const nextPrices = { ...prices };
    for (const p of problems) {
      if (p.kind === "fan_send") nextFees[p.tier] = formatWon(p.proposalKrw);
      if (p.kind === "fan_gift" && p.tier !== "xsmall") nextPrices[p.tier] = formatWon(p.proposalKrw);
    }
    setFees(nextFees);
    setPrices(nextPrices);
    setProblems([]);
    setMessage(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!built.ok || !built.body || busy) return;
    if (raisesCarrierPricing(pricing.sendFees, table, built.body)) {
      noticeRef.current?.showModal();
      return;
    }
    void save();
  }

  async function save() {
    if (!built.ok || !built.body || busy) return;
    setBusy(true);
    const outcome = await postCarrierPricing(built.body);
    setBusy(false);
    if (outcome.kind === "ok") {
      setPrices({});
      setProblems([]);
      setMessage({ ok: true, text: "저장했어요." });
      router.refresh(); // 요금표·바꾼 기록을 다시 읽는다
    } else {
      setProblems(outcome.problems);
      setMessage({ ok: false, text: outcome.message });
    }
  }

  const fillable = problems.some((p) => p.kind !== "route_incomplete");
  const overridden = PRICED_TIERS.filter((t) => prices[t] !== undefined);

  return (
    <form onSubmit={submit} noValidate>
      <section aria-labelledby="h-routes">
        <div className={a.sectionH}>
          <h2 id="h-routes">택배 원가 경로표</h2>
          <span>요금표의 택배 원가는 기본 경로 값이에요</span>
        </div>
        <div className={a.tblWrap}>
          <table className={a.tbl} style={{ minWidth: 820 }}>
            <caption className="sr-only">경로별 구간 택배 원가</caption>
            <thead>
              <tr>
                <th scope="col">경로</th>
                <th scope="col">기본 경로</th>
                {SHIP_TIERS.map((t) => (
                  <th key={t} scope="col" className={a.num}>
                    {SHIP_TIER_GUIDE[t].name} <span className={a.faint}>{SHIP_TIER_GUIDE[t].rule}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CARRIER_ROUTES.map((route) => {
                const complete = isComplete(routes[route]);
                return (
                  <tr key={route}>
                    <th scope="row">{CARRIER_ROUTE_NAME[route]}</th>
                    <td>
                      {editable ? (
                        <label className={a.check}>
                          <input
                            type="radio"
                            name="default-route"
                            value={route}
                            aria-label={`기본 경로: ${CARRIER_ROUTE_NAME[route]}`}
                            checked={defaultRoute === route}
                            disabled={!complete}
                            onChange={() => {
                              setDefaultRoute(route);
                              touched();
                            }}
                          />
                          {complete ? "기본" : <span className={a.faint}>값을 다 채워야 고를 수 있어요</span>}
                        </label>
                      ) : (
                        pricing.defaultRoute === route && <span className={`${a.tag} ${a.tagBrand}`}>기본</span>
                      )}
                    </td>
                    {SHIP_TIERS.map((t) => (
                      <td key={t} className={a.num}>
                        {editable ? (
                          <>
                            <label className="sr-only" htmlFor={`route-${route}-${t}`}>
                              {CARRIER_ROUTE_NAME[route]} {SHIP_TIER_GUIDE[t].name} 택배 원가
                            </label>
                            <input
                              id={`route-${route}-${t}`}
                              className={`${a.input} ${a.num}`}
                              style={{ width: 104 }}
                              inputMode="numeric"
                              autoComplete="off"
                              value={routes[route][t]}
                              onChange={(e) => {
                                const v = e.target.value;
                                setRoutes((d) => ({ ...d, [route]: { ...d[route], [t]: v } }));
                                touched();
                              }}
                            />{" "}
                            원
                          </>
                        ) : pricing.routes[route][t] === null ? (
                          <span className={a.faint}>—</span>
                        ) : (
                          <>
                            <b className={a.mono}>{formatWon(pricing.routes[route][t] ?? Number.NaN)}</b> 원
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="h-send-fees" style={{ marginTop: 20 }}>
        <div className={a.sectionH}>
          <h2 id="h-send-fees">팬에게 보내기 택배비</h2>
          <span>역조공 결제에는 아직 쓰지 않아요</span>
        </div>
        <div className={a.tblWrap}>
          <table className={a.tbl} style={{ minWidth: 560 }}>
            <caption className="sr-only">팬에게 보내기 구간별 택배비</caption>
            <thead>
              <tr>
                {SHIP_TIERS.map((t) => (
                  <th key={t} scope="col" className={a.num}>
                    {SHIP_TIER_GUIDE[t].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {SHIP_TIERS.map((t) => (
                  <td key={t} className={a.num}>
                    {editable ? (
                      <>
                        <label className="sr-only" htmlFor={`send-fee-${t}`}>
                          팬에게 보내기 {SHIP_TIER_GUIDE[t].name} 택배비
                        </label>
                        <input
                          id={`send-fee-${t}`}
                          className={`${a.input} ${a.num}`}
                          style={{ width: 104 }}
                          inputMode="numeric"
                          autoComplete="off"
                          value={fees[t]}
                          onChange={(e) => {
                            const v = e.target.value;
                            setFees((d) => ({ ...d, [t]: v }));
                            touched();
                          }}
                        />{" "}
                        원
                      </>
                    ) : (
                      <>
                        <b className={a.mono}>{formatWon(pricing.sendFees[t])}</b> 원
                      </>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {editable && (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {overridden.length > 0 && (
            <div className={a.card}>
              <p className={a.fieldLabel} style={{ marginBottom: 8 }}>
                함께 저장할 팬 선물 받는 값
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                {overridden.map((tier) => (
                  <div key={tier} className={a.field}>
                    <label htmlFor={`gift-price-${tier}`}>{SHIP_TIER_GUIDE[tier].name}</label>
                    <span>
                      <input
                        id={`gift-price-${tier}`}
                        className={`${a.input} ${a.num}`}
                        style={{ width: 116 }}
                        inputMode="numeric"
                        autoComplete="off"
                        value={prices[tier]}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPrices((d) => ({ ...d, [tier]: v }));
                          touched();
                        }}
                      />{" "}
                      원 <span className={a.faint}>지금 {formatWon(table[tier].priceKrw)}원</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {problems.length > 0 && (
            <div className={a.card} role="alert">
              <p className={a.fieldLabel} style={{ marginBottom: 8 }}>
                수정안
              </p>
              <ul className={a.checks}>
                {problems.map((p) => (
                  <li key={`${p.kind}-${p.tier}`} className={a.bad}>
                    <span className={a.mk} aria-hidden="true">
                      !
                    </span>
                    {problemText(p, table)}
                  </li>
                ))}
              </ul>
              {fillable && (
                <button type="button" className={`${a.btn} ${a.btnSoft} ${a.btnSm}`} style={{ marginTop: 10 }} onClick={fillProposals}>
                  이 값으로 채우기
                </button>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "end", gap: 20 }}>
            <div>
              {message && (
                <p role="status" style={{ fontSize: 14, fontWeight: 700, color: message.ok ? "var(--brand-ink)" : "var(--ink)" }}>
                  {message.text}
                </p>
              )}
            </div>
            <div className={a.btnRow}>
              <button type="button" className={`${a.btn} ${a.btnLine}`} onClick={reset}>
                되돌리기
              </button>
              <button ref={saveRef} type="submit" className={`${a.btn} ${a.btnLg}`} aria-disabled={!canSave}>
                {saveLabel}
              </button>
            </div>
          </div>
          <RaiseNoticeDialog dialogRef={noticeRef} returnFocusRef={saveRef} onConfirm={() => void save()} />
        </div>
      )}
    </form>
  );
}
