"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { OVERSIZE_RULE, PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { BILLABLE_TIERS, TIER_PRICE_KRW, type BillableTier } from "@/entities/payment/config/tier-pricing";
import { formatDuration } from "@/shared/lib/format/datetime";
import s from "@/shared/ui/screen.module.css";
import { summarizeBoxes } from "../model/box-summary";
import { MAX_BOX_COUNT, registerFormSchema, type RegisterFormOutput, type RegisterFormValues } from "../model/register-input";
import f from "./register-form.module.css";

export type CreatorOption = { id: string; name: string; channel: string; averageApprovalMinutes: number | null };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const COUNT_FIELD = { small: "smallCount", medium: "mediumCount" } as const;

// 선물 등록 폼. 지금은 예시 — 제출해도 결제·저장을 하지 않고 완료 모습만 보여 준다.
// 결제는 등록 때 받는다(결제 스펙). 화면의 금액은 결제와 같은 계산(chargeLines)을 쓰지만,
// 실제 결제 금액은 서버가 상자 구간으로 다시 계산한다(INV-M1) — 이 화면의 숫자는 안내일 뿐이다.
export function RegisterForm({ creators }: { creators: readonly CreatorOption[] }) {
  const [done, setDone] = useState(false);
  const doneTitle = useRef<HTMLHeadingElement>(null);
  // 제출하면 폼이 완료 카드로 바뀌어 제출 버튼이 사라진다 — 포커스를 완료 제목으로 옮긴다
  useEffect(() => {
    if (done) doneTitle.current?.focus();
  }, [done]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormValues, unknown, RegisterFormOutput>({
    resolver: zodResolver(registerFormSchema),
    // 전자기기 신고는 기본값이 없다 — 팬이 직접 골라야 한다
    defaultValues: { creatorId: "", itemKind: "", smallCount: "1", mediumCount: "0" },
  });
  const summary = summarizeBoxes({
    small: useWatch({ control, name: "smallCount" }),
    medium: useWatch({ control, name: "mediumCount" }),
  });

  if (done) {
    return (
      <div className={s["card-tint"]}>
        <span className={s.pill}>등록 완료</span>
        <h2 ref={doneTitle} tabIndex={-1} className={f["done-title"]}>
          크리에이터의 승인을 기다려요
        </h2>
        <p className={s.lead}>승인되면 알림톡으로 알려 드리고, 그때 사무실 주소가 열려요. 승인 전에는 선물을 보내지 마세요.</p>
        <p className={s.lead}>예시 화면이라 실제 결제와 등록은 하지 않았어요.</p>
        <Link className={`${s.button} ${f.gap}`} href="/gifts">
          내 선물 보기
        </Link>
      </div>
    );
  }

  const err = (id: string, message: string | undefined) =>
    message ? (
      <p className={s.error} id={id} role="alert">
        {message}
      </p>
    ) : null;

  // 끝에 닿은 버튼은 disabled 대신 aria-disabled 로 둔다 — disabled 가 되면 키보드 포커스가 사라진다
  const step = (tier: BillableTier, delta: 1 | -1) => {
    if (delta > 0 ? !summary.canAdd : !summary.canRemove[tier]) return;
    const hasCountError = errors.smallCount !== undefined || errors.mediumCount !== undefined;
    setValue(COUNT_FIELD[tier], String(summary.counts[tier] + delta), { shouldValidate: hasCountError });
  };

  return (
    <form className={`${s.stack} ${f.form}`} onSubmit={handleSubmit(() => setDone(true))} noValidate>
      <fieldset className={s.field} aria-describedby={errors.creatorId ? "creator-error" : undefined}>
        <legend className={`${s.label} ${f.legend}`}>누구에게 보낼까요?</legend>
        <div className={s.choices}>
          {creators.map((c) => (
            <label key={c.id} className={s.choice}>
              <input type="radio" value={c.id} {...register("creatorId")} />
              <span className={s["choice-mark"]} aria-hidden="true" />
              <span className={s["choice-body"]}>
                <span className={s["choice-title"]}>
                  {c.name} <span className={s.muted}>· {c.channel}</span>
                </span>
                <span className={s["choice-sub"]}>
                  {c.averageApprovalMinutes === null
                    ? "아직 승인 기록이 없어요"
                    : `보통 ${formatDuration(c.averageApprovalMinutes)} 안에 승인해요`}
                </span>
              </span>
            </label>
          ))}
        </div>
        {err("creator-error", errors.creatorId?.message)}
      </fieldset>

      <div className={s.field}>
        <label className={s.label} htmlFor="itemKind">
          어떤 선물인가요?
        </label>
        <p className={s.hint} id="itemKind-hint">
          크리에이터가 승인할 때 이 내용을 봐요.
        </p>
        <input
          id="itemKind"
          className={s.input}
          placeholder="예: 손뜨개 인형과 편지"
          aria-invalid={errors.itemKind ? true : undefined}
          aria-describedby={errors.itemKind ? "itemKind-hint itemKind-error" : "itemKind-hint"}
          {...register("itemKind")}
        />
        {err("itemKind-error", errors.itemKind?.message)}
      </div>

      <fieldset className={s.field} aria-describedby={errors.smallCount ? "box-hint box-error" : "box-hint"}>
        <legend className={s.label}>상자 크기와 개수</legend>
        <p className={`${s.hint} ${f["legend-gap"]}`} id="box-hint">
          세 변 길이의 합과 무게 중 큰 쪽 구간으로 골라 주세요. 상자마다 번호가 붙고, 승인은 한 번에 받아요. 모두 합쳐{" "}
          {MAX_BOX_COUNT}개까지.
        </p>
        <div className={s.choices}>
          {BILLABLE_TIERS.map((tier) => {
            const field = COUNT_FIELD[tier];
            const guide = PARCEL_TIER_GUIDE[tier];
            const id = `${tier}-count`;
            return (
              <div key={tier} className={f.tier}>
                <div className={s["choice-body"]}>
                  <label className={s["choice-title"]} htmlFor={id}>
                    {guide.name} {won(TIER_PRICE_KRW[tier])}
                  </label>
                  <span className={s["choice-sub"]}>{guide.rule}</span>
                </div>
                <div className={f.stepper}>
                  <button
                    type="button"
                    className={f["step-button"]}
                    aria-label={`${guide.name} 상자 하나 빼기`}
                    aria-disabled={!summary.canRemove[tier]}
                    onClick={() => step(tier, -1)}
                  >
                    −
                  </button>
                  <input
                    id={id}
                    className={f["step-input"]}
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`${guide.name} 상자 개수`}
                    aria-invalid={errors.smallCount || errors[field] ? true : undefined}
                    aria-describedby={errors.smallCount || errors.mediumCount ? "box-error" : undefined}
                    {...register(field)}
                  />
                  <button
                    type="button"
                    className={f["step-button"]}
                    aria-label={`${guide.name} 상자 하나 더하기`}
                    aria-disabled={!summary.canAdd}
                    onClick={() => step(tier, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {err("box-error", errors.smallCount?.message ?? errors.mediumCount?.message)}
        <ul className={f.rules} role="list">
          <li>도착해서 재 보니 신고보다 큰 구간이면 차액을 따로 요청드려요. 차액을 내셔야 출고돼요.</li>
          <li>재 보니 더 작아도 차액은 돌려드리지 않아요.</li>
          <li>{OVERSIZE_RULE}는 받지 않아요.</li>
        </ul>
      </fieldset>

      <fieldset className={s.field} aria-describedby={errors.electronicsOrMetal ? "em-hint em-error" : "em-hint"}>
        <legend className={s.label}>전자기기 또는 금속 제품이 들어 있나요?</legend>
        <p className={`${s.hint} ${f["legend-gap"]}`} id="em-hint">
          검수할 때 참고해요. 정확히 알려 주시면 검수가 빨라져요.
        </p>
        <div className={s["choices-inline"]}>
          <label className={s.choice}>
            <input type="radio" value="yes" {...register("electronicsOrMetal")} />
            <span className={s["choice-mark"]} aria-hidden="true" />
            <span className={s["choice-title"]}>들어 있어요</span>
          </label>
          <label className={s.choice}>
            <input type="radio" value="no" {...register("electronicsOrMetal")} />
            <span className={s["choice-mark"]} aria-hidden="true" />
            <span className={s["choice-title"]}>없어요</span>
          </label>
        </div>
        {err("em-error", errors.electronicsOrMetal?.message)}
      </fieldset>

      <section className={s.card} aria-labelledby="charge-title">
        <h2 id="charge-title" className={f["card-title"]}>
          결제 금액
        </h2>
        {/* 요금은 배송비를 포함한 한 금액(사용자 결정 d7) — 서비스료·배송비 나눔은 기록에만 있다 */}
        <dl className={`${s.rows} ${f.gap}`}>
          {summary.lines.map((l) => (
            <div key={l.tier}>
              <dt>
                {PARCEL_TIER_GUIDE[l.tier].name} {won(l.unitKrw)} × {l.count}
              </dt>
              <dd>{won(l.subtotalKrw)}</dd>
            </div>
          ))}
          <div className={s.divider}>
            <dt>합계</dt>
            <dd className={f.total}>
              <span className={s.pill}>추적 장치 검수 포함</span>
              {/* 바뀌는 것은 합계뿐이라 낭독도 합계만 — 표 전체를 다시 읽지 않게 */}
              <span className={f.amount} aria-live="polite" aria-atomic="true">
                {summary.totalKrw !== null ? won(summary.totalKrw) : summary.overLimit ? `${MAX_BOX_COUNT}개 초과` : "—"}
              </span>
            </dd>
          </div>
        </dl>
        <p className={`${s.hint} ${f.gap}`}>배송비까지 포함한 금액이에요. 선물이 사무실에 도착하기 전에 거절되면 전액 돌려드려요.</p>
      </section>

      <div className={s.stack}>
        <button type="submit" className={s.button}>
          결제하고 등록하기
        </button>
        <p className={`${s.hint} ${f.center}`}>승인되면 사무실 주소를 알려 드려요. 그 전에는 보내지 마세요.</p>
      </div>
    </form>
  );
}
