"use client";

import { useEffect, useRef, useState } from "react";
import { ADDRESS_LABELS, ADDRESS_LABEL_NAME, type AddressLabel } from "@/entities/address/model/address-label";
import { creatorAddressPlaintext } from "@/entities/address/model/creator-address-plaintext";
import { surchargeRegionOf, type SurchargeRegion } from "@/entities/address/model/surcharge-region";
import type { Envelope } from "@/shared/lib/envelope/envelope";
import { KakaoBubble } from "@/shared/ui/kakao-bubble";
import { SealedAddressForm, type SealedAddressSendOutcome } from "@/shared/ui/sealed-address-form";
import f from "@/shared/ui/sealed-address-form.module.css";
import { checkCreatorAddress, startCreatorAddress, type StartAddressOutcome } from "../api/send-creator-address";
import s from "./address-change-form.module.css";

// 크리에이터 주소 등록·변경 입력 (address-protection INV-P1·P13·P22). 시안: docs/design/mockups/site/v4/creator-settings.html 의 주소 바꾸기 창 +
// 역조공 받기 화면의 주소 입력 칸. 칸·봉인은 공용 봉인 주소 폼(shared/ui/sealed-address-form)이 맡고, 여기서는 크리에이터 몫만 정한다:
// 봉인 속 식별값은 그 크리에이터(creators.id), 버튼은 「카카오톡 서명」, 그리고 서명 기다림.
// 「카카오톡 서명」 → 서버가 저장하지 않고 카카오톡 서명을 요청한다(INV-P22 ①) → 기다림(안내 · 남은 시간 · 다시 보내기 · 취소, 2초마다 결과를 묻는다)
// → 서버가 서명을 검증해 저장했다고 답한 뒤에만 onSaved(②). 가입 서명 직후의 첫 등록은 서버가 바로 저장해 기다림이 없다(④).
// 거절 · 서명 시간 지남 · 서명 확인 실패는 서버가 알려 준 상태 그대로 각각 다른 문구로 보이고, 「다시 보내기」(같은 봉인 값) · 「주소 다시 입력」을 둔다.
// 봉인된 값은 「다시 보내기」를 위해 이 화면 상태에만 둔다(평문 주소는 남기지 않는다). 운영에서 서명 창구가 없으면 서버가 거부한다(⑤).
// 결과 묻기는 「지금 요청」 하나에만 답한다 — 다시 보내기 뒤에 늦게 온 앞 요청의 답은 버린다.
// 이 폼을 승인 창·설정·가입 4단계·반송 주소 확인 창이 같이 쓴다 — 부르는 곳은 onSaved/onCancel 만 안다.

const LABEL_OPTIONS = ADDRESS_LABELS.map((value) => ({ value, name: ADDRESS_LABEL_NAME[value] }));
const POLL_MS = 2000;

/** 끝난 상태의 문구 — 서버가 알려 준 상태만(INV-P22 ②). unsent = 다시 보내기가 거부·실패(서버 문구만 보인다) */
const ENDED_TEXT = {
  rejected: "카카오톡에서 서명이 거절되어 주소를 저장하지 않았습니다.",
  expired: "서명 시간이 지나 주소를 저장하지 않았습니다.",
  failed: "서명을 확인하지 못해 주소를 저장하지 않았습니다.",
  unknown: "서명 결과를 확인하지 못했습니다.",
  unsent: null,
} as const;
const SEND_FAILED = "요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";

type Sealed = { envelope: Envelope; label: AddressLabel; region: SurchargeRegion };
type Phase =
  | { kind: "input" }
  | { kind: "waiting"; requestId: string; expiresAt: number; label: AddressLabel }
  | { kind: "ended"; reason: keyof typeof ENDED_TEXT };

/** 남은 시간 「m:ss」 */
function leftText(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export type AddressChangeFormProps = {
  creatorId: string;
  sealingKeyPem: string;
  /** 지금 등록된 주소의 이름표 — 바꿀 때 먼저 골라 둔다 */
  initialLabel?: AddressLabel | null;
  /** 폼이 나타날 때 첫 칸에 포커스 — 누른 버튼이 사라지는 자리에서 쓴다 */
  autoFocusFirst?: boolean;
  onSaved: (label: AddressLabel) => void;
  /** 없으면 취소 버튼을 그리지 않는다(가입 4단계 — 건너뛰기가 없는 단계, signup INV-U22) */
  onCancel?: () => void;
  onLoginExpired: () => void;
  /** 승인 안내 뒷문장을 붙일지 — 반송 주소 확인 창에서는 승인과 관계가 없어 뺀다 */
  approvalHint?: boolean;
};

export function AddressChangeForm({ creatorId, sealingKeyPem, initialLabel = null, autoFocusFirst = false, onSaved, onCancel, onLoginExpired, approvalHint = true }: AddressChangeFormProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  // 지금 요청(답을 받아들일 요청 ID) — 다시 보내는 동안은 비워 두어 어느 답도 받지 않는다
  const active = useRef<string | null>(null);
  const checking = useRef<string | null>(null);
  // 화면이 사라진 뒤 늦게 온 답으로 부르는 곳의 콜백을 부르지 않는다(「저장됨」이면 서버에는 저장됐다 — 다음에 열면 등록됨으로 보인다)
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // 부르는 곳의 콜백은 최신 것을 쓴다(묻기 타이머를 다시 걸지 않게)
  const saved = useRef(onSaved);
  const loginExpired = useRef(onLoginExpired);
  useEffect(() => {
    saved.current = onSaved;
    loginExpired.current = onLoginExpired;
  });
  const waitingId = phase.kind === "waiting" ? phase.requestId : null;
  const waitingUntil = phase.kind === "waiting" ? phase.expiresAt : 0;
  const waitingLabel = phase.kind === "waiting" ? phase.label : null;

  // 기다리는 동안: 1초마다 남은 시간을 세고, 2초마다 결과를 묻는다. 5분이 지나면 묻지 않고 「서명 시간 지남」(서버도 같은 답을 한다)
  useEffect(() => {
    if (!waitingId) return;
    const asked = waitingId;
    const finish = (reason: keyof typeof ENDED_TEXT) => {
      active.current = null;
      setPhase({ kind: "ended", reason });
    };
    const tick = async () => {
      if (checking.current === asked) return;
      if (Date.now() >= waitingUntil) {
        if (active.current === asked) finish("expired");
        return;
      }
      checking.current = asked;
      const r = await checkCreatorAddress(asked);
      if (checking.current === asked) checking.current = null;
      if (active.current !== asked) return; // 늦게 온 앞 요청의 답 — 버린다
      if (r.kind === "saved") {
        active.current = null;
        if (!mounted.current) return;
        setSealed(null);
        setPhase({ kind: "input" });
        if (waitingLabel) saved.current(waitingLabel);
      } else if (r.kind === "rejected" || r.kind === "expired" || r.kind === "failed") finish(r.kind);
      else if (r.kind === "error") finish("unknown");
      else if (r.kind === "login") {
        // 기다림을 끝내 묻기·시계를 멈춘다(401 을 계속 묻지 않게)
        active.current = null;
        setPhase({ kind: "input" });
        loginExpired.current();
      } else if (r.kind === "refused") {
        finish("failed");
        setError(r.message);
      }
    };
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => void tick(), POLL_MS);
    void tick();
    return () => {
      window.clearInterval(clock);
      window.clearInterval(poll);
    };
  }, [waitingId, waitingUntil, waitingLabel]);

  // 요청 보내기 — 처음(폼에서) 또는 「다시 보내기」(같은 봉인 값, resend)
  const request = async (value: Sealed, resend: boolean): Promise<StartAddressOutcome> => {
    const before = active.current;
    active.current = null;
    const r = await startCreatorAddress(value.envelope, value.label, value.region, resend);
    if (r.kind === "waiting") {
      active.current = r.requestId;
      setSealed(value);
      setError(null);
      setLimited(false);
      setNow(Date.now());
      setPhase({ kind: "waiting", requestId: r.requestId, expiresAt: Date.parse(r.expiresAt), label: value.label });
    } else if (r.kind !== "saved") active.current = before;
    return r;
  };

  // 공용 폼에 넘기는 보내기 — 저장됨이면 폼이 onSaved 를 부르고, 기다림이면 이 화면이 맡는다
  const send = async (value: Sealed): Promise<SealedAddressSendOutcome> => {
    const r = await request(value, false);
    if (r.kind === "saved") return { kind: "ok" };
    if (r.kind === "waiting") return { kind: "handled" };
    if (r.kind === "refused") return { kind: "refused", message: r.message };
    return r;
  };

  const resend = async () => {
    if (busy || !sealed) return;
    setBusy(true);
    setError(null);
    try {
      const o = await request(sealed, true);
      if (o.kind === "saved") {
        const label = sealed.label;
        setSealed(null);
        setPhase({ kind: "input" });
        onSaved(label);
      } else if (o.kind === "login") onLoginExpired();
      else if (o.kind === "refused" || o.kind === "failed") {
        // 다시 보내기가 거부·실패했다 — 앞 요청(서버가 이미 끝냈을 수 있다)으로 돌아가지 않고 끝남으로. 문구는 이번 실패 하나만
        active.current = null;
        setError(o.kind === "refused" ? o.message : SEND_FAILED);
        if (o.kind === "refused" && o.code === "too_many") setLimited(true);
        setPhase({ kind: "ended", reason: "unsent" });
      }
    } finally {
      setBusy(false);
    }
  };

  const backToInput = () => {
    active.current = null;
    setSealed(null);
    setError(null);
    setLimited(false);
    setPhase({ kind: "input" });
  };

  const cancel = () => {
    active.current = null;
    setPhase({ kind: "input" });
    onCancel?.();
  };

  if (phase.kind === "waiting") {
    return (
      <div className={`${s.wait} ${f["form-grid"]}`}>
        <ol className={s.kakao} role="status">
          <li>
            <span>카카오톡으로 서명 요청을 보냈습니다.</span>
          </li>
          <li>
            <span>카카오톡에서 요청을 열고 인증을 완료해 주세요.</span>
          </li>
        </ol>
        {/* 남은 시간은 매초 바뀌므로 알림 밖(timer, aria-live off) — 화면 읽기 프로그램이 매초 읽지 않게 */}
        <p className={`t-meta ${s.time}`}>
          남은 시간{" "}
          <span role="timer" aria-live="off">
            {leftText(phase.expiresAt - now)}
          </span>
        </p>
        <p className={`hint ${s.again}`}>
          요청이 오지 않았나요?{" "}
          <button className={s.textBtn} type="button" disabled={busy} onClick={() => void resend()}>
            다시 보내기
          </button>
        </p>
        <div role="alert">{error ? <p className={f.error}>{error}</p> : null}</div>
        {onCancel ? (
          <div className={f["sheet-btns"]}>
            <button className="btn btn--soft" type="button" onClick={cancel}>
              취소
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (phase.kind === "ended") {
    return (
      <div className={`${s.wait} ${f["form-grid"]}`}>
        <div role="alert">
          {ENDED_TEXT[phase.reason] ? <p className={f.error}>{ENDED_TEXT[phase.reason]}</p> : null}
          {error ? <p className={f.error}>{error}</p> : null}
        </div>
        <div className={f["sheet-btns"]}>
          {onCancel ? (
            <button className="btn btn--soft" type="button" onClick={cancel}>
              취소
            </button>
          ) : null}
          <button className="btn btn--soft" type="button" onClick={backToInput}>
            주소 다시 입력
          </button>
          {limited ? null : (
            <button className="btn btn--kakao" type="button" aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={() => void resend()}>
              <KakaoBubble />
              {busy ? "요청 중…" : "다시 보내기"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <SealedAddressForm
      idPrefix="ca"
      sealingKeyPem={sealingKeyPem}
      toPlaintext={(v) => creatorAddressPlaintext({ creatorId, ...v })}
      labelOptions={LABEL_OPTIONS}
      initialLabel={initialLabel}
      labelHint={approvalHint ? "등록한 주소는 다시 조회할 수 없습니다. 선물 승인 시 주소 별칭과 등록일로 확인해 주세요. 제주·도서 지역 주소면 팬의 결제 화면에 할증이 표시됩니다." : "등록한 주소는 다시 조회할 수 없습니다. 제주·도서 지역 주소면 팬의 결제 화면에 할증이 표시됩니다."}
      classify={(zip) => surchargeRegionOf(zip)}
      send={(envelope, label, region) => send({ envelope, label, region })}
      submitClassName="btn btn--kakao"
      submitContent={(sending) => (
        <>
          <KakaoBubble />
          {sending ? "요청 중…" : "카카오톡 서명"}
        </>
      )}
      autoFocusFirst={autoFocusFirst}
      onSaved={onSaved}
      onCancel={onCancel}
      onLoginExpired={onLoginExpired}
    />
  );
}
