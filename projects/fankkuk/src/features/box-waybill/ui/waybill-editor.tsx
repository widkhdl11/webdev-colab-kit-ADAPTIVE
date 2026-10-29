"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { formatWaybill, parseWaybillInput } from "@/entities/parcel/model/waybill-no";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { postWaybill, type WaybillTarget } from "../api/post-waybill-client";
import s from "./box-waybill.module.css";

// 입고 전 상자 하나의 원 송장번호 — 등록·고치기 (design-rules 8-1, 시안 gift-boxes.html · creator-revgift-boxes.html).
// 입고된 상자는 이 칸을 그리지 않는다(잠긴 표시는 화면 쪽이 그린다). 고칠 수 있는 때인지는 DB 가 다시 판정한다 —
// 그 사이 입고됐으면(409) 문구를 보여 주고 화면을 다시 읽는다.

type Props = {
  target: WaybillTarget;
  /** 화면 낭독기용 상자 이름(예: FC-7K3M9-2, 초코우유님 상자) */
  boxName: string;
  initial: string | null;
  layout: "box" | "share";
  /** 처음 넣을 때 아래에 붙는 안내 */
  hint: string;
};

export function WaybillEditor({ target, boxName, initial, layout, hint }: Props) {
  const id = useId();
  const router = useRouter();
  const [saved, setSaved] = useState<string | null>(initial);
  const [editing, setEditing] = useState(initial === null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 저장·「고치기」를 누르면 누른 버튼이 사라진다 — 바뀐 자리로 포커스를 옮긴다. 처음 열 때는 옮기지 않는다.
  const moved = useRef(false);
  const resultRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    if (editing) inputRef.current?.focus();
    else resultRef.current?.focus();
  }, [editing]);

  const root = layout === "share" ? s.share : undefined;

  if (!editing && saved) {
    return (
      <div className={root}>
        <div className={s.fixed}>
          <span className={s.lab}>송장번호</span>
          <span ref={resultRef} tabIndex={-1} className={s.no}>
            {formatWaybill(saved)}
          </span>
          <span className={s.lab}>등록 완료</span>
          <button
            type="button"
            className="btn btn--soft btn--sm"
            aria-label={`${boxName} 송장번호 수정`}
            onClick={() => {
              moved.current = true;
              setError(null);
              setEditing(true);
            }}
          >
            수정
          </button>
        </div>
      </div>
    );
  }

  async function submit(form: HTMLFormElement) {
    if (busy) return;
    const value = new FormData(form).get("waybill");
    const parsed = parseWaybillInput(typeof value === "string" ? value : "");
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await postWaybill(target, parsed.value);
    setBusy(false);
    if (outcome.kind === "ok") {
      setSaved(parsed.value);
      moved.current = true;
      setEditing(false);
      router.refresh();
      return;
    }
    setError(outcome.message);
    if (isStaleFailure(outcome)) router.refresh();
  }

  return (
    <div className={root}>
      <form
        className={`field ${s.edit}`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <label htmlFor={`${id}-no`} className={layout === "share" ? "sr-only" : undefined}>
          {layout === "share" ? `${boxName} 송장번호` : "팬꾹으로 보낸 송장번호 (선택)"}
        </label>
        <div className={s.inv}>
          <input
            ref={inputRef}
            id={`${id}-no`}
            name="waybill"
            className="input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={saved ? formatWaybill(saved) : ""}
            placeholder={layout === "share" ? "이 상자의 송장번호 (숫자만)" : "숫자만 입력"}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
          />
          <button type="submit" className="btn btn--sm" aria-disabled={busy}>
            {busy ? "저장 중…" : saved ? "저장" : "등록"}
          </button>
        </div>
        {error ? (
          <p className={s.error} id={`${id}-error`} role="alert">
            <span className={s["error-mark"]} aria-hidden="true">
              !
            </span>
            {error}
          </p>
        ) : null}
        <p className="hint" id={`${id}-hint`}>
          {saved ? (layout === "box" ? "팬꾹 도착 전까지 수정 가능" : "입고 전까지 수정할 수 있습니다.") : hint}
        </p>
      </form>
    </div>
  );
}
