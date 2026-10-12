"use client";

import { statusTagClass } from "@/shared/ui/status-tone";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { z } from "zod";
import { sealedAddressPlaintext, type RevgiftAddressInput } from "@/entities/revgift/model/sealed-address";
import type { ReceivedStage } from "@/entities/revgift/model/received-stage";
import { settledStageCopy } from "@/entities/revgift/ui/received-status";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { importSealingPublicKey, sealEnvelope } from "@/shared/lib/envelope/envelope";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { acceptRevgift, declineRevgift } from "../api/reply-requests";
import { PROMISE } from "@/shared/config/site-copy";
import s from "./receive-flow.module.css";

// 받은 역조공 하나 — 받기·받지 않기. 시안: docs/design/mockups/site/v4/revgift-receive.html
// 주소는 이 브라우저에서 봉인한 뒤 봉인된 값만 보낸다(reverse-gift INV-R5). 평문 주소는 서버로 가지 않고, 저장하지도 않는다(INV-R6).
// 우편번호 찾기 서비스는 아직 붙이지 않았다 — 다섯 자리를 직접 입력한다.

export type ReceiveFlowProps = {
  orderNo: string;
  creatorName: string;
  tierName: string;
  tierRule: string;
  stage: ReceivedStage;
  /** 기다리는 중일 때만 쓴다 — 「5일 남음」 */
  daysLeftText: string;
  /** 기다리는 중일 때만 쓴다 — 「10월 8일 오후 3:00까지 정해 주세요」 */
  deadlineText: string;
  /** 주소 봉인 공개키(PEM). 없으면 받기 폼 대신 안내만 보인다. */
  sealingKeyPem: string | null;
  /** 받기 판들 아래에 붙는 칸(내 주소 열람 기록 — 위젯이 넣는다). */
  children?: ReactNode;
};

type FieldName = keyof Omit<RevgiftAddressInput, "orderNo">;

const FIELD_ORDER: readonly FieldName[] = ["zipCode", "address1", "address2", "recipientName", "phone"];

const FIELD_ERROR: Record<FieldName, string> = {
  zipCode: "우편번호 다섯 자리를 숫자로 적어 주세요",
  address1: "기본 주소를 적어 주세요",
  address2: "상세 주소는 120자 안으로 적어 주세요",
  recipientName: "받는 사람 이름을 적어 주세요",
  phone: "휴대폰 번호를 010으로 시작하는 숫자로 적어 주세요",
};

const EMPTY: Record<FieldName, string> = { zipCode: "", address1: "", address2: "", recipientName: "", phone: "" };

function badFields(err: unknown): FieldName[] {
  if (!(err instanceof z.ZodError)) return [];
  const names = new Set(err.issues.map((i) => i.path[0]));
  return FIELD_ORDER.filter((f) => names.has(f));
}

export function ReceiveFlow(props: ReceiveFlowProps) {
  const { orderNo, creatorName, tierName, tierRule, daysLeftText, deadlineText, sealingKeyPem } = props;
  const router = useRouter();
  const [stage, setStage] = useState<ReceivedStage>(props.stage);
  const [formOpen, setFormOpen] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldName[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);

  const formTitle = useRef<HTMLHeadingElement>(null);
  const resultTitle = useRef<HTMLHeadingElement>(null);
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLInputElement | null>>>({});
  const focusNext = useRef<"form" | "result" | null>(null);

  // 화면이 바뀌면 누른 버튼이 사라진다 — 바뀐 부분의 제목으로 포커스를 옮겨 처음부터 읽게
  useEffect(() => {
    const target = focusNext.current === "form" ? formTitle.current : focusNext.current === "result" ? resultTitle.current : null;
    focusNext.current = null;
    target?.focus();
  }, [formOpen, stage]);

  const waiting = stage === "waiting";

  const set = (name: FieldName, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors.includes(name)) setErrors((e) => e.filter((x) => x !== name));
  };

  const openForm = () => {
    focusNext.current = "form";
    setFormOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !sealingKeyPem) return;
    setSubmitError(null);
    let plaintext: string;
    try {
      plaintext = sealedAddressPlaintext({
        orderNo,
        zipCode: values.zipCode.trim(),
        address1: values.address1,
        address2: values.address2,
        recipientName: values.recipientName,
        phone: values.phone.replace(/[^0-9]/g, ""),
      });
    } catch (err) {
      const bad = badFields(err);
      setErrors(bad);
      if (bad[0]) fieldRefs.current[bad[0]]?.focus();
      else setSubmitError("주소를 다시 확인해 주세요.");
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      const envelope = await sealEnvelope(plaintext, await importSealingPublicKey(sealingKeyPem));
      const outcome = await acceptRevgift(orderNo, envelope);
      if (outcome.ok) {
        setValues(EMPTY); // 입력한 주소를 화면 상태에 남기지 않는다
        focusNext.current = "result";
        setFormOpen(false);
        setStage("accepted");
        return;
      }
      setSubmitError(outcome.message);
      // 이미 정해졌거나 기한이 지났으면 지금 상태를 다시 읽어 그 안내로 바꾼다
      if (outcome.status === 409) router.refresh();
    } catch {
      setSubmitError("주소를 암호화하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    if (busy) return;
    setBusy(true);
    setDeclineError(null);
    const outcome = await declineRevgift(orderNo);
    setBusy(false);
    setSheetOpen(false);
    if (outcome.ok) {
      setValues(EMPTY);
      focusNext.current = "result";
      setFormOpen(false);
      setStage("declined");
      return;
    }
    if (formOpen) setSubmitError(outcome.message);
    else setDeclineError(outcome.message);
    if (outcome.status === 409) router.refresh();
  };

  const settled = stage === "waiting" ? null : settledStageCopy(stage);

  const field = (name: FieldName, label: string, extra: InputHTMLAttributes<HTMLInputElement>) => {
    const invalid = errors.includes(name);
    const errId = `rv-${name}-err`;
    return (
      <div className="field">
        <label htmlFor={`rv-${name}`}>{label}</label>
        <input
          ref={(el) => {
            fieldRefs.current[name] = el;
          }}
          className="input"
          id={`rv-${name}`}
          name={name}
          value={values[name]}
          onChange={(e) => set(name, e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errId : undefined}
          {...extra}
        />
        {invalid ? (
          <p className={s.error} id={errId}>
            {FIELD_ERROR[name]}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div className={s.rcv}>
      <section className={s.hero} aria-labelledby="rv-title">
        <div className={s["hero-top"]}>
          <img className={`asset ${s.gift}`} src="/img/icon-gift.png" alt="" aria-hidden="true" width={96} height={96} />
          <div>
            <h1 id="rv-title">{creatorName}님이 선물을 보냈어요</h1>
            <p>내가 팔로우한 크리에이터가 보낸 선물이에요.</p>
          </div>
        </div>
        <dl className={s.facts}>
          <div>
            <dt>보낸 사람</dt>
            <dd>{creatorName}님</dd>
          </div>
          <div>
            <dt>상자 크기</dt>
            <dd>
              {tierName} 상자<small>{tierRule}</small>
            </dd>
          </div>
          <div>
            <dt>상태</dt>
            <dd>
              {settled ? (
                <span className={statusTagClass(settled.tone, s.tag)}>{settled.tag}</span>
              ) : (
                <>
                  <span className={statusTagClass("warn", s.tag)}>{daysLeftText}</span>
                  <small>{deadlineText}</small>
                </>
              )}
            </dd>
          </div>
        </dl>
        {waiting && !formOpen ? (
          <>
            {sealingKeyPem ? null : (
              <p className={s.warn} role="status">
                주소 보호 설정이 아직 안 돼 있어요. 지금은 받기를 할 수 없어요 — 설정이 끝나면 다시 들어와 주세요.
              </p>
            )}
            <div className={s.actions}>
              {sealingKeyPem ? (
                <button className="btn" type="button" onClick={openForm}>
                  받기
                </button>
              ) : null}
              <button className="btn btn--soft" type="button" onClick={() => setSheetOpen(true)}>
                받지 않기
              </button>
            </div>
            <div role="alert">{declineError ? <p className={s.error}>{declineError}</p> : null}</div>
            <p className={s.once}>기한 안에 정하지 않으면 자동으로 받지 않음 처리돼요. 받기 전에는 주소를 입력하지 않아도 돼요.</p>
          </>
        ) : null}
      </section>

      {waiting && formOpen && sealingKeyPem ? (
        <section className={s.panel} aria-labelledby="rv-form-title">
          <h2 id="rv-form-title" ref={formTitle} tabIndex={-1}>
            받을 주소를 알려 주세요
          </h2>
          <div className={s["sec-note"]}>
            <img className="asset" src="/img/icon-address-lock.png" alt="" aria-hidden="true" width={56} height={56} />
            <p>
              주소는 이 브라우저에서 암호화돼요. 팬꾹도 송장을 뽑을 때만 열 수 있고, 출고되면 지워요. {creatorName}님에게는 보이지 않아요.
              <small>이 주소는 이번 선물에만 쓰이고, 계정에 저장되지 않아요.</small>
            </p>
          </div>
          <form className={s["form-grid"]} onSubmit={submit} noValidate>
            {field("zipCode", "우편번호", { type: "text", inputMode: "numeric", autoComplete: "postal-code", maxLength: 5, placeholder: "숫자 다섯 자리", required: true })}
            {field("address1", "기본 주소", { type: "text", autoComplete: "address-line1", maxLength: 120, placeholder: "도로명 주소나 지번 주소", required: true })}
            {field("address2", "상세 주소", { type: "text", autoComplete: "address-line2", maxLength: 120, placeholder: "동·호수 등을 적어 주세요" })}
            <div className={s.two}>
              {field("recipientName", "받는 사람 이름", { type: "text", autoComplete: "name", maxLength: 30, placeholder: "택배에 적힐 이름", required: true })}
              {field("phone", "휴대폰 번호", { type: "tel", inputMode: "tel", autoComplete: "tel", maxLength: 13, placeholder: "010-0000-0000", required: true })}
            </div>
            <div role="alert">{submitError ? <p className={s.error}>{submitError}</p> : null}</div>
            <div className={s["form-actions"]}>
              <button className="btn" type="submit" aria-disabled={busy || undefined} aria-busy={busy || undefined}>
                이 주소로 받기
              </button>
              <button className="btn btn--soft" type="button" onClick={() => setSheetOpen(true)}>
                받지 않기
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {stage !== "waiting" ? (
        <section className={s.panel} aria-labelledby="rv-result-title">
          {stage === "accepted" ? (
            <>
              <div className={s["done-top"]}>
                <img className="asset" src="/img/icon-approve.png" alt="" aria-hidden="true" width={72} height={72} />
                <div>
                  <h2 id="rv-result-title" ref={resultTitle} tabIndex={-1}>
                    받기가 끝났어요
                  </h2>
                  <p>{creatorName}님의 선물이 곧 준비돼요. 주소를 다시 입력하지 않아도 돼요.</p>
                </div>
              </div>
              <ol className={s.next}>
                <li>
                  <strong>상자가 팬꾹에 도착해요</strong>
                  <p>{PROMISE.inspection}</p>
                </li>
                <li>
                  <strong>검수가 끝나면 보내 드려요</strong>
                  <p>입력한 주소는 송장을 출력할 때만 열리고, 출고하면 바로 지워요.</p>
                </li>
                <li>
                  <strong>배송이 시작되면 받은 역조공에서 확인할 수 있어요</strong>
                  <p>상태가 「출고됨」으로 바뀌어요.</p>
                </li>
              </ol>
            </>
          ) : (
            <>
              <h2 id="rv-result-title" ref={resultTitle} tabIndex={-1}>
                {RESULT_TITLE[stage]}
              </h2>
              <p className={s.sub}>{resultBody(stage, creatorName)}</p>
            </>
          )}
          <div className={s["done-links"]}>
            <Link className="btn" href="/me/revgifts">
              받은 역조공 보기
            </Link>
            <Link className="btn btn--soft" href={FAN_HOME}>
              메인으로
            </Link>
          </div>
        </section>
      ) : null}

      <BottomSheet open={sheetOpen} title={`${creatorName}님의 선물을 받지 않을까요?`} onClose={() => setSheetOpen(false)}>
        <p className="sub">받지 않아도 {creatorName}님에게 이유는 알리지 않아요. 한 번 받지 않으면 다시 받을 수 없어요.</p>
        <div className={s["sheet-btns"]}>
          <button className="btn btn--soft" type="button" onClick={() => setSheetOpen(false)}>
            돌아가기
          </button>
          <button className="btn" type="button" onClick={() => void decline()} aria-disabled={busy || undefined} aria-busy={busy || undefined}>
            받지 않기
          </button>
        </div>
      </BottomSheet>
      {props.children}
    </div>
  );
}

const RESULT_TITLE: Record<Exclude<ReceivedStage, "waiting" | "accepted">, string> = {
  declined: "받지 않기로 했어요",
  expired: "기한이 지나 받지 않음으로 정해졌어요",
  shipped: "배송이 시작됐어요",
  returned: "상자를 돌려보냈어요",
  cancelled: "이 선물은 취소됐어요",
};

function resultBody(stage: Exclude<ReceivedStage, "waiting" | "accepted">, creatorName: string): string {
  if (stage === "declined") return `${creatorName}님에게는 받지 않은 이유를 알리지 않아요. 입력한 주소는 없어요.`;
  if (stage === "expired") return `7일 안에 정하지 않아 받지 않음으로 처리됐어요. ${creatorName}님에게는 이유를 알리지 않아요.`;
  if (stage === "shipped") return "입력한 주소는 출고할 때 지워졌어요. 곧 도착해요.";
  if (stage === "cancelled") return `${creatorName}님이 보낸 이 선물은 더 진행되지 않아요.`;
  return `상자를 ${creatorName}님에게 돌려보냈어요. 입력한 주소는 지워졌어요.`;
}
