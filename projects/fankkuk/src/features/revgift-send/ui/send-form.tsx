"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { PRICE_CHANGED_MESSAGE, PRICED_TIERS, type PricedTier, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { findFan, registerRevgiftRequest, type FoundFan } from "../api/send-requests";
import { MAX_REVGIFT_SHARES } from "../model/register-revgift";
import s from "./send-form.module.css";

// 역조공 보내기 입력. 시안: docs/design/mockups/site/v4/creator-revgift-new.html
// 팬은 아이디를 정확히 입력해 한 명씩 추가한다 — 팔로워 목록은 어디에도 보여 주지 않는다(reverse-gift INV-R2).
// 합계는 화면을 열 때 읽은 공개 요금표(prices)의 역조공 값으로 낸 안내다. 보내기 요청에 이 합계(quotedTotalKrw)를 같이 보내고,
// 서버는 등록 순간의 요금표로 다시 계산한 합계와 비교만 한다 — 결제 금액은 서버 계산값이다(INV-R3·K3).
// 다르면(화면을 연 뒤 요금이 바뀌었으면) 서버가 409 로 거부하고, 화면은 문구를 띄운 뒤 서버 page 를 다시 그려 금액을 고친다.

export type RevgiftCheckout = { orderId: string; orderNo: string; amountKrw: number; fanCount: number };

type Picked = FoundFan & { tier: PricedTier };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

const TIERS: readonly { tier: PricedTier; name: string }[] = PRICED_TIERS.map((tier) => ({ tier, name: PARCEL_TIER_GUIDE[tier].name }));

const SIZE_NOTE = `상자는 팬마다 고를 수 있어요. ${PRICED_TIERS.map((t) => `${PARCEL_TIER_GUIDE[t].name}은 ${PARCEL_TIER_GUIDE[t].rule}`).join(", ")}예요. 크기와 무게 중 큰 쪽으로 정해요.`;

export function RevgiftSendForm({
  prices,
  notice,
  onRegistered,
}: {
  /** 지금 공개 요금표(받는 값·역조공 값만) — 서버 page 가 DB 공개 읽기 함수로 읽어 넘긴다. */
  prices: PublicPriceTable;
  notice?: string;
  onRegistered: (target: RevgiftCheckout) => void;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [loginId, setLoginId] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [noticeShown, setNoticeShown] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  const full = picked.length >= MAX_REVGIFT_SHARES;
  const unitKrw = (tier: PricedTier) => prices[tier].revgiftPriceKrw;
  const total = picked.reduce((sum, p) => sum + unitKrw(p.tier), 0);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (searching || full) return;
    setNoticeShown(false);
    const wanted = loginId.trim();
    if (!wanted) {
      setAddError("팬 아이디를 입력해 주세요");
      return;
    }
    if (picked.some((p) => p.loginId === wanted)) {
      setAddError("이미 추가한 팬이에요");
      return;
    }
    setSearching(true);
    setAddError(null);
    const found = await findFan(wanted);
    setSearching(false);
    if (!found.ok) {
      if (found.reason === "login") router.push("/login");
      else if (found.reason === "limited") setAddError(found.message);
      else setAddError("팬을 찾지 못했어요. 잠시 뒤 다시 시도해 주세요");
      return;
    }
    const fan = found.fan;
    if (!fan) {
      setAddError("보낼 수 없는 아이디예요");
      return;
    }
    if (picked.some((p) => p.fanId === fan.fanId)) {
      setAddError("이미 추가한 팬이에요");
      return;
    }
    setPicked((prev) => [...prev, { ...fan, tier: "small" }]);
    setLoginId("");
    setPayError(null);
  };

  const remove = (fanId: string) => {
    setPicked((prev) => prev.filter((p) => p.fanId !== fanId));
    // 누른 버튼이 사라진다 — 포커스를 아이디 칸으로 돌려 다음 팬을 바로 넣게
    input.current?.focus();
  };

  const setTier = (fanId: string, tier: PricedTier) => {
    setPicked((prev) => prev.map((p) => (p.fanId === fanId ? { ...p, tier } : p)));
  };

  const pay = async () => {
    if (paying || picked.length === 0) return;
    setPaying(true);
    setPayError(null);
    setNoticeShown(false);
    const result = await registerRevgiftRequest(
      picked.map((p) => ({ fanId: p.fanId, tier: p.tier })),
      total,
    );
    setPaying(false);
    if (!result.ok) {
      if (result.reason === "login") router.push("/login");
      else if (result.reason === "price_changed") {
        // 화면을 연 뒤 요금이 바뀌었다(INV-K3) — 서버 page 를 다시 그려 새 요금표로 금액을 보여 준다. 고른 팬은 그대로 남는다
        setPayError(result.message ?? PRICE_CHANGED_MESSAGE);
        router.refresh();
      } else setPayError(result.message ?? "보내기를 등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      return;
    }
    const { tossOrderId, amountKrw, orderNos } = result.value;
    onRegistered({ orderId: tossOrderId, orderNo: orderNos[0] ?? "", amountKrw, fanCount: orderNos.length });
  };

  const counts = TIERS.map((t) => ({ ...t, count: picked.filter((p) => p.tier === t.tier).length })).filter((t) => t.count > 0);

  return (
    <div className={s.grid}>
      <div className={s.stack}>
        <section className={s.card} aria-labelledby="rv-add-title">
          <h2 className={s.h} id="rv-add-title">
            받을 팬 추가
          </h2>
          <p className={s.sub}>나를 팔로우한 팬만 추가할 수 있어요.</p>
          <div role="alert">{notice && noticeShown ? <p className={s.error}>{notice}</p> : null}</div>
          <form className={s["add-form"]} onSubmit={add} noValidate>
            <div className="field">
              <label htmlFor="rv-fan-id">팬 아이디</label>
              <div className={s["add-row"]}>
                <input
                  ref={input}
                  className="input"
                  id="rv-fan-id"
                  name="fan-id"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="예: byeolbit_fan"
                  value={loginId}
                  onChange={(e) => {
                    setLoginId(e.target.value);
                    if (addError) setAddError(null);
                  }}
                  disabled={full}
                  aria-invalid={addError ? true : undefined}
                  aria-describedby={addError ? "rv-fan-hint rv-fan-err" : "rv-fan-hint"}
                />
                <button className="btn" type="submit" disabled={full} aria-busy={searching || undefined}>
                  추가
                </button>
              </div>
              <p className="hint" id="rv-fan-hint">
                {full
                  ? `한 번에 ${MAX_REVGIFT_SHARES}명까지 보낼 수 있어요. 더 보내려면 결제한 뒤 새로 보내 주세요.`
                  : "아이디 전체를 정확히 입력해야 찾을 수 있어요. 일부만 쓰거나 팔로워 목록에서 고르는 건 되지 않아요."}
              </p>
              <div role="alert">
                {addError ? (
                  <p className={s.error} id="rv-fan-err">
                    {addError}
                  </p>
                ) : null}
              </div>
            </div>
          </form>
          <div className={s["list-head"]}>
            <h3 id="rv-fans-title">받을 팬 {picked.length}명</h3>
            <span className={s.max}>최대 {MAX_REVGIFT_SHARES}명까지 한 번에 보낼 수 있어요</span>
          </div>
          {picked.length > 0 ? (
            <ul className={s.fans} aria-labelledby="rv-fans-title">
              {picked.map((p, i) => (
                <li key={p.fanId} className={s["fan-row"]}>
                  <FaceAvatar index={i} />
                  <div className={s.who}>
                    <p className={s.nick}>{p.nickname}</p>
                    <p className={s.handle}>@{p.loginId}</p>
                  </div>
                  <fieldset className={s.sizes}>
                    <legend className="sr-only">{p.nickname}님께 보낼 상자 크기</legend>
                    {TIERS.map((t) => (
                      <label key={t.tier}>
                        <input
                          type="radio"
                          name={`rv-size-${p.fanId}`}
                          value={t.tier}
                          checked={p.tier === t.tier}
                          onChange={() => setTier(p.fanId, t.tier)}
                        />
                        <span>
                          {t.name} <span className={s.won}>{won(unitKrw(t.tier))}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <button className="btn btn--text btn--sm" type="button" aria-label={`${p.nickname}님 빼기`} onClick={() => remove(p.fanId)}>
                    빼기
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s["empty-fans"]}>아직 추가한 팬이 없어요. 아이디를 입력해 추가해 주세요.</p>
          )}
          <p className={s["size-note"]}>{SIZE_NOTE}</p>
        </section>
        <section className={s.card} aria-labelledby="rv-how-title">
          <h2 className={s.h} id="rv-how-title">
            이렇게 진행돼요
          </h2>
          <ol className={s.how}>
            <li>
              <strong>팬이 「받기」를 누를 때 주소를 직접 입력해요</strong>
              <p>크리에이터에게는 팬의 주소가 보이지 않아요.</p>
            </li>
            <li>
              <strong>결제하면 사무실 주소가 안내돼요</strong>
              <p>팬마다 상자를 따로 포장해서 보내 주세요. 상자마다 주문번호를 적어야 해요.</p>
            </li>
            <li>
              <strong>7일 안에 받지 않으면 그 상자만 돌려보내고 환불해요</strong>
              <p>한 팬이 받지 않아도 다른 팬의 선물은 그대로 가요.</p>
            </li>
          </ol>
          <p className={s["no-list"]}>
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" fill="currentColor" />
              <path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="var(--white)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            팔로워 목록은 보여 드리지 않아요. 아이디를 아는 팬에게만 보낼 수 있어요.
          </p>
        </section>
      </div>
      <aside className={s.pay} aria-labelledby="rv-pay-title">
        <h2 id="rv-pay-title">결제 금액</h2>
        <p className={s.inc}>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="m4 10.5 4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          배송비와 검수 포함
        </p>
        <div className={s.lines}>
          {counts.map((t) => (
            <p key={t.tier} className={s.line}>
              <span>
                {t.name} 상자 × {t.count}
              </span>
              <span className={s.amt}>{won(unitKrw(t.tier) * t.count)}</span>
            </p>
          ))}
        </div>
        <p className={s.total}>
          <span>합계</span>
          <strong className={s.big}>{won(total)}</strong>
        </p>
        <button className="btn btn--block" type="button" onClick={pay} disabled={picked.length === 0} aria-busy={paying || undefined}>
          결제하기
        </button>
        <div role="alert">{payError ? <p className={s.error}>{payError}</p> : null}</div>
        <p className={s.after}>결제는 한 번이에요. 팬이 받지 않으면 그 팬의 상자 요금만 환불돼요.</p>
      </aside>
    </div>
  );
}
