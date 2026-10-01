"use client";

import { useEffect, useId, useRef, useState } from "react";
import { parseTrackingNo } from "../model/tracking-no";
import s from "./tracking-input.module.css";

// 팬이 보낸 택배의 송장번호 입력. 지금은 예시 — 저장하지 않고 화면에만 반영한다.
export function TrackingInput({ initial }: { initial: string | null }) {
  const id = useId();
  const [saved, setSaved] = useState<string | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(initial === null);
  // 등록·「고치기」를 누르면 누른 버튼이 사라진다 — 바뀐 자리로 포커스를 옮긴다. 처음 열 때는 옮기지 않는다.
  const moved = useRef(false);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    if (editing) inputRef.current?.focus();
    else resultRef.current?.focus();
  }, [editing]);

  if (!editing && saved) {
    return (
      <div className={s.saved}>
        <p ref={resultRef} tabIndex={-1}>
          내 송장번호 <strong>{saved}</strong>
        </p>
        <button
          type="button"
          className="btn btn--text btn--sm"
          onClick={() => {
            moved.current = true;
            setEditing(true);
          }}
        >
          송장번호 고치기
        </button>
      </div>
    );
  }

  return (
    <form
      className="field"
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
        moved.current = true;
        setEditing(false);
      }}
    >
      <label htmlFor={`${id}-no`}>이 선물을 보낸 택배 송장번호</label>
      <div className={s.inv}>
        <input
          ref={inputRef}
          id={`${id}-no`}
          name="trackingNo"
          className="input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={saved ?? ""}
          placeholder="숫자만 입력해요"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
        />
        <button type="submit" className="btn btn--sm">
          등록
        </button>
      </div>
      {error ? (
        <p className={s.error} id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
      <p className="hint" id={`${id}-hint`}>
        송장번호를 등록해 두면 받는 사람 이름의 주문번호와 함께, 사무실에 도착한 상자를 더 빨리 찾아요.
      </p>
    </form>
  );
}
