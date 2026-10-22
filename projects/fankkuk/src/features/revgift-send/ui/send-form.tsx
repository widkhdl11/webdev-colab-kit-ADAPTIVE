"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { PRICE_CHANGED_MESSAGE, PRICED_TIERS, type PricedTier, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { PAYMENT_CONSENT_MISSING, PaymentConsent } from "@/entities/payment/ui/payment-consent";
import type { RevgiftFollower } from "@/entities/revgift/api/revgift-reads";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { registerRevgiftRequest } from "../api/send-requests";
import { MAX_REVGIFT_SHARES } from "../model/register-revgift";
import s from "./send-form.module.css";

// 팬에게 보내기(역조공) 입력. 시안: docs/design/mockups/site/v39-part3/revgifts-new-a.html (design-rules 25절 A안) —
// 팬 카드 3열 격자(휴대폰 1열) → 진행 순서·안내 회색 칸 → 화면 아래에 붙는 하늘 결제 띠(받을 팬 수·결제 금액·동의·결제하기)
// 받을 팬은 나를 팔로우하는 팬 목록(followers — 서버 page 가 DB 에서 내 팔로워만 읽어 넘긴다)에서 체크로 고른다(reverse-gift INV-R2).
// 목록에는 닉네임만 있다. 고른 팬이 지금도 팔로워인지는 등록 때 DB 가 다시 판정한다(INV-R1).
// 합계는 화면을 열 때 읽은 공개 요금표(prices)의 역조공 값으로 낸 안내다. 보내기 요청에 이 합계(quotedTotalKrw)를 같이 보내고,
// 서버는 등록 순간의 요금표로 다시 계산한 합계와 비교만 한다 — 결제 금액은 서버 계산값이다(INV-R3·K3).
// 다르면(화면을 연 뒤 요금이 바뀌었으면) 서버가 409 로 거부하고, 화면은 문구를 띄운 뒤 서버 page 를 다시 그려 금액을 고친다.

export type RevgiftCheckout = { orderId: string; orderNo: string; amountKrw: number; fanCount: number };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

// 결제 띠에 겹쳐 보이는 얼굴 수 — 넘으면 「+N」(시안 v39 revgifts-new.js)
const FACES_SHOWN = 6;

const TIERS: readonly { tier: PricedTier; name: string }[] = PRICED_TIERS.map((tier) => ({ tier, name: PARCEL_TIER_GUIDE[tier].name }));

const SIZE_NOTE = `상자는 팬마다 고를 수 있어요. ${PRICED_TIERS.map((t) => `${PARCEL_TIER_GUIDE[t].name}은 ${PARCEL_TIER_GUIDE[t].rule}`).join(", ")}예요. 크기와 무게 중 큰 쪽으로 정해요.`;

export function RevgiftSendForm({
  prices,
  followers,
  notice,
  onRegistered,
}: {
  /** 지금 공개 요금표(받는 값·역조공 값만) — 서버 page 가 DB 공개 읽기 함수로 읽어 넘긴다. */
  prices: PublicPriceTable;
  /** 나를 지금 팔로우하는 팬(최근 팔로우 순) — 서버 page 가 DB 읽기 함수로 읽어 넘긴다. */
  followers: readonly RevgiftFollower[];
  notice?: string;
  onRegistered: (target: RevgiftCheckout) => void;
}) {
  const router = useRouter();
  // 고른 팬 → 상자 구간. 화면을 다시 그려 목록에서 빠진 팬(팔로우를 끊음)은 아래 picked 에서 빠지고, 다음 체크 때 기록에서도 지운다
  const [tiers, setTiers] = useState<ReadonlyMap<string, PricedTier>>(new Map());
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [noticeShown, setNoticeShown] = useState(true);
  // 결제 전 동의(약관·처리방침·취소·환불 규정) — 체크하지 않으면 결제로 넘어가지 않는다
  const [consented, setConsented] = useState(false);

  const picked = followers.flatMap((f, index) => {
    const tier = tiers.get(f.fanId);
    return tier ? [{ ...f, tier, index }] : [];
  });
  const full = picked.length >= MAX_REVGIFT_SHARES;
  const unitKrw = (tier: PricedTier) => prices[tier].revgiftPriceKrw;
  const total = picked.reduce((sum, p) => sum + unitKrw(p.tier), 0);

  const toggle = (fanId: string, on: boolean) => {
    setNoticeShown(false);
    setPayError(null);
    const listed = new Set(followers.map((f) => f.fanId));
    setTiers((prev) => {
      // 지금 목록에 없는 팬의 기록은 버린다 — 그 팬이 다시 팔로우해 목록에 돌아왔을 때 예전 체크가 되살아나 10명을 넘지 않게
      const next = new Map([...prev].filter(([id]) => listed.has(id)));
      if (!on) next.delete(fanId);
      else if (next.size < MAX_REVGIFT_SHARES) next.set(fanId, "small");
      return next;
    });
  };

  const setTier = (fanId: string, tier: PricedTier) => {
    setTiers((prev) => new Map(prev).set(fanId, tier));
  };

  const pay = async () => {
    if (!consented) {
      setPayError(PAYMENT_CONSENT_MISSING);
      document.getElementById("rv-consent")?.focus();
      return;
    }
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
  // 결제 띠의 겹친 얼굴 — 목록 순서로 앞의 여섯, 나머지는 「+N」
  const shownFaces = picked.slice(0, FACES_SHOWN);
  const moreFaces = picked.length - shownFaces.length;

  return (
    <div>
      <section id="count" aria-labelledby="rv-add-title">
        <h2 className={s.secH} id="rv-add-title">
          받을 팬 고르기
        </h2>
        <p className={s.lead}>나를 팔로우하는 팬이에요. 받을 팬을 체크해 주세요.</p>
        <div role="alert">
          {notice && noticeShown ? (
            <p className={`${s.errline} ${s.notice}`}>
              <i aria-hidden="true">!</i>
              {notice}
            </p>
          ) : null}
        </div>
        <p className={s.maxline} id="rv-fans-max" aria-live="polite">
          {full ? `${MAX_REVGIFT_SHARES}명을 모두 골랐어요. 더 보내려면 결제한 뒤 새로 보내 주세요.` : `최대 ${MAX_REVGIFT_SHARES}명까지 한 번에 보낼 수 있어요`}
        </p>
        {followers.length > 0 ? (
          <fieldset className="fs">
            <legend className="sr-only">받을 팬</legend>
            <ul className={s.grid}>
              {followers.map((f, i) => {
                const tier = tiers.get(f.fanId);
                // 10명을 다 골랐으면 남은 칸은 잠근다 — disabled 대신 aria-disabled 로 포커스는 남기고 누름만 무시한다(design-rules 2절)
                const locked = !tier && full;
                return (
                  <li key={f.fanId} className={[s.fan, tier ? s.on : "", locked ? s.locked : ""].filter(Boolean).join(" ")}>
                    <label className={s.pick}>
                      <input
                        type="checkbox"
                        checked={tier !== undefined}
                        aria-disabled={locked || undefined}
                        aria-describedby="rv-fans-max"
                        // 잠긴 칸을 눌러도(스페이스도) toggle 이 10명 넘게 담지 않는다 — 제어 입력이라 체크 표시도 그대로 돌아간다
                        onChange={(e) => toggle(f.fanId, e.currentTarget.checked)}
                      />
                      <FaceAvatar index={i} className={`face ${s.face}`} />
                      {/* 닉네임은 최대 20자 — 칸이 좁으면 말줄임, 전체는 title 로 본다 */}
                      <span className={s.nick} title={f.nickname}>
                        {f.nickname}
                      </span>
                    </label>
                    {tier ? (
                      <fieldset className={`fs ${s.sizeSet}`}>
                        <legend className="sr-only">{f.nickname}님께 보낼 상자 크기</legend>
                        <div className={s.sizes}>
                          {TIERS.map((t) => (
                            <label key={t.tier} className={s.sz}>
                              <input type="radio" name={`rv-size-${f.fanId}`} value={t.tier} checked={tier === t.tier} onChange={() => setTier(f.fanId, t.tier)} />
                              <b>{t.name}</b>
                              <span>{won(unitKrw(t.tier))}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ) : (
          <p className={s.none}>아직 나를 팔로우한 팬이 없어요. 팬이 팔로우하면 여기에 나와요.</p>
        )}
      </section>

      {/* 진행 순서와 상자 크기·닉네임 안내를 회색 칸 하나로(시안 .gnote.howcard) */}
      <div className={s.how}>
        <h2 className={s.howH} id="rv-how-title">
          이렇게 진행돼요
        </h2>
        <ol className={s.steps} aria-labelledby="rv-how-title">
          <li>
            <span className={s.nb} aria-hidden="true">
              1
            </span>
            <div>
              <strong>팬이 「받기」를 누를 때 주소를 직접 입력해요</strong>
              <p>크리에이터에게는 팬의 주소가 보이지 않아요.</p>
            </div>
          </li>
          <li>
            <span className={s.nb} aria-hidden="true">
              2
            </span>
            <div>
              <strong>결제하면 팬마다 받는 주소가 안내돼요</strong>
              <p>팬마다 상자를 따로 포장해서, 그 팬의 받는 주소를 끝까지 그대로 써서 보내 주세요.</p>
            </div>
          </li>
          <li>
            <span className={s.nb} aria-hidden="true">
              3
            </span>
            <div>
              <strong>7일 안에 받지 않으면 그 상자만 돌려보내고 환불해요</strong>
              <p>한 팬이 받지 않아도 다른 팬의 선물은 그대로 가요.</p>
            </div>
          </li>
        </ol>
        <hr className={s.rule} />
        {followers.length > 0 ? <p>{SIZE_NOTE}</p> : null}
        <p>팬 목록에는 팬의 닉네임만 보여요. 팬의 주소와 연락처는 보이지 않아요.</p>
      </div>

      {/* 화면 아래에 붙어 따라오는 하늘 결제 띠(시안 .tray) — 받을 팬 수 · 결제 금액 · 동의와 결제 */}
      <section className={s.tray} aria-labelledby="rv-pay-title">
        <div className={s.cnt}>
          <p id="rv-fans-title">
            <span className={s.lab}>받을 팬</span>{" "}
            <span className={`num-big ${s.num}`}>
              {picked.length}
              <small>명</small>
            </span>
          </p>
          <div className={s.faces} aria-hidden="true">
            {shownFaces.map((p) => (
              <FaceAvatar key={p.fanId} index={p.index} className={`face ${s.mini}`} />
            ))}
            {moreFaces > 0 ? <span className={`face ${s.mini} ${s.moreFace}`}>+{moreFaces}</span> : null}
          </div>
        </div>
        <div className={s.mid}>
          <h2 className={s.payH} id="rv-pay-title">
            결제 금액
          </h2>
          <div className={s.lines}>
            {counts.map((t) => (
              <p key={t.tier} className={s.ln}>
                <span>
                  {t.name} 상자 × {t.count}
                </span>
                <span className={s.amt}>{won(unitKrw(t.tier) * t.count)}</span>
              </p>
            ))}
            <p className={s.tot}>
              <span>합계</span>
              <strong>
                {total.toLocaleString("ko-KR")}
                <small>원</small>
              </strong>
            </p>
          </div>
          <p className={s.inc}>배송비와 검수 포함</p>
        </div>
        <div className={s.rt}>
          <div className={s.consent}>
            <PaymentConsent
              id="rv-consent"
              checked={consented}
              invalid={!consented && payError === PAYMENT_CONSENT_MISSING}
              errorId="rv-pay-error"
              onChange={(v) => {
                setConsented(v);
                if (v && payError === PAYMENT_CONSENT_MISSING) setPayError(null);
              }}
            />
          </div>
          <div role="alert">
            {payError ? (
              <p className={s.errline} id="rv-pay-error">
                <i aria-hidden="true">!</i>
                {payError}
              </p>
            ) : null}
          </div>
          <button className={`btn btn--block ${s.payBtn}`} type="button" onClick={pay} disabled={picked.length === 0} aria-busy={paying || undefined}>
            {won(total)} 결제하기
          </button>
          <p className={s.after}>결제는 한 번이에요. 팬이 받지 않으면 그 팬의 상자 요금만 환불돼요.</p>
        </div>
      </section>
    </div>
  );
}
