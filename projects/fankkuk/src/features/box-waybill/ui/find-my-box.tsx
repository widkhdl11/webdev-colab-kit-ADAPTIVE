"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { parseWaybillInput } from "@/entities/parcel/model/waybill-no";
import { postMatch } from "../api/post-waybill-client";
import s from "./box-waybill.module.css";

// 내 물건 찾기 (office-workflow INV-W5, 시안 gift-boxes.html). 사무실에 도착했는데 주문과 이어지지 않은 상자를
// 팬이 직접 잇는다 — 아직 입고되지 않은 내 상자 하나를 고르고, 그 상자를 보낸 원 송장번호를 넣는다.
// 이어도 되는지는 DB 매칭 함수가 본인 토큰으로 판정한다. 못 찾으면 이유(남의 상자·아직 안 옴·기한 지남)를 나누지 않는다.
// 하루 실패 횟수 한도를 넘으면 서버가 429 와 문구를 준다 — 오류 줄에 그대로 보인다.

/** label = 상자 번호(FC-7K3M9-2), name = 고르는 칸에 보이는 이름(번호 · 구간) */
export type FinderBox = { boxId: string; label: string; name: string };

type Result = { kind: "ok"; label: string } | { kind: "no"; message: string };

export function FindMyBox({ boxes }: { boxes: readonly FinderBox[] }) {
  const id = useId();
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 찾기 결과가 나오면 결과 칸으로 포커스를 옮긴다 — 마지막 상자를 찾으면 양식이 사라져 포커스가 갈 곳이 없어지기 때문이다
  const moved = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moved.current || !result) return;
    moved.current = false;
    resultRef.current?.focus();
  }, [result]);
  // 찾은 상자는 다시 읽으면 목록에서 빠진다 — 고른 상자가 없어졌으면 첫 상자로
  const current = boxes.find((b) => b.boxId === picked) ?? boxes[0] ?? null;

  async function submit(form: HTMLFormElement) {
    if (busy || !current) return;
    const value = new FormData(form).get("waybill");
    const parsed = parseWaybillInput(typeof value === "string" ? value : "");
    if (!parsed.ok) {
      setError(parsed.message);
      setResult(null);
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    const outcome = await postMatch(current.boxId, parsed.value);
    setBusy(false);
    if (outcome.kind === "ok") {
      moved.current = true;
      if (outcome.body.matched === true) {
        setResult({ kind: "ok", label: current.label });
        form.reset();
        router.refresh();
        return;
      }
      // 못 찾은 것은 실패가 아니라 찾기의 결과다
      setResult({ kind: "no", message: typeof outcome.body.message === "string" ? outcome.body.message : "맞는 상자를 못 찾았어요." });
      return;
    }
    setError(outcome.message);
    // 409 = 그 사이 입고됐다 — 목록을 다시 읽는다
    if (outcome.status === 409) router.refresh();
  }

  return (
    <div className={s.finder}>
      <h3 className={s["finder-q"]}>사무실에 도착했는데 주문을 못 찾은 상자가 있어요</h3>
      {current ? (
        <form
          aria-label="내 물건 찾기"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget);
          }}
        >
          <div className="field">
            <label htmlFor={`${id}-box`}>어느 상자인가요</label>
            <select
              id={`${id}-box`}
              className="input"
              value={current.boxId}
              onChange={(e) => setPicked(e.currentTarget.value)}
              aria-describedby={`${id}-box-hint`}
            >
              {boxes.map((b) => (
                <option key={b.boxId} value={b.boxId}>
                  {b.name}
                </option>
              ))}
            </select>
            <p className="hint" id={`${id}-box-hint`}>
              아직 입고되지 않은 내 상자만 보여요.
            </p>
          </div>
          <div className="field">
            <label htmlFor={`${id}-no`}>그 상자를 보낸 택배 송장번호</label>
            <input
              id={`${id}-no`}
              name="waybill"
              className="input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="숫자만 입력해요"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {error ? (
              <p className={s.error} id={`${id}-error`} role="alert">
                <span className={s["error-mark"]} aria-hidden="true">
                  !
                </span>
                {error}
              </p>
            ) : null}
          </div>
          <button type="submit" className="btn" aria-disabled={busy}>
            {busy ? "찾는 중…" : "찾기"}
          </button>
        </form>
      ) : (
        <p className={s["finder-none"]}>아직 입고되지 않은 상자가 없어요.</p>
      )}
      <div role="status">
        {result?.kind === "ok" ? (
          <div ref={resultRef} tabIndex={-1} className={`${s.result} ${s["result--ok"]}`}>
            <strong>찾았어요</strong>
            <p>{result.label} 상자와 이어졌어요. 이 상자는 입고 처리됐고, 곧 검수로 넘어가요.</p>
          </div>
        ) : null}
        {result?.kind === "no" ? (
          <div ref={resultRef} tabIndex={-1} className={s.result}>
            <strong>아직 못 찾았어요</strong>
            <p>{result.message}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
