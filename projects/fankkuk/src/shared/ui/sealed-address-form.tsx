"use client";

import { useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { z } from "zod";
import { importSealingPublicKey, sealEnvelope, type Envelope } from "@/shared/lib/envelope/envelope";
import s from "./sealed-address-form.module.css";

// 봉인 주소 입력 칸 (address-protection INV-P1·P16). 크리에이터 받는 주소(features/creator-address)와 팬 받을 주소(features/fan-address)가
// 같이 쓴다 — 칸·순서·오류 문구·이름표 고르기·봉인·저장 흐름이 같고, 봉인할 내용(누구의 식별값을 묶는지)·저장 경로·버튼만 부르는 쪽이 정한다.
// 주소는 이 브라우저에서 봉인한 뒤 봉인된 값만 보낸다 — 평문 주소는 서버로 가지 않고, 저장되면 화면 상태에도 남기지 않는다.
// 우편번호 찾기 서비스는 아직 붙이지 않았다 — 다섯 자리를 직접 입력한다.
// 이름표는 고르기만 한다 — 주소는 본인에게도 다시 보이지 않아서, 확인 창은 이 이름표와 바꾼 날로 확인한다(INV-P16).

/** 주소 봉인 공개키가 없을 때(설정 전) — 주소 입력 대신 이 안내만 보인다 */
export const ADDRESS_KEY_MISSING_TEXT = "현재 주소를 등록할 수 없습니다. 고객센터로 문의해 주세요.";

export type AddressFieldName = "zipCode" | "address1" | "address2" | "recipientName" | "phone";
export type AddressFieldValues = Record<AddressFieldName, string>;

/** 저장 결과 — 서버가 거부하면 그 문구를 그대로 보인다 */
export type SealedAddressSendOutcome = { kind: "ok" } | { kind: "login" } | { kind: "refused"; message: string } | { kind: "failed" };

const FIELD_ORDER: readonly AddressFieldName[] = ["zipCode", "address1", "address2", "recipientName", "phone"];

const FIELD_ERROR: Record<AddressFieldName, string> = {
  zipCode: "우편번호는 숫자 5자리로 입력해 주세요",
  address1: "기본 주소를 입력해 주세요",
  address2: "상세 주소는 120자 이내로 입력해 주세요",
  recipientName: "받는 사람 이름을 입력해 주세요",
  phone: "휴대폰 번호는 010으로 시작하는 숫자로 입력해 주세요",
};

const EMPTY: AddressFieldValues = { zipCode: "", address1: "", address2: "", recipientName: "", phone: "" };

function badFields(err: unknown): AddressFieldName[] {
  if (!(err instanceof z.ZodError)) return [];
  const names = new Set(err.issues.map((i) => i.path[0]));
  return FIELD_ORDER.filter((f) => names.has(f));
}

export type SealedAddressFormProps<L extends string> = {
  /** 칸 id 머리 — 한 화면에 폼이 하나뿐이어도 다른 칸과 겹치지 않게 */
  idPrefix: string;
  sealingKeyPem: string;
  /** 봉인할 평문을 만든다. 칸이 틀리면 ZodError 를 던진다(칸 이름이 오류의 첫 경로). 식별값은 부르는 쪽이 묶는다. */
  toPlaintext: (fields: AddressFieldValues) => string;
  labelOptions: readonly { value: L; name: string }[];
  /** 지금 등록된 주소의 이름표 — 바꿀 때 먼저 골라 둔다 */
  initialLabel?: L | null;
  /** 이름표 아래 안내 한 줄 */
  labelHint: string;
  send: (envelope: Envelope, label: L) => Promise<SealedAddressSendOutcome>;
  /** 저장 버튼 — 모양과 글자(보내는 중 글자 포함)는 부르는 쪽이 정한다 */
  submitClassName: string;
  submitContent: (busy: boolean) => ReactNode;
  /** 폼이 나타날 때 첫 칸에 포커스 — 누른 버튼이 사라지는 자리에서 쓴다 */
  autoFocusFirst?: boolean;
  onSaved: (label: L) => void;
  onCancel: () => void;
  onLoginExpired: () => void;
};

export function SealedAddressForm<L extends string>({
  idPrefix,
  sealingKeyPem,
  toPlaintext,
  labelOptions,
  initialLabel = null,
  labelHint,
  send,
  submitClassName,
  submitContent,
  autoFocusFirst = false,
  onSaved,
  onCancel,
  onLoginExpired,
}: SealedAddressFormProps<L>) {
  const [values, setValues] = useState(EMPTY);
  const [label, setLabel] = useState<L | null>(initialLabel);
  const [labelMissing, setLabelMissing] = useState(false);
  const labelRef = useRef<HTMLInputElement | null>(null);
  const [errors, setErrors] = useState<AddressFieldName[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldRefs = useRef<Partial<Record<AddressFieldName, HTMLInputElement | null>>>({});

  const set = (name: AddressFieldName, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors.includes(name)) setErrors((e) => e.filter((x) => x !== name));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setSubmitError(null);
    let plaintext: string;
    try {
      plaintext = toPlaintext({ ...values, zipCode: values.zipCode.trim(), phone: values.phone.replace(/[^0-9]/g, "") });
    } catch (err) {
      const bad = badFields(err);
      setErrors(bad);
      if (bad[0]) fieldRefs.current[bad[0]]?.focus();
      else setSubmitError("주소를 다시 확인해 주세요.");
      return;
    }
    setErrors([]);
    if (!label) {
      setLabelMissing(true);
      labelRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const envelope = await sealEnvelope(plaintext, await importSealingPublicKey(sealingKeyPem));
      const outcome = await send(envelope, label);
      if (outcome.kind === "ok") {
        setValues(EMPTY); // 입력한 주소를 화면 상태에 남기지 않는다
        onSaved(label);
        return;
      }
      if (outcome.kind === "login") {
        onLoginExpired();
        return;
      }
      setSubmitError(outcome.kind === "refused" ? outcome.message : "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } catch {
      setSubmitError("주소를 저장하지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const field = (name: AddressFieldName, text: string, extra: InputHTMLAttributes<HTMLInputElement>) => {
    const invalid = errors.includes(name);
    const errId = `${idPrefix}-${name}-err`;
    return (
      <div className="field">
        <label htmlFor={`${idPrefix}-${name}`}>{text}</label>
        <input
          ref={(el) => {
            fieldRefs.current[name] = el;
          }}
          className="input"
          id={`${idPrefix}-${name}`}
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
    <form className={s["form-grid"]} onSubmit={submit} noValidate>
      {field("zipCode", "우편번호", {
        type: "text",
        inputMode: "numeric",
        autoComplete: "postal-code",
        maxLength: 5,
        placeholder: "숫자 5자리",
        required: true,
        autoFocus: autoFocusFirst,
      })}
      {field("address1", "기본 주소", { type: "text", autoComplete: "address-line1", maxLength: 120, placeholder: "도로명 또는 지번 주소", required: true })}
      {field("address2", "상세 주소", { type: "text", autoComplete: "address-line2", maxLength: 120, placeholder: "동·호수 등을 입력해 주세요" })}
      <div className={s.two}>
        {field("recipientName", "받는 사람 이름", { type: "text", autoComplete: "name", maxLength: 30, placeholder: "송장에 표시할 이름", required: true })}
        {field("phone", "휴대폰 번호", { type: "tel", inputMode: "tel", autoComplete: "tel", maxLength: 13, placeholder: "010-0000-0000", required: true })}
      </div>
      <fieldset className={s.labels}>
        <legend className="label">주소 별칭</legend>
        <div className={s["label-opts"]}>
          {labelOptions.map((o, i) => (
            <label key={o.value} className="opt">
              <input
                ref={i === 0 ? labelRef : undefined}
                type="radio"
                name={`${idPrefix}-label`}
                value={o.value}
                checked={label === o.value}
                aria-invalid={labelMissing || undefined}
                aria-describedby={labelMissing ? `${idPrefix}-label-err` : `${idPrefix}-label-hint`}
                onChange={() => {
                  setLabel(o.value);
                  setLabelMissing(false);
                }}
              />
              {o.name}
            </label>
          ))}
        </div>
        {labelMissing ? (
          <p className={s.error} id={`${idPrefix}-label-err`} role="alert">
            주소 별칭을 선택해 주세요
          </p>
        ) : (
          <p className="hint" id={`${idPrefix}-label-hint`}>
            {labelHint}
          </p>
        )}
      </fieldset>
      <div role="alert">{submitError ? <p className={s.error}>{submitError}</p> : null}</div>
      <div className={s["sheet-btns"]}>
        <button className="btn btn--soft" type="button" onClick={onCancel}>
          취소
        </button>
        <button className={submitClassName} type="submit" aria-disabled={busy || undefined} aria-busy={busy || undefined}>
          {submitContent(busy)}
        </button>
      </div>
    </form>
  );
}
