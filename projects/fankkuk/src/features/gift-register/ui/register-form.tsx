"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { ChargeBreakdown } from "@/entities/payment/model/charge";
import { formatDuration } from "@/shared/lib/format/datetime";
import s from "@/shared/ui/screen.module.css";
import { MAX_BOX_COUNT, registerFormSchema, type RegisterFormOutput, type RegisterFormValues } from "../model/register-input";

export type CreatorOption = { id: string; name: string; channel: string; averageApprovalMinutes: number | null };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

// 선물 등록 폼. 지금은 예시 — 제출해도 결제·저장을 하지 않고 완료 모습만 보여 준다.
// 결제는 등록 때 받는다(결제 스펙). 실제 연결 때 제출이 /api/checkout 으로 이어진다.
export function RegisterForm({ creators, charge }: { creators: readonly CreatorOption[]; charge: ChargeBreakdown }) {
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
    formState: { errors },
  } = useForm<RegisterFormValues, unknown, RegisterFormOutput>({
    resolver: zodResolver(registerFormSchema),
    // 전자기기 신고는 기본값이 없다 — 팬이 직접 골라야 한다
    defaultValues: { creatorId: "", itemKind: "", boxCount: "1" },
  });
  const boxCount = Number(useWatch({ control, name: "boxCount" }));

  if (done) {
    return (
      <div className={s["card-tint"]}>
        <span className={s.pill}>등록 완료</span>
        <h2 ref={doneTitle} tabIndex={-1} style={{ marginTop: 12 }}>크리에이터의 승인을 기다려요</h2>
        <p className={s.lead}>
          승인되면 알림톡으로 알려 드리고, 그때 사무실 주소가 열려요. 승인 전에는 선물을 보내지 마세요.
        </p>
        <p className={s.lead}>예시 화면이라 실제 결제와 등록은 하지 않았어요.</p>
        <div style={{ marginTop: 24 }}>
          <Link className={s.button} href="/gifts">
            내 선물 보기
          </Link>
        </div>
      </div>
    );
  }

  const err = (id: string, message: string | undefined) =>
    message ? (
      <p className={s.error} id={id} role="alert">
        {message}
      </p>
    ) : null;

  return (
    <form className={s.stack} style={{ gap: 32 }} onSubmit={handleSubmit(() => setDone(true))} noValidate>
      <fieldset className={s.field} aria-describedby={errors.creatorId ? "creator-error" : undefined}>
        <legend className={s.label} style={{ marginBottom: 8 }}>
          누구에게 보낼까요?
        </legend>
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

      <div className={s.field}>
        <label className={s.label} htmlFor="boxCount">
          상자는 몇 개인가요?
        </label>
        <p className={s.hint} id="boxCount-hint">
          상자마다 번호가 따로 붙고, 승인은 한 번에 받아요. 한 번에 {MAX_BOX_COUNT}개까지.
        </p>
        <input
          id="boxCount"
          className={s.input}
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={errors.boxCount ? true : undefined}
          aria-describedby={errors.boxCount ? "boxCount-hint boxCount-error" : "boxCount-hint"}
          {...register("boxCount")}
        />
        {err("boxCount-error", errors.boxCount?.message)}
      </div>

      <fieldset className={s.field} aria-describedby={errors.electronicsOrMetal ? "em-hint em-error" : "em-hint"}>
        <legend className={s.label}>전자기기 또는 금속 제품이 들어 있나요?</legend>
        <p className={s.hint} id="em-hint" style={{ marginTop: 8 }}>
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
        <h2 id="charge-title" style={{ fontSize: 18 }}>
          결제 금액
        </h2>
        <dl className={s.rows} style={{ marginTop: 16 }}>
          <div>
            <dt>검수·전달 서비스료</dt>
            <dd>{won(charge.serviceFeeKrw)}</dd>
          </div>
          <div>
            <dt>배송비 실비</dt>
            <dd>{won(charge.shippingFeeKrw)}</dd>
          </div>
          <div className={s.divider}>
            <dt>합계</dt>
            <dd style={{ fontSize: 22, color: "var(--brand)" }}>{won(charge.totalKrw)}</dd>
          </div>
        </dl>
        {/* 여러 상자 요금은 결정 대기(fankkuk-20261001-1-d7). 정해지면 computeCharge 에 상자 수를 넣는다 */}
        <p className={s.hint} style={{ marginTop: 16 }}>
          검수가 빠진 요금은 없어요. 선물이 사무실에 도착하기 전에 거절되면 전액 돌려드려요.
        </p>
        {/* 상자 수를 바꾸면 안내가 생겼다 사라진다 — 알림 칸은 늘 그려 두고 내용만 바꾼다 */}
        <p className={s.note} style={{ marginTop: boxCount > 1 ? 12 : 0 }} role="status">
          {boxCount > 1 ? "상자가 여러 개일 때 요금은 아직 정하지 않았어요. 지금 금액은 1상자 기준이에요." : ""}
        </p>
      </section>

      <div className={s.stack}>
        <button type="submit" className={s.button}>
          결제하고 등록하기
        </button>
        <p className={s.hint} style={{ textAlign: "center" }}>
          승인되면 사무실 주소를 알려 드려요. 그 전에는 보내지 마세요.
        </p>
      </div>
    </form>
  );
}
