"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { checkPhoneChangeVerification, requestPhoneChangeVerification, sendPhoneChange, type PhoneChangeField } from "../api/phone-change-client";
import s from "./phone-change.module.css";

// 내 정보의 「번호 변경」(signup INV-U12). 새 번호로 카카오톡 본인 확인 → 현재 비밀번호 → 변경.
// 인증이 됐는지는 서버가 카카오에게 묻는다 — 이 화면은 「번호 변경」을 누르면 서버에 확인을 맡기고, 확인되면 바꾸기를 보낸다.
// 내 정보 저장 폼 안에 놓이므로 폼을 따로 두지 않는다(버튼은 type="button", Enter 는 이 칸의 다음 단계).
// 포커스: 요청을 보내면 「현재 비밀번호」 칸으로, 「번호 다시 입력」을 누르면 번호 칸으로 옮긴다.
// 실패하면 문구는 role="alert" 로 읽히고, 서버가 알려 준 칸(입력칸이 없는 본인 확인 실패나 모르면 번호 칸)에 aria-invalid 를 달고 포커스를 옮긴다.

type InputKey = "phone" | "pw";
type Notice = { kind: "ok"; text: string } | { kind: "error"; input: InputKey; text: string } | null;

const inputOf = (field: PhoneChangeField | null): InputKey => (field === "currentPassword" ? "pw" : "phone");

export function PhoneChangePanel({ id, onLoginExpired, onChanged }: { id: string; onLoginExpired: () => void; onChanged: () => void }) {
  const uid = useId();
  const f = (name: string) => `${uid}-${name}`;
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [requested, setRequested] = useState(false);
  // 카카오 인증이 서버에서 한 번 확인되면 기억한다 — 서버는 같은 번호표를 두 번 확인해 주지 않으므로,
  // 지금 비밀번호를 틀려 다시 누를 때 확인부터 다시 보내면 「본인 확인을 다시」로 막힌다. 번호표가 아직 쓸 수 있는지는 바꾸기 처리가 DB 에서 다시 본다.
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // 포커스를 옮길 칸 — 그 칸이 그려진 뒤(지금 비밀번호 칸은 요청 뒤에 생긴다)에 옮기려고 상태로 둔다
  const [focusTo, setFocusTo] = useState<{ input: InputKey } | null>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusTo) return;
    (focusTo.input === "pw" ? pwRef : phoneRef).current?.focus();
  }, [focusTo]);

  const fail = (field: PhoneChangeField | null, text: string) => {
    const input = field === "currentPassword" && !requested ? "phone" : inputOf(field);
    setNotice({ kind: "error", input, text });
    setFocusTo({ input });
  };

  const requestVerification = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const r = await requestPhoneChangeVerification(phone);
    setBusy(false);
    if (r.kind === "login") return onLoginExpired();
    if (r.kind === "failed") return fail(r.field, r.message);
    setRequested(true);
    setNotice({ kind: "ok", text: "카카오톡으로 인증 요청을 보냈습니다. 인증 후 현재 비밀번호를 입력하고 ‘번호 변경’을 눌러 주세요." });
    setFocusTo({ input: "pw" });
  };

  const change = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    if (!verified) {
      const checked = await checkPhoneChangeVerification();
      if (checked.kind === "login") {
        setBusy(false);
        return onLoginExpired();
      }
      if (checked.kind === "failed") {
        setBusy(false);
        return fail(checked.field ?? "verification", checked.message);
      }
      if (!checked.verified) {
        setBusy(false);
        return fail("verification", "카카오톡 인증이 완료되지 않았습니다. 인증을 마친 뒤 다시 눌러 주세요.");
      }
      setVerified(true);
    }
    const r = await sendPhoneChange(phone, password);
    setBusy(false);
    if (r.kind === "login") return onLoginExpired();
    if (r.kind === "failed") {
      // 본인 확인이 쓸 수 없게 됐으면(10분 지남 등) 다음 누름에는 확인부터 다시 한다
      if (r.field === "verification") setVerified(false);
      return fail(r.field, r.message);
    }
    setPassword("");
    setNotice({ kind: "ok", text: "휴대폰 번호가 변경되었습니다." });
    onChanged();
  };

  const onEnter = (next: () => Promise<void>) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void next();
  };

  const invalid = (input: InputKey) => notice?.kind === "error" && notice.input === input;
  const describedBy = (input: InputKey, hint?: string) => [hint, invalid(input) ? f("err") : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={s.panel} id={id} role="group" aria-label="휴대폰 번호 변경">
      <div className="field">
        <label htmlFor={f("phone")}>새 휴대폰 번호</label>
        <input
          ref={phoneRef}
          className="input"
          id={f("phone")}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="010-0000-0000"
          maxLength={13}
          value={phone}
          readOnly={requested}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={onEnter(requestVerification)}
          aria-invalid={invalid("phone") || undefined}
          aria-describedby={describedBy("phone", f("phone-h"))}
        />
        <p className="hint" id={f("phone-h")}>
          새 휴대폰 번호로 카카오톡 인증을 진행해 주세요.
        </p>
      </div>
      {requested && (
        <div className="field">
          <label htmlFor={f("pw")}>현재 비밀번호</label>
          <input
            ref={pwRef}
            className="input"
            id={f("pw")}
            type="password"
            autoComplete="current-password"
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onEnter(change)}
            aria-invalid={invalid("pw") || undefined}
            aria-describedby={describedBy("pw")}
          />
        </div>
      )}
      <div>
        <p className={s.error} id={f("err")} role="alert">
          {notice?.kind === "error" ? notice.text : ""}
        </p>
        <p className={s.msg} role="status">
          {notice?.kind === "ok" ? notice.text : ""}
        </p>
      </div>
      <div className={s.actions}>
        {requested ? (
          <>
            <button className="btn" type="button" onClick={() => void change()} aria-disabled={busy} aria-busy={busy || undefined}>
              {busy ? "변경 중" : "번호 변경"}
            </button>
            <button
              className="btn btn--text"
              type="button"
              onClick={() => {
                setRequested(false);
                setVerified(false);
                setPassword("");
                setNotice(null);
                setFocusTo({ input: "phone" });
              }}
            >
              번호 다시 입력
            </button>
          </>
        ) : (
          <button className="btn" type="button" onClick={() => void requestVerification()} aria-disabled={busy} aria-busy={busy || undefined}>
            {busy ? "발송 중" : "카카오톡 인증 요청"}
          </button>
        )}
      </div>
    </div>
  );
}
