"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { z } from "zod";
import {
  importSealingPublicKey,
  sealEnvelope,
  type Envelope,
} from "@/shared/lib/envelope/envelope";
import {
  basicAddressOf,
  loadPostcode,
  type PostcodeResult,
} from "@/shared/lib/postcode/load-postcode";
import { applyPhoneEdit } from "@/shared/lib/phone/mobile-phone";
import { BottomSheet } from "./bottom-sheet";
import s from "./sealed-address-form.module.css";

// 봉인 주소 입력 칸 (address-protection INV-P1·P16·P17). 크리에이터 받는 주소(features/creator-address)와 팬이 그때마다 입력하는 주소
// (결제 때 반송 주소·선물함 신청·역조공 받기·반송 주소 확인)가 같이 쓴다 — 칸·순서·오류 문구·봉인·저장 흐름이 같고, 봉인할 내용(누구의 식별값을 묶는지)·
// 보내는 곳·버튼만 부르는 쪽이 정한다. 이름표 고르기는 등록해 두는 주소(크리에이터)에만 있다 — 팬 주소는 등록하지 않아 이름표가 없다(2026-11-08).
// 바깥 폼 안에 들어가는 자리(선물 등록 결제 단계)는 group 모드로 그린다 — form 안에 form 을 둘 수 없어서, 버튼과 Enter 가 바깥 폼을 제출하지 않고 이 칸만 봉인한다.
// 주소는 이 브라우저에서 봉인한 뒤 봉인된 값만 보낸다 — 평문 주소는 서버로 가지 않고, 저장되면 화면 상태에도 남기지 않는다.
// 「주소 검색」은 카카오(다음) 우편번호 서비스를 누를 때만 불러와 모달 창(BottomSheet)에 검색 화면을 띄우고(2026-11-14 사용자 「주소검색은 모달로」), 고른 우편번호·기본 주소를 칸에 채운다(INV-P20 ①).
// 칸은 직접 고칠 수도 있다. 우편번호는 봉인 속에만 들어가고, 서버로는 부르는 쪽이 우편번호로 정한 값(classify)만 따로 보낸다(INV-P20 ②).
// 이름표는 고르기만 한다 — 주소는 본인에게도 다시 보이지 않아서, 확인 창은 이 이름표와 바꾼 날로 확인한다(INV-P16).

/** 주소 봉인 공개키가 없을 때(설정 전) — 주소 입력 대신 이 안내만 보인다 */
export const ADDRESS_KEY_MISSING_TEXT =
  "현재 주소를 등록할 수 없습니다. 고객센터로 문의해 주세요.";

export type AddressFieldName =
  "zipCode" | "address1" | "address2" | "recipientName" | "phone";
export type AddressFieldValues = Record<AddressFieldName, string>;

/** 저장 결과 — 서버가 거부하면 그 문구를 그대로 보인다 */
export type SealedAddressSendOutcome =
  | { kind: "ok" }
  | { kind: "login" }
  | { kind: "refused"; message: string }
  | { kind: "failed" };

const FIELD_ORDER: readonly AddressFieldName[] = [
  "zipCode",
  "address1",
  "address2",
  "recipientName",
  "phone",
];

const FIELD_ERROR: Record<AddressFieldName, string> = {
  zipCode: "우편번호는 숫자 5자리로 입력해 주세요",
  address1: "기본 주소를 입력해 주세요",
  address2: "상세 주소는 120자 이내로 입력해 주세요",
  recipientName: "받는 사람 이름을 입력해 주세요",
  phone: "휴대폰 번호는 010으로 시작하는 숫자로 입력해 주세요",
};

const EMPTY: AddressFieldValues = {
  zipCode: "",
  address1: "",
  address2: "",
  recipientName: "",
  phone: "",
};

function badFields(err: unknown): AddressFieldName[] {
  if (!(err instanceof z.ZodError)) return [];
  const names = new Set(err.issues.map((i) => i.path[0]));
  return FIELD_ORDER.filter((f) => names.has(f));
}

/** 이름표를 고르는 폼(등록해 두는 주소) */
type WithLabel<L extends string, C> = {
  labelOptions: readonly { value: L; name: string }[];
  /** 지금 등록된 주소의 이름표 — 바꿀 때 먼저 골라 둔다 */
  initialLabel?: L | null;
  /** 이름표 아래 안내 한 줄 */
  labelHint: string;
  send: (
    envelope: Envelope,
    label: L,
    classified: C,
  ) => Promise<SealedAddressSendOutcome>;
  onSaved: (label: L) => void;
};

/** 이름표 없는 폼(그때마다 입력하는 팬 주소) */
type WithoutLabel<C> = {
  labelOptions?: undefined;
  initialLabel?: undefined;
  labelHint?: undefined;
  send: (
    envelope: Envelope,
    classified: C,
  ) => Promise<SealedAddressSendOutcome>;
  onSaved: () => void;
};

export type SealedAddressFormProps<L extends string, C> = (
  WithLabel<L, C> | WithoutLabel<C>
) & {
  /** 칸 id 머리 — 한 화면에 폼이 하나뿐이어도 다른 칸과 겹치지 않게 */
  idPrefix: string;
  sealingKeyPem: string;
  /** 봉인할 평문을 만든다. 칸이 틀리면 ZodError 를 던진다(칸 이름이 오류의 첫 경로). 식별값은 부르는 쪽이 묶는다. */
  toPlaintext: (fields: AddressFieldValues) => string;
  /** 우편번호(다섯 자리 숫자)로 정하는 값 — 봉인과 별도로 서버에 함께 보낸다. 우편번호 자체는 보내지 않는다 */
  classify: (zipCode: string) => C | null;
  /** 저장 버튼 — 모양과 글자(보내는 중 글자 포함)는 부르는 쪽이 정한다 */
  submitClassName: string;
  submitContent: (busy: boolean) => ReactNode;
  /** 폼이 나타날 때 첫 칸에 포커스 — 누른 버튼이 사라지는 자리에서 쓴다 */
  autoFocusFirst?: boolean;
  /** 없으면 취소 버튼을 그리지 않는다 */
  onCancel?: () => void;
  onLoginExpired: () => void;
  /** group: 바깥 폼 안에 넣는다(form 대신 묶음, 버튼·Enter 가 바깥 폼을 제출하지 않는다). groupLabel 이 묶음의 이름이다 */
  mode?: "form" | "group";
  groupLabel?: string;
};

/** 칸 묶음 — place 받을 곳(우편번호·기본·상세 주소) · person 받는 분(이름·휴대폰 번호). 단계형 창이 묶음마다 한 단계로 나눈다 */
export type AddressFieldGroup = "place" | "person";
const GROUP_FIELDS: Record<AddressFieldGroup, readonly AddressFieldName[]> = {
  place: ["zipCode", "address1", "address2"],
  person: ["recipientName", "phone"],
};

/** 봉인 결과 — invalid 는 칸 오류를 이미 표시하고 첫 칸으로 초점을 옮겼다 */
export type SealedAddressResult<C> =
  | { kind: "ok"; envelope: Envelope; classified: C }
  | { kind: "invalid" }
  | { kind: "error"; message: string };

/**
 * 봉인 주소 칸의 상태·칸·봉인 — SealedAddressForm 과 단계형 창(선물함 신청 모달)이 같이 쓴다.
 * 칸 모양·순서·오류 문구·주소 검색·봉인은 여기 하나다. 보내기·버튼·단계 나누기는 부르는 쪽이 정한다.
 */
export function useSealedAddressEntry<C>({
  idPrefix,
  sealingKeyPem,
  toPlaintext,
  classify,
  autoFocusFirst = false,
}: {
  idPrefix: string;
  sealingKeyPem: string;
  toPlaintext: (fields: AddressFieldValues) => string;
  classify: (zipCode: string) => C | null;
  autoFocusFirst?: boolean;
}) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<AddressFieldName[]>([]);
  const fieldRefs = useRef<
    Partial<Record<AddressFieldName, HTMLInputElement | null>>
  >({});
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  /** 창이 주소를 골라서 닫혔는가 — 그때는 연 버튼이 아니라 상세 주소 칸으로 초점을 보낸다 */
  const pickedRef = useRef(false);

  // 검색 결과로 우편번호·기본 주소를 채우고 창을 닫는다(초점은 창이 닫힌 뒤 상세 주소로 — searchClosed)
  const picked = (r: PostcodeResult) => {
    setValues((v) => ({
      ...v,
      zipCode: r.zonecode,
      address1: basicAddressOf(r),
    }));
    setErrors((e) => e.filter((x) => x !== "zipCode" && x !== "address1"));
    pickedRef.current = true;
    setSearching(false);
  };

  // 창이 열리면(누른 뒤에만 — INV-P20 ①) 스크립트를 불러와 창 안 칸에 검색 화면을 끼워 넣는다
  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    loadPostcode().then(
      (Postcode) => {
        const box = searchBoxRef.current;
        if (cancelled || !box) return;
        box.replaceChildren();
        new Postcode({
          oncomplete: picked, // 상태 설정 함수와 ref 만 써서 처음 잡힌 함수로도 맞다
          width: "100%",
          height: "100%",
        }).embed(box, { autoClose: true });
      },
      () => {
        if (cancelled) return;
        setSearching(false);
        setSearchError(true);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- picked 는 상태 설정 함수·ref 만 쓴다(렌더마다 새로 만들어도 하는 일이 같다)
  }, [searching]);

  const search = () => {
    setSearchError(false);
    pickedRef.current = false;
    setSearching(true);
  };

  // 창이 닫혔을 때(고름·닫기·Esc·바깥 누름) — 골랐으면 상세 주소 칸으로, 아니면 창이 연 버튼으로 돌려 둔 초점 그대로
  const searchClosed = () => {
    setSearching(false);
    if (pickedRef.current) {
      pickedRef.current = false;
      fieldRefs.current.address2?.focus();
    }
  };

  const set = (name: AddressFieldName, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors.includes(name)) setErrors((e) => e.filter((x) => x !== name));
  };

  // 휴대폰 번호 — 회원가입 칸과 같이 칠 때 「-」를 자동으로 넣고 커서를 맞춘다(2026-11-14 사용자 「회원가입할 때처럼」)
  const onPhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const native = e.nativeEvent;
    const type = native instanceof InputEvent ? native.inputType : "";
    const deleting = type === "deleteContentBackward" ? "backward" : type === "deleteContentForward" ? "forward" : null;
    const next = applyPhoneEdit(values.phone, el.value, el.selectionStart ?? el.value.length, deleting);
    // 요소 값과 커서를 먼저 맞춘다 — 상태와 같은 값이 되므로 다시 그릴 때 React 가 커서를 끝으로 옮기지 않는다
    el.value = next.value;
    el.setSelectionRange(next.caret, next.caret);
    set("phone", next.value);
  };

  const normalized = (): AddressFieldValues => ({
    ...values,
    zipCode: values.zipCode.trim(),
    phone: values.phone.replace(/[^0-9]/g, ""),
  });

  /** 칸을 검사한다 — groups 를 주면 그 묶음의 칸 오류만 표시한다(단계형 「다음」). 틀린 칸이 있으면 첫 칸으로 초점 */
  const check = (groups?: readonly AddressFieldGroup[]): boolean => {
    const only = groups
      ? new Set(groups.flatMap((g) => GROUP_FIELDS[g]))
      : null;
    try {
      toPlaintext(normalized());
      setErrors([]);
      return true;
    } catch (err) {
      const bad = badFields(err).filter((f) => !only || only.has(f));
      setErrors(bad);
      if (bad[0]) {
        fieldRefs.current[bad[0]]?.focus();
        return false;
      }
      // 묶음 밖 칸만 틀렸거나 칸 이름 없는 오류 — 이 단계는 통과, 봉인(seal)이 다시 검사해 문구를 돌려준다
      return true;
    }
  };

  /** 칸 전체를 검사하고 이 브라우저에서 봉인한다. 평문 주소는 서버로 가지 않는다 */
  const seal = async (): Promise<SealedAddressResult<C>> => {
    let plaintext: string;
    try {
      plaintext = toPlaintext(normalized());
    } catch (err) {
      const bad = badFields(err);
      setErrors(bad);
      if (bad[0]) {
        fieldRefs.current[bad[0]]?.focus();
        return { kind: "invalid" };
      }
      return { kind: "error", message: "주소를 다시 확인해 주세요." };
    }
    setErrors([]);
    const classified = classify(values.zipCode.trim());
    if (classified === null)
      return { kind: "error", message: "주소를 다시 확인해 주세요." };
    try {
      const envelope = await sealEnvelope(
        plaintext,
        await importSealingPublicKey(sealingKeyPem),
      );
      return { kind: "ok", envelope, classified };
    } catch {
      return {
        kind: "error",
        message: "주소를 저장하지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.",
      };
    }
  };

  /** 입력한 주소를 화면 상태에 남기지 않는다 */
  const clear = () => {
    setValues(EMPTY);
    setErrors([]);
  };

  const field = (
    name: AddressFieldName,
    text: string,
    extra: InputHTMLAttributes<HTMLInputElement>,
  ) => {
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

  const placeFields = (
    <>
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
        <button
          className={`btn btn--soft ${s["zip-search"]}`}
          type="button"
          onClick={search}
          aria-haspopup="dialog"
        >
          주소 검색
        </button>
      </div>
      <BottomSheet open={searching} title="주소 검색" onClose={searchClosed}>
        <div ref={searchBoxRef} className={s.postcode} />
      </BottomSheet>
      {searchError ? (
        <p className={s.error} role="alert">
          주소 검색을 불러오지 못했습니다. 우편번호와 주소를 직접 입력해 주세요.
        </p>
      ) : null}
      {field("address1", "기본 주소", {
        type: "text",
        autoComplete: "address-line1",
        maxLength: 120,
        placeholder: "도로명 또는 지번 주소",
        required: true,
      })}
      {field("address2", "상세 주소", {
        type: "text",
        autoComplete: "address-line2",
        maxLength: 120,
        placeholder: "동·호수 등을 입력해 주세요",
      })}
    </>
  );

  const personFields = (
    <div className={s.two}>
      {field("recipientName", "받는 사람 이름", {
        type: "text",
        autoComplete: "name",
        maxLength: 30,
        placeholder: "송장에 표시할 이름",
        required: true,
      })}
      {field("phone", "휴대폰 번호", {
        type: "tel",
        inputMode: "tel",
        autoComplete: "tel",
        maxLength: 13,
        placeholder: "010-0000-0000",
        onChange: onPhoneChange,
        required: true,
      })}
    </div>
  );

  const focusFirst = (group: AddressFieldGroup) =>
    fieldRefs.current[GROUP_FIELDS[group][0]]?.focus();

  return { values, placeFields, personFields, check, seal, clear, focusFirst };
}

export function SealedAddressForm<L extends string, C>(
  props: SealedAddressFormProps<L, C>,
) {
  const {
    idPrefix,
    sealingKeyPem,
    toPlaintext,
    labelOptions,
    classify,
    submitClassName,
    submitContent,
    autoFocusFirst = false,
    onCancel,
    onLoginExpired,
    mode = "form",
    groupLabel,
  } = props;
  const entry = useSealedAddressEntry({
    idPrefix,
    sealingKeyPem,
    toPlaintext,
    classify,
    autoFocusFirst,
  });
  const [label, setLabel] = useState<L | null>(props.initialLabel ?? null);
  const [labelMissing, setLabelMissing] = useState(false);
  const labelRef = useRef<HTMLInputElement | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent | KeyboardEvent | null) => {
    e?.preventDefault();
    if (busy) return;
    setSubmitError(null);
    if (!entry.check()) return;
    if (labelOptions && !label) {
      setLabelMissing(true);
      labelRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const sealed = await entry.seal();
      if (sealed.kind === "invalid") return;
      if (sealed.kind === "error") {
        setSubmitError(sealed.message);
        return;
      }
      const outcome = props.labelOptions
        ? await props.send(sealed.envelope, label as L, sealed.classified)
        : await props.send(sealed.envelope, sealed.classified);
      if (outcome.kind === "ok") {
        entry.clear(); // 입력한 주소를 화면 상태에 남기지 않는다
        if (props.labelOptions) props.onSaved(label as L);
        else props.onSaved();
        return;
      }
      if (outcome.kind === "login") {
        onLoginExpired();
        return;
      }
      setSubmitError(
        outcome.kind === "refused"
          ? outcome.message
          : "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } catch {
      setSubmitError(
        "주소를 저장하지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  };

  const fields = (
    <>
      {entry.placeFields}
      {entry.personFields}
      {labelOptions ? (
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
                  aria-describedby={
                    labelMissing
                      ? `${idPrefix}-label-err`
                      : `${idPrefix}-label-hint`
                  }
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
              {props.labelHint}
            </p>
          )}
        </fieldset>
      ) : null}
      <div role="alert">
        {submitError ? <p className={s.error}>{submitError}</p> : null}
      </div>
      <div className={s["sheet-btns"]}>
        {onCancel ? (
          <button className="btn btn--soft" type="button" onClick={onCancel}>
            취소
          </button>
        ) : null}
        <button
          className={submitClassName}
          type={mode === "group" ? "button" : "submit"}
          onClick={mode === "group" ? () => void submit(null) : undefined}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
        >
          {submitContent(busy)}
        </button>
      </div>
    </>
  );

  if (mode === "group") {
    // 칸에서 Enter 를 누르면 바깥 폼(결제)이 아니라 이 칸의 봉인으로 간다
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (
        e.key === "Enter" &&
        e.target instanceof HTMLInputElement &&
        e.target.type !== "radio"
      )
        void submit(e);
    };
    return (
      <div
        className={s["form-grid"]}
        role="group"
        aria-label={groupLabel}
        onKeyDown={onKeyDown}
      >
        {fields}
      </div>
    );
  }
  return (
    <form className={s["form-grid"]} onSubmit={submit} noValidate>
      {fields}
    </form>
  );
}
