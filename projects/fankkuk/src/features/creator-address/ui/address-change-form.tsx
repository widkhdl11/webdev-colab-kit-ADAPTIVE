"use client";

import { useRef, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { z } from "zod";
import { ADDRESS_LABELS, ADDRESS_LABEL_NAME, type AddressLabel } from "@/entities/address/model/address-label";
import { creatorAddressPlaintext, type CreatorAddressInput } from "@/entities/address/model/creator-address-plaintext";
import { importSealingPublicKey, sealEnvelope } from "@/shared/lib/envelope/envelope";
import { KakaoBubble } from "@/shared/ui/kakao-bubble";
import { sendCreatorAddress } from "../api/send-creator-address";
import s from "./address-change-form.module.css";

// 크리에이터 주소 등록·변경 입력 (address-protection INV-P1·P13). 시안: docs/design/mockups/site/v4/creator-settings.html 의 주소 바꾸기 창 +
// 역조공 받기 화면의 주소 입력 칸. 주소는 이 브라우저에서 봉인한 뒤 봉인된 값만 보낸다 — 평문 주소는 서버로 가지 않고 화면 상태에도 남기지 않는다.
// 「카카오톡으로 서명하기」는 지금 로컬 가짜 서명 창구로 저장된다(카드 d28). 운영에서는 서버가 창구가 없어 거부한다.
// 우편번호 찾기 서비스는 아직 붙이지 않았다 — 다섯 자리를 직접 입력한다.
// 이름표(집·작업실·사무실·기타)는 고르기만 한다 — 주소는 본인에게도 다시 보이지 않아서, 승인 전 확인 창은 이 이름표와 바꾼 날로 확인한다(INV-P16).

type FieldName = keyof Omit<CreatorAddressInput, "creatorId">;

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

export type AddressChangeFormProps = {
  creatorId: string;
  sealingKeyPem: string;
  /** 지금 등록된 주소의 이름표 — 바꿀 때 먼저 골라 둔다 */
  initialLabel?: AddressLabel | null;
  /** 폼이 나타날 때 첫 칸에 포커스 — 누른 버튼이 사라지는 자리에서 쓴다 */
  autoFocusFirst?: boolean;
  onSaved: (label: AddressLabel) => void;
  onCancel: () => void;
  onLoginExpired: () => void;
};

export function AddressChangeForm({
  creatorId,
  sealingKeyPem,
  initialLabel = null,
  autoFocusFirst = false,
  onSaved,
  onCancel,
  onLoginExpired,
}: AddressChangeFormProps) {
  const [values, setValues] = useState(EMPTY);
  const [label, setLabel] = useState<AddressLabel | null>(initialLabel);
  const [labelMissing, setLabelMissing] = useState(false);
  const labelRef = useRef<HTMLInputElement | null>(null);
  const [errors, setErrors] = useState<FieldName[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLInputElement | null>>>({});

  const set = (name: FieldName, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors.includes(name)) setErrors((e) => e.filter((x) => x !== name));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setSubmitError(null);
    let plaintext: string;
    try {
      plaintext = creatorAddressPlaintext({
        creatorId,
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
    if (!label) {
      setLabelMissing(true);
      labelRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const envelope = await sealEnvelope(plaintext, await importSealingPublicKey(sealingKeyPem));
      const outcome = await sendCreatorAddress(envelope, label);
      if (outcome.kind === "ok") {
        setValues(EMPTY); // 입력한 주소를 화면 상태에 남기지 않는다
        onSaved(label);
        return;
      }
      if (outcome.kind === "login") {
        onLoginExpired();
        return;
      }
      setSubmitError(outcome.kind === "refused" ? outcome.message : "저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
    } catch {
      setSubmitError("주소를 암호화하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const field = (name: FieldName, label: string, extra: InputHTMLAttributes<HTMLInputElement>) => {
    const invalid = errors.includes(name);
    const errId = `ca-${name}-err`;
    return (
      <div className="field">
        <label htmlFor={`ca-${name}`}>{label}</label>
        <input
          ref={(el) => {
            fieldRefs.current[name] = el;
          }}
          className="input"
          id={`ca-${name}`}
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
        placeholder: "숫자 다섯 자리",
        required: true,
        autoFocus: autoFocusFirst,
      })}
      {field("address1", "기본 주소", { type: "text", autoComplete: "address-line1", maxLength: 120, placeholder: "도로명 주소나 지번 주소", required: true })}
      {field("address2", "상세 주소", { type: "text", autoComplete: "address-line2", maxLength: 120, placeholder: "동·호수 등을 적어 주세요" })}
      <div className={s.two}>
        {field("recipientName", "받는 사람 이름", { type: "text", autoComplete: "name", maxLength: 30, placeholder: "택배에 적힐 이름", required: true })}
        {field("phone", "휴대폰 번호", { type: "tel", inputMode: "tel", autoComplete: "tel", maxLength: 13, placeholder: "010-0000-0000", required: true })}
      </div>
      <fieldset className={s.labels}>
        <legend className="label">이 주소의 이름표</legend>
        <div className={s["label-opts"]}>
          {ADDRESS_LABELS.map((k, i) => (
            <label key={k} className="opt">
              <input
                ref={i === 0 ? labelRef : undefined}
                type="radio"
                name="ca-label"
                value={k}
                checked={label === k}
                aria-invalid={labelMissing || undefined}
                aria-describedby={labelMissing ? "ca-label-err" : "ca-label-hint"}
                onChange={() => {
                  setLabel(k);
                  setLabelMissing(false);
                }}
              />
              {ADDRESS_LABEL_NAME[k]}
            </label>
          ))}
        </div>
        {labelMissing ? (
          <p className={s.error} id="ca-label-err" role="alert">
            이름표를 하나 골라 주세요
          </p>
        ) : (
          <p className="hint" id="ca-label-hint">
            주소는 등록한 뒤에 다시 보이지 않아요. 승인할 때 이 이름표와 등록한 날로 확인해요.
          </p>
        )}
      </fieldset>
      <div role="alert">{submitError ? <p className={s.error}>{submitError}</p> : null}</div>
      <div className={s["sheet-btns"]}>
        <button className="btn btn--soft" type="button" onClick={onCancel}>
          돌아가기
        </button>
        <button className="btn btn--kakao" type="submit" aria-disabled={busy || undefined} aria-busy={busy || undefined}>
          <KakaoBubble />
          {busy ? "저장하는 중…" : "카카오톡으로 서명하기"}
        </button>
      </div>
    </form>
  );
}
