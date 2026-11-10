"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useFanAddressEntry } from "@/entities/address/ui/fan-address-fields";
import type { FanBox } from "@/entities/revgift-box/api/box-reads";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import d from "@/shared/ui/dialog-parts.module.css";
import { DELIVERY_STAGE_LABEL } from "@/shared/config/delivery-status";
import type { DeliveryStatusSource } from "@/shared/config/delivery-status";
import { deliveryStage, isEstimatedStage } from "@/shared/lib/delivery/delivery-stage";
import { ConfirmDialog, StepDialog } from "@/shared/ui/step-dialog";
import { sendApply, sendReceived, sendWithdraw } from "../api/apply-requests";
import s from "./box-apply.module.css";

// 팬 신청 (revgift-box INV-GB4·GB5·GB6·GB9 · 화면 명세 docs/ux/pages/gift-boxes-boxId.md 「신청 폼을 모달 단계로」 · design-rules 43절).
// 페이지에는 버튼 하나(「선물함 신청」), 누르면 모달 — 1/3 받을 주소 → 2/3 받는 분 → 3/3 확인 → 「신청했습니다」/「대기 N번입니다.」. 페이지 주소는 바뀌지 않는다.
// 신청 = 받기 — 신청할 때마다 받는 분 이름·휴대폰 번호·주소를 입력하고, 이 브라우저에서 봉인한 값과 할증 구분만 신청 요청에 실린다
// (팬 등록 주소는 없다 — 2026-11-08, address-protection INV-P17). 팔로우·인원·마감·대기 판정은 서버가 한다.
// 다른 신청자 수·닉네임·받을 인원·대기 수는 보이지 않는다(정할 것 Q6). 제외됐는지도 보이지 않는다. 대기면 자기 순번만(INV-GB9).

/** 주소 입력에 필요한 것 — 봉인 공개키가 없거나 로그인 안 함이면 null(입력 대신 안내) */
export type ApplyAddressKey = { accountId: string; sealingKeyPem: string } | null;

/**
 * 내 선물의 배송 단계(delivery-status INV-DS1·DS2·DS6) — 팬꾹에서 보냈어요 → 보통 1~2일 안에 도착해요 → 도착했어요(팬의 받았어요) / 확인 없이 출고 + 3일이면 도착했어요(예상, 흐리게).
 * 받는 쪽은 팬이다 — 출고 뒤 [받았어요]를 누르면 확정. 송장번호·택배사 조회 링크는 없다(INV-DS3).
 */
function BoxDeliveryCard({
  box,
  delivery,
  now,
  deliverySource,
  here,
}: {
  box: FanBox;
  delivery: NonNullable<FanBox["delivery"]>;
  now: string;
  deliverySource: DeliveryStatusSource;
  here: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stage = deliveryStage({ printed: true, shippedAt: delivery.shippedOn, confirmed: delivery.received, carrier: delivery.carrier }, now, deliverySource);
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const o = await sendReceived(box.id);
    setBusy(false);
    if (o.ok) {
      router.refresh();
      return;
    }
    if (o.status === 401) {
      router.push(`/login?next=${encodeURIComponent(here)}`);
      return;
    }
    setError(o.message);
  };
  return (
    <div className={s.card}>
      {stage ? (
        <p className={isEstimatedStage(stage) ? `${s.done} ${s.estimated}` : s.done} data-delivery-stage={stage}>
          {DELIVERY_STAGE_LABEL[stage]}
        </p>
      ) : null}
      <div role="alert">{error ? <p className="err">{error}</p> : null}</div>
      {delivery.canConfirm ? (
        <div>
          <button className="btn" type="button" onClick={() => void confirm()} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
            받았어요
          </button>
        </div>
      ) : null}
    </div>
  );
}

type Step = 1 | 2 | 3 | "done";
const STEP_NAME = { 1: "받을 주소", 2: "받는 분", 3: "확인" } as const;
const STEP_NEXT = { 1: "다음: 받는 분", 2: "다음: 확인", 3: "다음: 신청 완료" } as const;
/** 다 찼을 때 3/3 의 다음 — 대기 순번을 받는다(시안 #fa3w) */
const WAIT_NEXT = "다음: 대기 순번 확인";

/** 휴대폰 번호 가운데를 가린다 — 010-****-5678 */
function maskPhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits.length >= 7 ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : "****";
}

/** 신청 모달 — 열려 있는 동안만 그린다(닫으면 입력이 사라진다) */
function ApplyDialog({
  box,
  token,
  addressKey,
  onClose,
  onLogin,
}: {
  box: FanBox;
  token: string | null;
  addressKey: NonNullable<ApplyAddressKey>;
  onClose: () => void;
  onLogin: () => void;
}) {
  const router = useRouter();
  const entry = useFanAddressEntry({ idPrefix: "ba", accountId: addressKey.accountId, sealingKeyPem: addressKey.sealingKeyPem });
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const [summary, setSummary] = useState<{ place: string; name: string; phone: string } | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const { values, focusFirst } = entry;

  // 단계가 바뀌면 그 단계의 첫 칸으로 초점(누른 「다음」이 사라지는 자리)
  useEffect(() => {
    if (step === 1) focusFirst("place");
    if (step === 2) focusFirst("person");
    // focusFirst 는 그릴 때마다 새로 만들어진다 — 단계가 바뀔 때만 옮긴다
  }, [step]);

  const typed = Object.values(values).some((v) => v.trim() !== "");
  const requestClose = () => {
    if (busy || refreshing) return;
    if (step !== "done" && typed) setDiscard(true);
    else onClose();
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const sealed = await entry.seal();
    if (sealed.kind !== "ok") {
      setBusy(false);
      if (sealed.kind === "error") setError(sealed.message);
      else setStep(values.recipientName.trim() && values.phone.trim() ? 1 : 2); // 틀린 칸이 있는 단계로 돌아간다
      return;
    }
    const o = await sendApply(box.id, token, sealed.envelope, sealed.classified);
    setBusy(false);
    if (o.ok) {
      setSummary(null);
      entry.clear(); // 입력한 주소를 화면 상태에 남기지 않는다
      setStep("done");
      startRefresh(() => router.refresh()); // 신청 상태(신청함·대기 N번)를 다시 읽는다
      return;
    }
    if (o.status === 401) {
      onLogin();
      return;
    }
    setError(o.status === 0 || o.status >= 500 ? "신청하지 못했습니다. 입력한 내용은 그대로 있습니다." : o.message);
    // 마감·이미 신청 — 지금 상태를 다시 읽는다
    if (o.status === 409 || o.status === 403) router.refresh();
  };

  const next = (e?: FormEvent) => {
    e?.preventDefault();
    if (step === 1 && entry.check(["place"])) setStep(2);
    else if (step === 2 && entry.check(["person"])) {
      setSummary({
        place: values.address2.trim() ? `${values.address1.trim()}…` : values.address1.trim(),
        name: values.recipientName.trim(),
        phone: maskPhone(values.phone),
      });
      setStep(3);
    } else if (step === 3) void submit();
  };

  const waiting = step === "done" && refreshing;
  // 다 찼으면(서버가 알려 준 참/거짓 하나, 숫자 없음 — Q6) 창 제목·확인 단계·버튼이 「대기 신청」(INV-GB5, 명세 enter_waitlist)
  const full = box.full;
  const applyWord = full ? "대기 신청" : "신청";
  const doneTitle = box.myState === "waitlisted" && box.waitlistNo ? `대기 ${box.waitlistNo}번입니다.` : "신청했습니다";

  let body: ReactNode;
  let footer: ReactNode;
  if (step === "done") {
    body = <p className={s.madeName}>{box.name}</p>;
    footer = (
      <button className="btn" type="button" onClick={onClose} aria-busy={waiting || undefined} aria-disabled={waiting || undefined}>
        닫기
      </button>
    );
  } else {
    body = (
      <form id="ba-form" className={s.stepForm} onSubmit={next} noValidate>
        <div className={s.stepFields} hidden={step !== 1}>
          {entry.placeFields}
          <p className={s.meta}>{`주소는 입력한 기기에서 암호화해 전송합니다. ${box.creator.name}님에게는 공개하지 않습니다.`}</p>
        </div>
        <div className={s.stepFields} hidden={step !== 2}>
          {entry.personFields}
        </div>
        {step === 3 && summary ? (
          <>
            {full ? (
              <p className={s.fullnote} role="status">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7.5v5l3 2" />
                </svg>
                <span>정원이 차서 대기로 신청됩니다</span>
              </p>
            ) : null}
            <dl className={s.sum}>
              <div>
                <dt>받을 주소</dt>
                <dd>{summary.place}</dd>
              </div>
              <div>
                <dt>받는 분</dt>
                <dd>{summary.name}</dd>
              </div>
              <div>
                <dt>휴대폰 번호</dt>
                <dd>{summary.phone}</dd>
              </div>
            </dl>
            {error ? (
              <p className={s.ferrBox} role="alert">
                {error}
              </p>
            ) : null}
          </>
        ) : null}
      </form>
    );
    footer = (
      <>
        {step !== 1 ? (
          <button
            className="btn btn--line"
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              setStep(step === 3 ? 2 : 1);
            }}
          >
            이전
          </button>
        ) : null}
        <button className="btn" type="submit" form="ba-form" aria-busy={busy || undefined} aria-disabled={busy || undefined}>
          {step === 3 ? (busy ? "신청 중…" : error ? `다시 ${applyWord}` : applyWord) : "다음"}
        </button>
      </>
    );
  }

  const discardWhat = values.recipientName.trim() ? `받는 사람 이름 · ${values.recipientName.trim()}` : values.address1.trim() ? `기본 주소 · ${values.address1.trim()}` : undefined;

  return (
    <>
      <StepDialog
        open
        title={step === "done" ? (waiting ? "신청했습니다" : doneTitle) : full ? "대기 신청" : "선물함 신청"}
        progress={step === "done" ? undefined : { step, total: 3, name: STEP_NAME[step], next: step === 3 && full ? WAIT_NEXT : STEP_NEXT[step], label: "신청 진행" }}
        footer={footer}
        busy={busy}
        onRequestClose={requestClose}
      >
        {body}
      </StepDialog>
      <ConfirmDialog open={discard} title="입력한 내용을 지울까요?" description={discardWhat} onCancel={() => setDiscard(false)}>
        <button className="btn btn--line" type="button" onClick={onClose}>
          지우기
        </button>
        <button className="btn" type="button" onClick={() => setDiscard(false)}>
          계속 쓰기
        </button>
      </ConfirmDialog>
    </>
  );
}

export function BoxApplyPanel({
  box,
  token,
  addressKey,
  missingKeyText,
  followSlot,
  now,
  deliverySource,
}: {
  box: FanBox;
  token: string | null;
  addressKey: ApplyAddressKey;
  /** 봉인 공개키가 없을 때 주소 입력 대신 보이는 안내 */
  missingKeyText: string;
  followSlot: ReactNode;
  /** 화면을 그린 서버 시각 — 배송 단계의 날짜 경계 */
  now: string;
  /** DB 의 단계 설정값(delivery-status INV-DS11) */
  deliverySource: DeliveryStatusSource;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [applying, setApplying] = useState(false);
  const here = `/gift-boxes/${box.id}${token ? `?invite=${encodeURIComponent(token)}` : ""}`;
  const toLogin = () => router.push(`/login?next=${encodeURIComponent(here)}`);

  // 신청 모달 — 신청 뒤 다시 읽어 페이지 상태가 바뀌어도 「신청했습니다」 창을 이어서 보인다
  const dialog =
    applying && addressKey ? (
      <ApplyDialog box={box} token={token} addressKey={addressKey} onClose={() => setApplying(false)} onLogin={toLogin} />
    ) : null;

  if (box.viewer === "guest") {
    return (
      <div className={s.card}>
        <p>로그인한 뒤 신청할 수 있습니다.</p>
        <Link className="btn" href={`/login?next=${encodeURIComponent(here)}`}>
          로그인
        </Link>
      </div>
    );
  }
  if (box.viewer === "owner") {
    return (
      <div className={s.card}>
        <p>내가 만든 선물함입니다.</p>
        <Link className="btn btn--line" href={`/creator/revgift-boxes/${box.id}`}>
          신청 관리
        </Link>
      </div>
    );
  }
  if (box.viewer === "not_fan") return <p className={s.card}>팬 계정만 신청할 수 있습니다.</p>;

  if (box.myState === "preparing") {
    if (box.delivery) return <BoxDeliveryCard box={box} delivery={box.delivery} now={now} deliverySource={deliverySource} here={here} />;
    return <p className={s.card}>선물이 준비되고 있어요.</p>;
  }
  if (box.myState === "cancelled") return <p className={s.card}>선물함이 취소됐어요.</p>;
  if (box.myState === "closed" || (!box.open && box.myState === "none")) return <p className={s.card}>이번 선물함은 마감됐어요.</p>;

  if (box.viewer === "not_follower" && box.myState === "none") {
    return (
      <div className={s.card}>
        <p>팔로우한 팬만 신청할 수 있습니다.</p>
        {followSlot}
      </div>
    );
  }

  const withdraw = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const o = await sendWithdraw(box.id);
    setBusy(false);
    setSheet(false);
    if (o.ok) {
      router.refresh();
      return;
    }
    if (o.status === 401) {
      toLogin();
      return;
    }
    setError(o.message);
    if (o.status === 409 || o.status === 403) router.refresh();
  };

  if (box.myState === "applied" || box.myState === "waitlisted") {
    return (
      <>
        <div className={s.card}>
          <p className={s.done}>{box.myState === "waitlisted" && box.waitlistNo ? `대기 ${box.waitlistNo}번입니다.` : "신청했습니다."}</p>
          <div role="alert">{error ? <p className="err">{error}</p> : null}</div>
          <div>
            <button className="btn btn--line" type="button" onClick={() => setSheet(true)}>
              신청 취소
            </button>
          </div>
          <BottomSheet open={sheet} title="신청을 취소할까요?" busy={busy} onClose={() => setSheet(false)}>
            <div className={d.stack}>
              <p className={d.note}>이 신청에 입력한 받을 주소는 바로 삭제됩니다.</p>
              <div className={`${d.btns} ${d.two}`}>
                <button className="btn btn--line" type="button" onClick={() => setSheet(false)} disabled={busy}>
                  닫기
                </button>
                <button className="btn" type="button" onClick={() => void withdraw()} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
                  신청 취소
                </button>
              </div>
            </div>
          </BottomSheet>
        </div>
        {dialog}
      </>
    );
  }

  // 신청 전 — 버튼 하나. 신청 수·받을 인원은 보이지 않는다(정할 것 Q6). 다 찼으면 「대기 신청」(INV-GB5)
  if (!addressKey) {
    return (
      <p className="err" role="status">
        {missingKeyText}
      </p>
    );
  }
  return (
    <>
      <div className={s.applyAct}>
        <button className="btn" type="button" onClick={() => setApplying(true)}>
          {box.full ? "대기 신청" : "선물함 신청"}
        </button>
      </div>
      {dialog}
    </>
  );
}
