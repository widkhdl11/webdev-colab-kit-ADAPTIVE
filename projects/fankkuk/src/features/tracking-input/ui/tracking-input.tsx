"use client";

import { useId, useState } from "react";
import s from "@/shared/ui/screen.module.css";
import { parseTrackingNo } from "../model/tracking-no";

// 팬이 보낸 택배의 송장번호 입력. 지금은 예시 — 저장하지 않고 화면에만 반영한다.
export function TrackingInput({ initial }: { initial: string | null }) {
  const id = useId();
  const [saved, setSaved] = useState<string | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(initial === null);

  if (!editing && saved) {
    return (
      <div className={s.stack}>
        <dl className={s.rows}>
          <div>
            <dt>내가 보낸 송장번호</dt>
            <dd>{saved}</dd>
          </div>
        </dl>
        <button type="button" className={s["button-quiet"]} onClick={() => setEditing(true)}>
          송장번호 고치기
        </button>
      </div>
    );
  }

  return (
    <form
      className={s.field}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const value = new FormData(e.currentTarget).get("trackingNo");
        const result = parseTrackingNo(typeof value === "string" ? value : "");
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setError(null);
        setSaved(result.value);
        setEditing(false);
      }}
    >
      <label className={s.label} htmlFor={`${id}-no`}>
        보낸 뒤 송장번호를 적어 주세요
      </label>
      <p className={s.hint} id={`${id}-hint`}>
        받는 사람 이름의 주문번호와 함께, 도착한 상자를 찾는 데 써요.
      </p>
      <input
        id={`${id}-no`}
        name="trackingNo"
        className={s.input}
        inputMode="numeric"
        autoComplete="off"
        defaultValue={saved ?? ""}
        placeholder="숫자만 적어도 돼요"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
      />
      {error ? (
        <p className={s.error} id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className={s.button}>
        송장번호 저장
      </button>
    </form>
  );
}
