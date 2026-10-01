"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { OVERSIZE_RULE, PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { BILLABLE_TIERS, TIER_PRICE_KRW, type BillableTier } from "@/entities/payment/config/tier-pricing";
import { formatDuration } from "@/shared/lib/format/datetime";
import { summarizeBoxes } from "../model/box-summary";
import { MAX_BOX_COUNT, registerFormSchema, type RegisterFormOutput, type RegisterFormValues } from "../model/register-input";
import f from "./register-form.module.css";

export type CreatorOption = {
  id: string;
  name: string;
  channel: string;
  averageApprovalMinutes: number | null;
  /** 목록 한 줄 설명과 검색에 쓰는 소개 칸 — 없으면 플랫폼 이름만 보인다 */
  category?: string;
  channelTitle?: string;
  alias?: string;
};

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const COUNT_FIELD = { small: "smallCount", medium: "mediumCount" } as const;

type StepNo = 1 | 2 | 3 | 4;
const STEP_NOS: readonly StepNo[] = [1, 2, 3, 4];
const STEP_LABEL: Record<StepNo, string> = { 1: "크리에이터", 2: "선물", 3: "상자", 4: "결제" };
/** 「다음」을 누르면 그 단계 칸만 검증한다. 4단계(결제)는 제출 때 전체를 다시 검증한다. */
const STEP_FIELDS: Record<Exclude<StepNo, 4>, (keyof RegisterFormValues)[]> = {
  1: ["creatorId"],
  2: ["itemKind", "electronicsOrMetal"],
  3: ["smallCount", "mediumCount"],
};

const norm = (v: string) => v.toLowerCase().replace(/\s+/g, "");
const approvalText = (m: number | null) => (m === null ? "아직 승인 기록이 없어요" : `평균 승인 ${formatDuration(m)}`);

// 선물 보내기 4단계(크리에이터·선물·상자·결제 확인). 지금은 예시 — 제출해도 결제·저장을 하지 않고 완료 모습만 보여 준다.
// 결제는 등록 때 받는다(결제 스펙). 화면의 금액은 결제와 같은 계산(chargeLines)을 쓰지만,
// 실제 결제 금액은 서버가 상자 구간으로 다시 계산한다(INV-M1) — 이 화면의 숫자는 안내일 뿐이다.
export function RegisterForm({
  creators,
  initialCreatorId = "",
}: {
  creators: readonly CreatorOption[];
  /** 크리에이터 화면에서 넘어오면 그 사람을 미리 골라 둔다 */
  initialCreatorId?: string;
}) {
  const [step, setStep] = useState<StepNo>(1);
  const [reached, setReached] = useState<StepNo>(1);
  const [query, setQuery] = useState("");
  const [done, setDone] = useState(false);

  const stepsWrap = useRef<HTMLElement>(null);
  const headings = useRef<Partial<Record<StepNo, HTMLHeadingElement | null>>>({});
  const doneTitle = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef(false);

  // 단계가 바뀌면 새 단계 제목으로 포커스 — 화면 낭독기가 바뀐 내용을 처음부터 읽게
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    headings.current[step]?.focus({ preventScroll: true });
    stepsWrap.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [step]);
  // 제출하면 폼이 완료 카드로 바뀌어 제출 버튼이 사라진다 — 포커스를 완료 제목으로 옮긴다
  useEffect(() => {
    if (done) doneTitle.current?.focus();
  }, [done]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<RegisterFormValues, unknown, RegisterFormOutput>({
    resolver: zodResolver(registerFormSchema),
    // 전자기기 신고는 기본값이 없다 — 팬이 직접 골라야 한다
    defaultValues: { creatorId: initialCreatorId, itemKind: "", smallCount: "1", mediumCount: "0" },
  });
  const creatorId = useWatch({ control, name: "creatorId" });
  const itemKind = useWatch({ control, name: "itemKind" }) ?? "";
  const metal = useWatch({ control, name: "electronicsOrMetal" });
  const summary = summarizeBoxes({
    small: useWatch({ control, name: "smallCount" }),
    medium: useWatch({ control, name: "mediumCount" }),
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
    void handleSubmit(() => setDone(true), onInvalid)(e);
  };

  // 끝에 닿은 버튼은 disabled 대신 aria-disabled 로 둔다 — disabled 가 되면 키보드 포커스가 사라진다
  const changeCount = (tier: BillableTier, delta: 1 | -1) => {
    if (delta > 0 ? !summary.canAdd : !summary.canRemove[tier]) return;
    const hasCountError = errors.smallCount !== undefined || errors.mediumCount !== undefined;
    setValue(COUNT_FIELD[tier], String(summary.counts[tier] + delta), { shouldValidate: hasCountError });
  };

  if (done) {
    return (
      <section className={`container ${f["send-section"]}`}>
        <div className={`${f["send-form"]} ${f.done}`}>
          <span className="tag tag--brand">등록 완료</span>
          <h2 ref={doneTitle} tabIndex={-1}>
            크리에이터의 승인을 기다려요
          </h2>
          <p>승인되면 알림톡으로 알려 드리고, 그때 사무실 주소가 열려요. 승인 전에는 선물을 보내지 마세요.</p>
          <p>예시 화면이라 실제 결제와 등록은 하지 않았어요.</p>
          <Link className={`btn ${f["done-go"]}`} href="/gifts">
            선물 내역 보기
          </Link>
        </div>
      </section>
    );
  }

  const q = norm(query);
  const matches = creators.filter(
    (c) => !q || norm([c.name, c.channel, c.channelTitle, c.category, c.alias].filter(Boolean).join(" ")).includes(q),
  );
  const picked = creators.find((c) => c.id === creatorId);
  const metalText = metal === "yes" ? "네, 있어요" : metal === "no" ? "아니요, 없어요" : "아직 안 골랐어요";
  const boxesText =
    BILLABLE_TIERS.filter((t) => summary.counts[t] > 0)
      .map((t) => `${PARCEL_TIER_GUIDE[t].name} ${summary.counts[t]}개`)
      .join(" · ") || "없음";
  const totalText = summary.totalKrw !== null ? won(summary.totalKrw) : summary.overLimit ? `${MAX_BOX_COUNT}개 초과` : "—";
  const boxError = errors.smallCount?.message ?? errors.mediumCount?.message;

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
            const isDone = n !== step && n <= reached;
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
                    {n < step ? "✓" : n}
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
                    {q ? `검색 결과 ${matches.length}명` : `전체 ${creators.length}명`}
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
                            {[c.category, c.channelTitle ?? c.channel, approvalText(c.averageApprovalMinutes)]
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
              {BILLABLE_TIERS.map((tier) => {
                const guide = PARCEL_TIER_GUIDE[tier];
                return (
                  <div key={tier} className={f.counter}>
                    <div>
                      <strong>{guide.name} 상자</strong>
                      <small>
                        {guide.rule} · {won(TIER_PRICE_KRW[tier])}
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
                  {BILLABLE_TIERS.map((tier) => (
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
              {picked ? (
                <div className={f["rule-note"]}>
                  <p>
                    <strong>
                      {picked.averageApprovalMinutes === null
                        ? `${picked.name}님은 아직 승인 기록이 없어요`
                        : `${picked.name}님은 보통 ${formatDuration(picked.averageApprovalMinutes)} 안에 승인해요`}
                    </strong>
                  </p>
                  <p className={f["rule-note-sub"]}>
                    승인은 크리에이터가 카카오톡 인증서로 선물마다 직접 해요. 승인이 나면 사무실 주소가 열리고, 알림톡으로 알려
                    드려요. 승인 없이는 저희 시스템이 주소를 열지 않습니다. 그 전에는 선물을 보내지 마세요.
                  </p>
                </div>
              ) : null}
            </section>

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
                <button key="pay" className={`btn ${f.next}`} type="submit">
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
