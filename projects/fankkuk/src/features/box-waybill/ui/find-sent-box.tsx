"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { CARRIER_LABEL, CARRIERS, isCarrier, type Carrier } from "@/entities/parcel/model/carrier";
import { tierName } from "@/entities/parcel/model/size-tier";
import { parseWaybillInput } from "@/entities/parcel/model/waybill-no";
import d from "@/shared/ui/dialog-parts.module.css";
import { postFind } from "../api/post-waybill-client";

// 미확인 상자 창 B (inbound-address-code INV-C4 ②-나·C10, action-center INV-J7·J8 · 시안 v21-addendum3/cre-action-center-c.html 의 dlg-b).
// 역조공을 보낸 크리에이터가 6자리 없이 보낸 상자를 찾는 한 번의 창 — 송장번호·택배사를 넣고 어느 팬에게 보낸 상자인지 고르는 순간 맞춰 본다.
// 「두 값은 맞았지만 팬은 아직 안 고른」 중간 상태는 없다(카드 d93 ②). 줄의 몫을 먼저 골라 두지만 다른 후보로 바꿀 수 있다.
// 후보는 처리할 일 읽기와 같은 판정(결제 끝·입고 전·닫히지 않은 내 몫)의 목록이고, 서버가 찾기에서 후보인지 다시 판정한다 — 이 창이 보낸 몫 ID 는 믿지 않는다.
// 보류 상자 목록·도착일은 어디에도 보여 주지 않는다(INV-C10). 못 찾으면 이유를 나누지 않는다. 틀린 시도는 하루 다섯 번까지 — 서버가 막는다.

export type SentBoxCandidate = { shareId: string; nickname: string; tier: string };

type Result = { kind: "ok"; nickname: string } | { kind: "no"; message: string };

export function FindSentBox({
  candidates,
  initialShareId,
  onBusyChange,
  onFound,
}: {
  candidates: readonly SentBoxCandidate[];
  initialShareId: string;
  /** 보내는 중인지 — 창이 그동안 닫히지 않게 알린다 */
  onBusyChange?: (busy: boolean) => void;
  /** 찾았을 때 — 주면 목록 새로 읽기를 부르는 쪽에 맡긴다(창을 닫을 때 읽어야 결과가 사라지지 않는다) */
  onFound?: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const [carrier, setCarrier] = useState<Carrier | "">("");
  const [picked, setPicked] = useState(initialShareId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field: "waybill" | "carrier" | "fan" | null } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const waybillInput = useRef<HTMLInputElement>(null);
  const carrierSelect = useRef<HTMLSelectElement>(null);
  const fanGroup = useRef<HTMLFieldSetElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  async function submit(form: HTMLFormElement) {
    if (busy) return;
    const raw = new FormData(form).get("waybill");
    const parsed = parseWaybillInput(typeof raw === "string" ? raw : "");
    if (!carrier) {
      setError({ message: "택배사를 선택해 주세요.", field: "carrier" });
      carrierSelect.current?.focus();
      return;
    }
    if (!parsed.ok) {
      setError({ message: parsed.message, field: "waybill" });
      waybillInput.current?.focus();
      return;
    }
    const fan = candidates.find((c) => c.shareId === picked);
    if (!fan) {
      setError({ message: "상자를 받을 팬을 선택해 주세요.", field: "fan" });
      fanGroup.current?.querySelector("input")?.focus();
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    setResult(null);
    const outcome = await postFind({ kind: "share", id: fan.shareId }, parsed.value, carrier);
    setBusy(false);
    onBusyChange?.(false);
    if (outcome.kind === "ok") {
      if (outcome.body.matched === true) {
        setResult({ kind: "ok", nickname: fan.nickname });
        // 그 줄은 고른 몫에 입고됐으니 다음 읽기에서 없다(INV-J8) — 창을 연 버튼이 그 줄에 있으면 새로 읽는 순간 창도 사라지므로, 부르는 쪽이 닫을 때 읽게 한다
        if (onFound) onFound();
        else router.refresh();
        return;
      }
      setResult({ kind: "no", message: typeof outcome.body.message === "string" ? outcome.body.message : "일치하는 상자가 없습니다. 송장번호와 택배사를 확인해 주세요." });
      return;
    }
    setError({ message: outcome.message, field: null });
  }

  if (result?.kind === "ok") {
    return (
      <div ref={resultRef} tabIndex={-1} className={d.stack} role="status">
        <p className={d.done}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="10" />
            <path d="m16 9-5.5 5.5L8 12" />
          </svg>
          상자 확인 완료
        </p>
        <p className={d.note}>{result.nickname}님 선물</p>
      </div>
    );
  }

  return (
    <div className={d.stack}>
      <form
        className={d.stack}
        aria-label="내 상자 찾기"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <div className={d.f2}>
          <div className="field">
            <label className="label" htmlFor={`${id}-cr`}>
              택배사
            </label>
            <select
              ref={carrierSelect}
              id={`${id}-cr`}
              className="input"
              value={carrier}
              onChange={(e) => setCarrier(isCarrier(e.currentTarget.value) ? e.currentTarget.value : "")}
              aria-invalid={error?.field === "carrier" ? true : undefined}
              aria-describedby={error?.field === "carrier" ? `${id}-error` : undefined}
            >
              <option value="">택배사 선택</option>
              {CARRIERS.map((c) => (
                <option key={c} value={c}>
                  {CARRIER_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-no`}>
              송장번호
            </label>
            <input
              ref={waybillInput}
              id={`${id}-no`}
              name="waybill"
              className="input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="숫자만 입력"
              aria-invalid={error?.field === "waybill" ? true : undefined}
              aria-describedby={error?.field === "waybill" ? `${id}-error` : undefined}
            />
          </div>
        </div>
        <fieldset ref={fanGroup} className={d.fs}>
          <legend className="label">받는 팬 선택</legend>
          <div className={d.fans}>
            {candidates.map((c) => (
              <label key={c.shareId} className={d.opt}>
                <input
                  type="radio"
                  name={`${id}-fan`}
                  value={c.shareId}
                  checked={picked === c.shareId}
                  onChange={() => setPicked(c.shareId)}
                  aria-invalid={error?.field === "fan" ? true : undefined}
                  aria-describedby={error?.field === "fan" ? `${id}-error` : undefined}
                />
                <span>
                  {c.nickname}님 · {tierName(c.tier)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {error ? (
          <p className={d.error} id={`${id}-error`} role="alert">
            <span className={d.errorMark} aria-hidden="true">
              !
            </span>
            {error.message}
          </p>
        ) : null}
        {result?.kind === "no" ? (
          <div ref={resultRef} tabIndex={-1} role="status">
            <p className="t-strong">일치하는 상자 없음</p>
            <p className="t-meta">{result.message}</p>
          </div>
        ) : null}
        <div className={d.btns}>
          <button className="btn" type="submit" aria-disabled={busy}>
            {busy ? "찾는 중…" : "상자 찾기"}
          </button>
        </div>
      </form>
      <div className={d.help}>
        <p>송장번호를 모르시나요?</p>
        <Link className="btn btn--line" href="/support">
          1:1 문의
        </Link>
      </div>
    </div>
  );
}
