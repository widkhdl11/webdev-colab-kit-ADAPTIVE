"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { matchesCreatorQuery, type CreatorCard } from "@/entities/creator/model/creator-card";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { RETURN_ON_REJECT_NOTICE } from "@/entities/order/ui/fan-stage-copy";
import { OVERSIZE_RULE, PARCEL_TIER_GUIDE, RETURN_ON_INSPECTION_NOTICE } from "@/entities/parcel/model/size-tier";
import { PRICE_CHANGED_MESSAGE, PRICED_TIERS, type PricedTier, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { formatDuration } from "@/shared/lib/format/datetime";
import { summarizeBoxes } from "../model/box-summary";
import { MAX_BOX_COUNT, registerFormSchema, type RegisterFormOutput, type RegisterFormValues } from "../model/register-input";
import f from "./register-form.module.css";

/** 고를 수 있는 크리에이터 한 명. 소개 칸(분야·채널 이름·로마자 이름)이 없으면 목록 한 줄에 플랫폼 이름만 보인다. */
export type CreatorOption = Pick<CreatorCard, "id" | "name" | "platform" | "approvalMinutes"> &
  Partial<Pick<CreatorCard, "category" | "channelTitle" | "alias">>;

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const COUNT_FIELD = { small: "smallCount", medium: "mediumCount", large: "largeCount" } as const;

type StepNo = 1 | 2 | 3 | 4;
const STEP_NOS: readonly StepNo[] = [1, 2, 3, 4];
const STEP_LABEL: Record<StepNo, string> = { 1: "크리에이터", 2: "선물", 3: "상자", 4: "결제" };
/** 「다음」을 누르면 그 단계 칸만 검증한다. 4단계(결제)는 제출 때 전체를 다시 검증한다. */
const STEP_FIELDS: Record<Exclude<StepNo, 4>, (keyof RegisterFormValues)[]> = {
  1: ["creatorId"],
  2: ["itemKind", "electronicsOrMetal"],
  3: ["smallCount", "mediumCount", "largeCount"],
};


/** 등록이 끝나 결제창으로 넘길 값. 금액은 서버가 계산한 것이다. */
export type RegisteredGift = { orderId: string; orderNo: string; amountKrw: number };

type RegisterResponse = Partial<RegisteredGift> & { message?: string };

// 선물 보내기 4단계(크리에이터·선물·상자·결제 확인). 「결제하기」를 누르면 서버(/api/gifts)에 등록하고 결제창으로 넘긴다.
// 결제는 등록 때 받는다(결제 스펙). 화면의 금액은 결제와 같은 계산(chargeLines)에 화면을 열 때 읽은 공개 요금표(prices)를 넣은 안내다.
// 등록 요청에 이 화면이 보여 준 합계(quotedTotalKrw)를 같이 보내고, 서버는 등록 순간의 요금표로 다시 계산한 합계와 비교만 한다 —
// 결제 금액은 서버 계산값이다(INV-M1·K3). 다르면(화면을 연 뒤 요금이 바뀌었으면) 서버가 409 로 거부하고,
// 화면은 문구를 띄운 뒤 서버 page 를 다시 그려 새 요금표로 금액을 고쳐 보여 준다. 다시 누르면 새 합계로 보낸다.
// 보내는 사람은 서버가 로그인 세션으로 정한다(INV-L3) — 이 폼은 사용자 칸을 보내지 않는다.
export function RegisterForm({
  creators,
  prices,
  initialCreatorId = "",
  notice,
  onRegistered,
}: {
  creators: readonly CreatorOption[];
  /** 지금 공개 요금표(받는 값만) — 서버 page 가 DB 공개 읽기 함수로 읽어 넘긴다. */
  prices: PublicPriceTable;
  /** 크리에이터 화면에서 넘어오면 그 사람을 미리 골라 둔다 */
  initialCreatorId?: string;
  /** 결제창에서 돌아온 실패 안내 */
  notice?: string;
  onRegistered: (gift: RegisteredGift) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<StepNo>(1);
  const [reached, setReached] = useState<StepNo>(1);
  const [query, setQuery] = useState("");
  const [submitError, setSubmitError] = useState<{ message: string; needsLogin: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 다시 그려지기 전에 Enter·클릭이 연달아 와도 한 번만 보내게 — state 는 다음 그리기까지 옛 값이다
  const submittingRef = useRef(false);
  const [noticeShown, setNoticeShown] = useState(true);

  const stepsWrap = useRef<HTMLElement>(null);
  const headings = useRef<Partial<Record<StepNo, HTMLHeadingElement | null>>>({});
  const pendingFocus = useRef(false);

  // 단계가 바뀌면 새 단계 제목으로 포커스 — 화면 낭독기가 바뀐 내용을 처음부터 읽게
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    headings.current[step]?.focus({ preventScroll: true });
    stepsWrap.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [step]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<RegisterFormValues, unknown, RegisterFormOutput>({
    resolver: zodResolver(registerFormSchema),
    // 전자기기 신고는 기본값이 없다 — 팬이 직접 골라야 한다
    defaultValues: { creatorId: initialCreatorId, itemKind: "", smallCount: "1", mediumCount: "0", largeCount: "0" },
  });
  const creatorId = useWatch({ control, name: "creatorId" });
  const itemKind = useWatch({ control, name: "itemKind" }) ?? "";
  const metal = useWatch({ control, name: "electronicsOrMetal" });
  const summary = summarizeBoxes(prices, {
    small: useWatch({ control, name: "smallCount" }),
    medium: useWatch({ control, name: "mediumCount" }),
    large: useWatch({ control, name: "largeCount" }),
  });

  const go = (n: StepNo) => {
    pendingFocus.current = true;
    setStep(n);
    setReached((r) => (n > r ? n : r));
  };

  const next = async () => {
    if (step === 4) return;
    const ok = await trigger(STEP_FIELDS[step], { shouldFocus: true });
    if (ok) go((step + 1) as StepNo);
  };

  // 지난 단계로 돌아가 칸을 비운 뒤 결제로 건너뛴 경우 — 오류가 있는 첫 단계로 보낸다
  const onInvalid = (errs: Partial<Record<keyof RegisterFormValues, unknown>>) => {
    const first = ([1, 2, 3] as const).find((n) => STEP_FIELDS[n].some((k) => errs[k] !== undefined));
    if (first) go(first);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    // 4단계 전에는 Enter 가 「다음」과 같다 — 결제 확인 화면을 건너뛰고 제출되지 않게
    if (step < 4) {
      e.preventDefault();
      void next();
      return;
    }
    void handleSubmit(() => submit(), onInvalid)(e);
  };

  // 검증을 통과한 폼 값(문자열 그대로)과 화면이 보여 준 합계를 보낸다 — 서버가 같은 입력 경계(parseRegisterInput)로 다시 검사하고,
  // 합계는 등록 순간 요금표로 계산한 값과 비교만 한다(INV-K3).
  const submit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setNoticeShown(false);
    try {
      const { creatorId, itemKind, smallCount, mediumCount, largeCount, electronicsOrMetal } = getValues();
      const res = await fetch("/api/gifts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creatorId, itemKind, smallCount, mediumCount, largeCount, electronicsOrMetal, quotedTotalKrw: summary.totalKrw }),
      });
      const body = (await res.json().catch(() => ({}))) as RegisterResponse;
      if (res.ok && body.orderId && body.orderNo && typeof body.amountKrw === "number") {
        onRegistered({ orderId: body.orderId, orderNo: body.orderNo, amountKrw: body.amountKrw });
        return;
      }
      if (res.status === 401) setSubmitError({ message: "로그인하면 선물을 보낼 수 있어요.", needsLogin: true });
      else if (res.status === 403) setSubmitError({ message: body.message ?? "팬 계정으로 로그인해 주세요.", needsLogin: false });
      else if (res.status === 409) {
        // 화면을 연 뒤 요금이 바뀌었다(INV-K3) — 서버 page 를 다시 그려 새 요금표로 금액을 보여 준다. 고른 값은 그대로 남는다
        setSubmitError({ message: body.message ?? PRICE_CHANGED_MESSAGE, needsLogin: false });
        router.refresh();
      }
      else setSubmitError({ message: "입력한 내용을 다시 확인해 주세요.", needsLogin: false });
    } catch {
      setSubmitError({ message: "등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.", needsLogin: false });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // 끝에 닿은 버튼은 disabled 대신 aria-disabled 로 둔다 — disabled 가 되면 키보드 포커스가 사라진다
  const changeCount = (tier: PricedTier, delta: 1 | -1) => {
    if (delta > 0 ? !summary.canAdd : !summary.canRemove[tier]) return;
    const hasCountError = errors.smallCount !== undefined || errors.mediumCount !== undefined || errors.largeCount !== undefined;
    setValue(COUNT_FIELD[tier], String(summary.counts[tier] + delta));
    // 합계 오류(하나 이상·10개까지)는 smallCount 칸에 붙는다 — 어느 칸을 바꿨든 세 칸을 같이 다시 검증해야 지난 오류가 사라진다
    if (hasCountError) void trigger(["smallCount", "mediumCount", "largeCount"]);
  };

  // 크리에이터 찾기 화면과 같은 검색 규칙(이름·로마자 이름·분야·채널 이름·플랫폼)
  const matches = creators.filter((c) => matchesCreatorQuery(c, query));
  const picked = creators.find((c) => c.id === creatorId);
  const metalText = metal === "yes" ? "네, 있어요" : metal === "no" ? "아니요, 없어요" : "아직 안 골랐어요";
  const boxesText =
    PRICED_TIERS.filter((t) => summary.counts[t] > 0)
      .map((t) => `${PARCEL_TIER_GUIDE[t].name} ${summary.counts[t]}개`)
      .join(" · ") || "없음";
  const totalText = summary.totalKrw !== null ? won(summary.totalKrw) : summary.overLimit ? `${MAX_BOX_COUNT}개 초과` : "—";
  const boxError = errors.smallCount?.message ?? errors.mediumCount?.message ?? errors.largeCount?.message;

  const err = (id: string, message: string | undefined) =>
    message ? (
      <p className={f.error} id={id} role="alert">
        {message}
      </p>
    ) : null;

  const heading = (n: StepNo, text: string) => (
    <h2
      id={`h-${n}`}
      tabIndex={-1}
      ref={(el) => {
        headings.current[n] = el;
      }}
    >
      {text}
    </h2>
  );

  const fix = (n: StepNo, label: string) => (
    <button className={f.fix} type="button" aria-label={`${label} 고치기`} onClick={() => go(n)}>
      고치기
    </button>
  );

  return (
    <>
      <nav className={`container ${f["steps-wrap"]}`} aria-label="선물 보내기 단계" ref={stepsWrap}>
        <p className={f["step-count"]}>
          {step} / 4 <span className={f["step-count-unit"]}>단계</span>
        </p>
        <ol className={f.steps}>
          {STEP_NOS.map((n) => {
            const isDone = n !== step && n < reached; // 지나온 단계만 완료 — 아직 넘지 않은 마지막 단계는 숫자 그대로
            return (
              <li key={n}>
                <button
                  className={`${f.st} ${isDone ? f["is-done"] : ""}`}
                  type="button"
                  disabled={n > reached}
                  aria-current={n === step ? "step" : undefined}
                  onClick={() => go(n)}
                >
                  <span className={f.dot} aria-hidden="true">
                    {isDone ? "✓" : n}
                  </span>
                  <span className={f.lbl}>{STEP_LABEL[n]}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className={f["send-section"]}>
        <div className={`container ${f["send-grid"]}`}>
          <form className={f["send-form"]} onSubmit={onSubmit} noValidate aria-label="선물 보내기 입력">
            {/* 1 크리에이터 */}
            <fieldset
              className={f.step}
              hidden={step !== 1}
              aria-describedby={errors.creatorId ? "creator-error" : undefined}
            >
              <legend className="sr-only">받는 크리에이터</legend>
              <div className={f["step-h"]}>
                {heading(1, "누구에게 보낼까요?")}
                <p>본인 확인을 마친 크리에이터만 찾을 수 있어요.</p>
              </div>
              <div className="search search--field">
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
                  <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <label className="sr-only" htmlFor="pick-q">
                  크리에이터 검색
                </label>
                <input
                  id="pick-q"
                  type="search"
                  placeholder="이름이나 채널 이름으로 찾아요"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  // 검색창의 Enter 는 목록만 거른다 — 「다음」으로 넘어가지 않게
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                />
              </div>
              <div className={f["pick-box"]}>
                <div className={f["pick-box-head"]}>
                  <span>크리에이터 목록</span>
                  <p className="hint" role="status" aria-live="polite">
                    {query.trim() ? `검색 결과 ${matches.length}명` : `전체 ${creators.length}명`}
                  </p>
                </div>
                {/* 걸러진 줄은 지우지 않고 숨긴다 — 고른 값이 그대로 남게 */}
                <ul className={f["pick-list"]}>
                  {creators.map((c) => (
                    <li key={c.id} hidden={!matches.includes(c)}>
                      <label className={f.pick}>
                        <input type="radio" value={c.id} {...register("creatorId")} />
                        <span className="avatar" aria-hidden="true">
                          {c.name.slice(0, 1)}
                        </span>
                        <span className={f["pick-text"]}>
                          <strong>{c.name}</strong>
                          <small>
                            {[c.category, c.channelTitle ?? c.platform, approvalTimeText(c.approvalMinutes)]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {matches.length === 0 ? (
                  <p className={f["empty-mini"]} role="status">
                    찾는 크리에이터가 없어요. 본인 확인을 마친 크리에이터만 선택할 수 있어요.
                  </p>
                ) : null}
              </div>
              {err("creator-error", errors.creatorId?.message)}
            </fieldset>

            {/* 2 선물 */}
            <fieldset className={f.step} hidden={step !== 2}>
              <legend className="sr-only">선물 종류와 전자기기·금속 제품 신고</legend>
              <div className={f["step-h"]}>
                {heading(2, "어떤 선물인가요?")}
                <p>크리에이터가 승인할 때 이 내용을 봐요. 검수에서 추적 장치와 구분하는 데도 써요.</p>
              </div>
              <div className="field">
                <label htmlFor="itemKind">선물 종류 (30자까지)</label>
                <input
                  id="itemKind"
                  className="input"
                  type="text"
                  maxLength={30}
                  placeholder="예: 손뜨개 인형과 편지"
                  aria-invalid={errors.itemKind ? true : undefined}
                  aria-describedby={errors.itemKind ? "itemKind-count itemKind-error" : "itemKind-count"}
                  {...register("itemKind")}
                />
                <p className={f["char-count"]} id="itemKind-count">
                  {itemKind.length} / 30자
                </p>
                {err("itemKind-error", errors.itemKind?.message)}
              </div>
              <div
                className={`field ${f.metal}`}
                role="radiogroup"
                aria-labelledby="metal-q"
                aria-describedby={errors.electronicsOrMetal ? "metal-hint metal-error" : "metal-hint"}
              >
                <p className={f["metal-q"]} id="metal-q">
                  전자기기나 금속 제품이 들어 있나요?
                </p>
                <div className={f.radios}>
                  <label>
                    <input type="radio" value="yes" {...register("electronicsOrMetal")} /> 네, 있어요
                  </label>
                  <label>
                    <input type="radio" value="no" {...register("electronicsOrMetal")} /> 아니요, 없어요
                  </label>
                </div>
                <p className="hint" id="metal-hint">
                  검수할 때 참고해요. 신고한 상자는 검수에 시간이 조금 더 걸릴 수 있어요.
                </p>
                {err("metal-error", errors.electronicsOrMetal?.message)}
              </div>
            </fieldset>

            {/* 3 상자 */}
            <section className={f.step} hidden={step !== 3} aria-labelledby="h-3">
              <div className={f["step-h"]}>
                {heading(3, "상자는 몇 개인가요?")}
                <p>상자마다 배송비가 포함돼 있어요. 모두 합쳐 {MAX_BOX_COUNT}개까지 한 번에 보낼 수 있어요.</p>
              </div>
              {PRICED_TIERS.map((tier) => {
                const guide = PARCEL_TIER_GUIDE[tier];
                return (
                  <div key={tier} className={f.counter}>
                    <div>
                      <strong>{guide.name} 상자</strong>
                      <small>
                        {guide.rule} · {won(prices[tier].priceKrw)}
                      </small>
                    </div>
                    <div className={f.qty} role="group" aria-label={`${guide.name} 상자 수`}>
                      <button
                        className={f["qty-btn"]}
                        type="button"
                        aria-label={`${guide.name} 상자 하나 줄이기`}
                        aria-disabled={!summary.canRemove[tier]}
                        onClick={() => changeCount(tier, -1)}
                      >
                        −
                      </button>
                      <output aria-live="polite">{summary.counts[tier]}</output>
                      <button
                        className={f["qty-btn"]}
                        type="button"
                        aria-label={`${guide.name} 상자 하나 늘리기`}
                        aria-disabled={!summary.canAdd}
                        onClick={() => changeCount(tier, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
              {err("box-error", boxError)}
              <div className={f["rule-note"]}>
                <p>
                  <strong>구간은 이렇게 정해져요</strong>
                </p>
                <ul>
                  {PRICED_TIERS.map((tier) => (
                    <li key={tier}>
                      {PARCEL_TIER_GUIDE[tier].name}은 {PARCEL_TIER_GUIDE[tier].rule}예요.
                    </li>
                  ))}
                  <li>크기와 무게 중 큰 쪽으로 정해져요. {OVERSIZE_RULE}는 받지 않아요.</li>
                  <li>도착해서 재 보니 신고보다 큰 구간이면 차액을 따로 요청드려요. 차액을 내셔야 출고돼요.</li>
                  <li>재 보니 더 작아도 차액은 돌려드리지 않아요.</li>
                </ul>
              </div>
            </section>

            {/* 4 확인하고 결제 */}
            <section className={f.step} hidden={step !== 4} aria-labelledby="h-4">
              <div className={`${f["step-h"]} ${f["step-h--tight"]}`}>
                {heading(4, "확인하고 결제해요")}
                <p>맞는지 한 번 더 봐 주세요. 틀린 곳은 「고치기」로 돌아갈 수 있어요.</p>
              </div>
              <dl>
                <div className={f["sum-row"]}>
                  <dt>받는 크리에이터</dt>
                  <dd>{picked ? `${picked.name}님` : "아직 안 골랐어요"}</dd>
                  {fix(1, "받는 크리에이터")}
                </div>
                <div className={f["sum-row"]}>
                  <dt>선물 종류</dt>
                  <dd>{itemKind || "아직 안 적었어요"}</dd>
                  {fix(2, "선물 종류")}
                </div>
                <div className={f["sum-row"]}>
                  <dt>전자기기·금속 제품</dt>
                  <dd>{metalText}</dd>
                  {fix(2, "전자기기·금속 제품 신고")}
                </div>
                <div className={f["sum-row"]}>
                  <dt>상자</dt>
                  <dd>{boxesText}</dd>
                  {fix(3, "상자 수")}
                </div>
              </dl>
              {/* 요금은 배송비를 포함한 한 금액(사용자 결정 d7) — 서비스료·배송비 나눔은 기록에만 있다 */}
              <div className={f["pay-lines"]}>
                {summary.lines.map((l) => (
                  <div key={l.tier} className={f["sum-line"]}>
                    <span>
                      {PARCEL_TIER_GUIDE[l.tier].name} 상자 {l.count}개{" "}
                      <small>
                        {won(l.unitKrw)} × {l.count}
                      </small>
                    </span>
                    <span className={f.amt}>{won(l.subtotalKrw)}</span>
                  </div>
                ))}
              </div>
              <div className={f["sum-total"]}>
                <span>합계</span>
                <span className={f.big}>{totalText}</span>
              </div>
              <p className={f["tag-line"]}>
                <span className="tag tag--brand">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  추적 장치 검수 포함
                </span>
              </p>
              <p className={f["pay-note"]}>
                배송비가 포함된 금액이에요. 선물이 사무실에 도착하기 전에 거절되면 전액 돌려드려요.
              </p>
              {/* 승인을 기다리지 않고 보내는 대신 거절되면 반송비를 뺀다 — 결제 전에 반드시 보이게 조건 없이 둔다(2026-10-02 사용자 결정) */}
              <div className={f["rule-note"]} role="note" aria-labelledby="return-notice-title">
                <p id="return-notice-title">
                  <strong>이럴 때는 돌려보내 드려요</strong>
                </p>
                <p className={f["rule-note-sub"]}>{RETURN_ON_REJECT_NOTICE}</p>
                <p className={f["rule-note-sub"]}>{RETURN_ON_INSPECTION_NOTICE}</p>
              </div>
              {picked ? (
                <div className={f["rule-note"]}>
                  <p>
                    <strong>
                      {picked.approvalMinutes === null
                        ? `${picked.name}님은 아직 승인 기록이 없어요`
                        : `${picked.name}님은 보통 ${formatDuration(picked.approvalMinutes)} 안에 승인해요`}
                    </strong>
                  </p>
                  <p className={f["rule-note-sub"]}>
                    결제하면 바로 사무실 주소를 알려 드려요. 승인을 기다리지 말고 보내 주세요 — 크리에이터는 출고 전에 카카오톡
                    인증서로 선물마다 직접 승인해요.
                  </p>
                </div>
              ) : null}
            </section>

            {step === 4 && submitError ? (
              <p className={f.error} role="alert">
                {submitError.message}
                {submitError.needsLogin ? (
                  <>
                    {" "}
                    <Link href="/login">로그인하기</Link>
                  </>
                ) : null}
              </p>
            ) : null}
            {notice && noticeShown ? (
              <p className={f.error} role="alert">
                {notice}
              </p>
            ) : null}
            <div className={`${f["step-actions"]} ${step === 1 ? f["no-prev"] : ""}`}>
              {step > 1 ? (
                <button className="btn btn--line" type="button" onClick={() => go((step - 1) as StepNo)}>
                  이전
                </button>
              ) : null}
              {step < 4 ? (
                <button key="next" className={`btn ${f.next}`} type="button" onClick={() => void next()}>
                  다음
                </button>
              ) : (
                <button key="pay" className={`btn ${f.next}`} type="submit" aria-disabled={submitting} aria-busy={submitting || undefined}>
                  {summary.totalKrw !== null ? `${won(summary.totalKrw)} 결제하기` : "결제하기"}
                </button>
              )}
            </div>
          </form>

          <aside className={f.summary} aria-labelledby="sum-title">
            <h2 id="sum-title">지금까지 고른 것</h2>
            {/* 지난 단계만큼 채운다 */}
            <dl className={f["summary-rows"]}>
              <div className={f["sum-row"]}>
                <dt>크리에이터</dt>
                <dd>{picked ? `${picked.name}님` : "아직 안 골랐어요"}</dd>
              </div>
              {step >= 2 ? (
                <>
                  <div className={f["sum-row"]}>
                    <dt>선물 종류</dt>
                    <dd>{itemKind || "아직 안 적었어요"}</dd>
                  </div>
                  <div className={f["sum-row"]}>
                    <dt>전자기기·금속</dt>
                    <dd>{metalText}</dd>
                  </div>
                </>
              ) : null}
              {step >= 3 ? (
                <div className={f["sum-row"]}>
                  <dt>상자</dt>
                  <dd>{boxesText}</dd>
                </div>
              ) : null}
            </dl>
            {step >= 3 ? (
              <>
                <div className={f["sum-total"]}>
                  <span>합계</span>
                  <span className={f.big}>{totalText}</span>
                </div>
                <p className={f["summary-note"]}>배송비 포함 · 추적 장치 검수 포함</p>
              </>
            ) : null}
          </aside>
        </div>
      </section>
    </>
  );
}
