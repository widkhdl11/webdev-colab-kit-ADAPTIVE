"use client";

import { useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { z } from "zod";
import { importSealingPublicKey, sealEnvelope, type Envelope } from "@/shared/lib/envelope/envelope";
import { basicAddressOf, loadPostcode, type PostcodeResult } from "@/shared/lib/postcode/load-postcode";
import s from "./sealed-address-form.module.css";

// 봉인 주소 입력 칸 (address-protection INV-P1·P16). 크리에이터 받는 주소(features/creator-address)와 팬 받을 주소(features/fan-address)가
// 같이 쓴다 — 칸·순서·오류 문구·이름표 고르기·봉인·저장 흐름이 같고, 봉인할 내용(누구의 식별값을 묶는지)·저장 경로·버튼만 부르는 쪽이 정한다.
// 주소는 이 브라우저에서 봉인한 뒤 봉인된 값만 보낸다 — 평문 주소는 서버로 가지 않고, 저장되면 화면 상태에도 남기지 않는다.
// 「주소 검색」은 카카오(다음) 우편번호 서비스를 누를 때만 불러와 이 폼 안에 검색 화면을 띄우고, 고른 우편번호·기본 주소를 칸에 채운다(INV-P20 ①).
// 칸은 직접 고칠 수도 있다. 우편번호는 봉인 속에만 들어가고, 서버로는 부르는 쪽이 우편번호로 정한 값(classify)만 따로 보낸다(INV-P20 ②).
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

export type SealedAddressFormProps<L extends string, C> = {
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
  /** 우편번호(다섯 자리 숫자)로 정하는 값 — 봉인과 별도로 서버에 함께 보낸다. 우편번호 자체는 보내지 않는다 */
  classify: (zipCode: string) => C | null;
  send: (envelope: Envelope, label: L, classified: C) => Promise<SealedAddressSendOutcome>;
  /** 저장 버튼 — 모양과 글자(보내는 중 글자 포함)는 부르는 쪽이 정한다 */
  submitClassName: string;
  submitContent: (busy: boolean) => ReactNode;
  /** 폼이 나타날 때 첫 칸에 포커스 — 누른 버튼이 사라지는 자리에서 쓴다 */
  autoFocusFirst?: boolean;
  onSaved: (label: L) => void;
  onCancel: () => void;
  onLoginExpired: () => void;
};

export function SealedAddressForm<L extends string, C>({
  idPrefix,
  sealingKeyPem,
  toPlaintext,
  labelOptions,
  initialLabel = null,
  labelHint,
  classify,
  send,
  submitClassName,
  submitContent,
  autoFocusFirst = false,
  onSaved,
  onCancel,
  onLoginExpired,
}: SealedAddressFormProps<L, C>) {
  const [values, setValues] = useState(EMPTY);
  const [label, setLabel] = useState<L | null>(initialLabel);
  const [labelMissing, setLabelMissing] = useState(false);
  const labelRef = useRef<HTMLInputElement | null>(null);
  const [errors, setErrors] = useState<AddressFieldName[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldRefs = useRef<Partial<Record<AddressFieldName, HTMLInputElement | null>>>({});
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  // 검색 결과로 우편번호·기본 주소를 채우고 상세 주소로 넘어간다
  const picked = (r: PostcodeResult) => {
    setValues((v) => ({ ...v, zipCode: r.zonecode, address1: basicAddressOf(r) }));
    setErrors((e) => e.filter((x) => x !== "zipCode" && x !== "address1"));
    setSearching(false);
    fieldRefs.current.address2?.focus();
  };

  const search = () => {
    setSearchError(false);
    setSearching(true);
    loadPostcode().then(
      (Postcode) => {
        const box = searchBoxRef.current;
        if (!box) return;
        box.replaceChildren();
        new Postcode({ oncomplete: picked, width: "100%", height: "100%" }).embed(box, { autoClose: true });
      },
      () => {
        setSearching(false);
        setSearchError(true);
      },
    );
  };

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
    const classified = classify(values.zipCode.trim());
    if (classified === null) {
      setSubmitError("주소를 다시 확인해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const envelope = await sealEnvelope(plaintext, await importSealingPublicKey(sealingKeyPem));
      const outcome = await send(envelope, label, classified);
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
      <div className={s["zip-row"]}>
        {field("zipCode", "우편번호", {
          type: "text",
          inputMode: "numeric",
          autoComplete: "postal-code",
          maxLength: 5,
          placeholder: "숫자 5자리",
          required: true,
          autoFocus: autoFocusFirst,
        })}
        <button className={`btn btn--soft ${s["zip-search"]}`} type="button" onClick={search} aria-expanded={searching}>
          주소 검색
        </button>
      </div>
      <div ref={searchBoxRef} className={s.postcode} hidden={!searching} />
      {searchError ? (
        <p className={s.error} role="alert">
          주소 검색을 불러오지 못했습니다. 우편번호와 주소를 직접 입력해 주세요.
        </p>
      ) : null}
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
