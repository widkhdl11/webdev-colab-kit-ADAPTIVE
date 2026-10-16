"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { TIER_LABEL } from "@/entities/parcel/model/office-labels";
import { formatMonthDay } from "@/shared/lib/format/datetime";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import a from "@/shared/ui/admin.module.css";
import { postHeldLink, postLinkCandidates } from "../api/post-held-link-client";
import type { LinkCandidate } from "../model/link-held";

// 「주인 주문으로 입고」 버튼 + 확인 창 (inbound-address-code INV-C12, 카드 d94). 6자리 없이 온 대기 중 미확인 입고에만 부르는 쪽이 그린다(canLinkHeld).
// 순서: 문의한 팬의 닉네임 → 그 계정의 결제 완료·도착 전 상자 고르기 → 「송장번호와 내용물을 확인했어요」 → 입고.
// 주문번호를 적는 칸은 없다. 누가 언제 처리했는지는 DB 가 운영자 기록에 남긴다. 처리 중에는 창을 닫을 수 없다(결과를 놓치지 않게).
// 화면이 틀렸다고 본 칸(닉네임·상자·확인 표시)에는 오류를 잇고 그 칸으로 초점을 옮긴다. 서버가 거부한 것은 어느 칸인지 몰라 오류 줄만 보인다.

type Props = { id: string; waybillNo: string | null };

type ErrorField = "nickname" | "box" | "checked" | null;

function isCandidate(v: unknown): v is LinkCandidate {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.boxId === "string" && typeof c.label === "string" && typeof c.tier === "string" && c.tier in TIER_LABEL;
}

export function LinkHeldButton({ id, waybillNo }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const nickInput = useRef<HTMLInputElement>(null);
  const boxGroup = useRef<HTMLFieldSetElement>(null);
  const checkInput = useRef<HTMLInputElement>(null);
  const base = useId();
  const [nickname, setNickname] = useState("");
  const [looked, setLooked] = useState<string | null>(null); // 후보를 읽은 닉네임
  const [candidates, setCandidates] = useState<LinkCandidate[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field: ErrorField } | null>(null);
  const titleId = `${base}-title`;
  const errorId = `${base}-error`;
  const name = waybillNo ? `송장 ${waybillNo}` : "이 상자";

  // 틀린 칸으로 초점 — 상자 고르기는 첫 선택지로
  const focusKey = error ? `${error.field ?? ""}|${error.message}` : null;
  useEffect(() => {
    if (!focusKey || !error) return;
    if (error.field === "nickname") nickInput.current?.focus();
    else if (error.field === "box") boxGroup.current?.querySelector("input")?.focus();
    else if (error.field === "checked") checkInput.current?.focus();
  }, [focusKey, error]);

  function fail(message: string, field: ErrorField) {
    setError({ message, field });
  }

  function reset() {
    setNickname("");
    setLooked(null);
    setCandidates([]);
    setPicked(null);
    setChecked(false);
    setError(null);
  }

  function close() {
    if (busy) return;
    dialog.current?.close();
  }

  async function lookUp() {
    if (busy) return;
    const typed = nickname.trim();
    if (!typed) {
      fail("문의한 팬의 닉네임을 적어 주세요.", "nickname");
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await postLinkCandidates(id, typed);
    setBusy(false);
    if (outcome.kind !== "ok") {
      fail(outcome.message, outcome.status === 400 ? "nickname" : null);
      return;
    }
    const rows = Array.isArray(outcome.body.candidates) ? outcome.body.candidates.filter(isCandidate) : [];
    setLooked(typed);
    setCandidates(rows);
    setPicked(rows.length === 1 ? rows[0]!.boxId : null);
    if (rows.length === 0) fail("이 닉네임에는 결제가 끝났고 아직 도착 전인 상자가 없어요.", "nickname");
  }

  async function confirm() {
    if (busy) return;
    if (!looked) {
      fail("문의한 팬의 닉네임을 적고 「상자 보기」를 눌러 주세요.", "nickname");
      return;
    }
    if (!picked) {
      fail("상자를 골라 주세요.", "box");
      return;
    }
    if (!checked) {
      fail("송장번호와 내용물을 확인했는지 표시해 주세요.", "checked");
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await postHeldLink(id, looked, picked);
    setBusy(false);
    if (outcome.kind === "ok") {
      dialog.current?.close();
      router.refresh();
      return;
    }
    fail(outcome.message, null);
    if (isStaleFailure(outcome)) router.refresh();
  }

  const invalid = (field: ErrorField) => (error && error.field === field ? { "aria-invalid": true as const, "aria-describedby": errorId } : {});

  return (
    <>
      <button
        type="button"
        className={`${a.btn} ${a.btnSm} ${a.btnLine}`}
        aria-label={`${name} 주인 주문으로 입고`}
        onClick={() => {
          reset();
          dialog.current?.showModal();
        }}
      >
        주인 주문으로 입고
      </button>
      <dialog
        ref={dialog}
        className={a.dialog}
        aria-labelledby={titleId}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <div className={a.dlgBody}>
          <h2 id={titleId}>주인 주문으로 입고</h2>
          <p className={a.mono}>{name}</p>
          <form
            className={a.field}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void lookUp();
            }}
          >
            <label htmlFor={`${base}-nick`}>문의한 팬의 닉네임</label>
            <div className={a.btnRow}>
              <input
                ref={nickInput}
                id={`${base}-nick`}
                className={a.input}
                autoComplete="off"
                maxLength={40}
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setLooked(null);
                  setCandidates([]);
                  setPicked(null);
                }}
                {...invalid("nickname")}
              />
              <button type="submit" className={`${a.btn} ${a.btnSoft}`} aria-disabled={busy}>
                상자 보기
              </button>
            </div>
          </form>
          {looked && candidates.length > 0 ? (
            <fieldset ref={boxGroup} className={a.field} style={{ border: 0, padding: 0, margin: 0 }} {...invalid("box")}>
              <legend className={a.fieldLabel}>{looked}님의 도착 전 상자</legend>
              {candidates.map((c) => (
                <label key={c.boxId} className={a.check}>
                  <input type="radio" name={`${base}-box`} value={c.boxId} checked={picked === c.boxId} onChange={() => setPicked(c.boxId)} />
                  <span className={a.mono}>{c.label}</span> · {TIER_LABEL[c.tier]}
                  {c.paidAt ? <span className={a.faint}> · {formatMonthDay(c.paidAt)} 결제</span> : null}
                </label>
              ))}
            </fieldset>
          ) : null}
          {looked && candidates.length > 0 ? (
            <label className={a.check}>
              <input ref={checkInput} type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} {...invalid("checked")} />
              송장번호와 내용물을 확인했어요
            </label>
          ) : null}
          <div role="status">
            {error && (
              <p className={a.errorLine} id={errorId}>
                <span className={a.errorMark} aria-hidden="true">
                  !
                </span>
                {error.message}
              </p>
            )}
          </div>
        </div>
        <div className={a.dlgFoot}>
          <button type="button" className={`${a.btn} ${a.btnLine}`} onClick={close} aria-disabled={busy}>
            닫기
          </button>
          <button type="button" className={`${a.btn} ${a.btnInk}`} onClick={() => void confirm()} aria-disabled={busy}>
            {busy ? "처리하는 중…" : "입고"}
          </button>
        </div>
      </dialog>
    </>
  );
}
