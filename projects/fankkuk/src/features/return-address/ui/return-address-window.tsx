"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AddressLabel } from "@/entities/address/model/address-label";
import { addressOnFileText } from "@/entities/address/ui/address-on-file-text";
import type { Envelope } from "@/shared/lib/envelope/envelope";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import d from "@/shared/ui/dialog-parts.module.css";
import type { SealedAddressSendOutcome } from "@/shared/ui/sealed-address-form";
import { sendReturnConfirm, type ReturnRefusal } from "../api/send-return-confirm";

// 반송 주소 확인 창 (office-workflow INV-W15, action-center INV-J1·J4·J5, address-protection INV-P16·P17·P18).
// 두 가지 꼴이 있다.
//   order(팬 선물 상자를 보낸 팬): 결제 때 입력한 반송 주소(payment INV-M25)로 보낼지 확인한다. 주소 글자는 다시 보이지 않는다.
//     「주소 확인」은 주문 사본을 상자에 복사하고, 「다른 주소 입력」은 그 자리에서 봉인한 주소로 바로 확인한다(사본보다 앞선다).
//     주문 사본이 없으면(이 규칙 전에 결제한 주문 등) 서버가 no_address 로 답하고, 창이 입력 칸으로 바뀐다. 팬 등록 주소는 없다(2026-11-08).
//   registered(보낸 크리에이터): 크리에이터 등록 주소의 이름표와 바꾼 날만 보이고(INV-P16) 「주소 변경」으로 새로 등록하거나 그대로 「주소 확인」.
// 확인 없이 진행되는 길은 없다. 끝나면 창을 닫고 다시 읽는다 — 카드·줄은 상자 상태로 사라진다(J4).
// 다시 읽는 방법은 부르는 쪽이 정할 수 있다(onConfirmed) — 선물 상세 칸은 확인했다는 한 줄을 보이려고 쿼리를 붙여 다시 읽는다(2026-10-22 d113 진단 C-3).
// 주소 입력 칸은 위젯이 넘긴다(기능끼리는 서로 import 하지 않는다 — FSD).
// 글자는 문구 3 다듬은본(2026-10-26): 창 제목 「반송 주소 확인」, 버튼 「주소 확인」「주소 변경」.

/** 크리에이터 — 등록해 둔 주소를 확인하거나 바꾼다 */
export type RegisteredReturnAddress = {
  kind?: "registered";
  /** 로그인한 사람의 등록 주소 상태(등록 여부·이름표·바꾼 시각만). 읽지 못했으면 null */
  status: { registered: boolean; label: AddressLabel | null; updatedAt: string | null } | null;
  /** 주소 입력 칸을 그릴 수 있는가(봉인 공개키가 있다) */
  canEnter: boolean;
  /** canEnter 가 아닐 때 입력 칸 자리에 보이는 안내 */
  missingKeyText: string;
  renderForm: (p: { initialLabel: AddressLabel | null; autoFocusFirst: boolean; onSaved: (label: AddressLabel) => void; onCancel: () => void }) => ReactNode;
};

/** 팬 — 결제 때 입력한 주소를 확인하거나 다른 주소를 입력한다(payment INV-M25) */
export type OrderReturnAddress = {
  kind: "order";
  canEnter: boolean;
  missingKeyText: string;
  /** send 는 봉인된 주소로 확인을 보낸다. 성공하면 onDone */
  renderForm: (p: { autoFocusFirst: boolean; send: (envelope: Envelope) => Promise<SealedAddressSendOutcome>; onDone: () => void; onCancel?: () => void }) => ReactNode;
};

export type ReturnAddressStep = RegisteredReturnAddress | OrderReturnAddress;

/** 확인할 상자 — 팬 선물 상자는 주문번호 + 상자 순번, 역조공 몫은 주문번호만(boxSeq null) */
export type ReturnTarget = { orderNo: string; boxSeq: number | null };

const REFUSED_TEXT: Record<Exclude<ReturnRefusal, "no_address">, string> = {
  not_found: "상자를 찾을 수 없습니다.",
  expired: "확인 기한이 지났습니다.",
  closed: "현재 확인할 수 없는 상자입니다.",
  retry: "잠시 후 다시 시도해 주세요.",
};
const FAILED_TEXT = "확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";

type WindowProps = {
  target: ReturnTarget;
  /** 제목 아래 한 줄 — 어느 선물의 상자인지 */
  meta: string;
  address: ReturnAddressStep;
  open: boolean;
  onClose: () => void;
  /** 확인이 끝난 뒤 다시 읽기 — 주지 않으면 지금 화면을 그대로 다시 읽는다(router.refresh) */
  onConfirmed?: () => void;
};

export function ReturnAddressWindow(props: WindowProps) {
  return props.address.kind === "order" ? <OrderWindow {...props} address={props.address} /> : <RegisteredWindow {...props} address={props.address} />;
}

function writeOf(target: ReturnTarget) {
  return target.boxSeq === null ? { orderNo: target.orderNo } : { orderNo: target.orderNo, boxSeq: target.boxSeq };
}

function ErrorLine({ error }: { error: string | null }) {
  return (
    <div role="alert">
      {error ? (
        <p className={d.error}>
          <span className={d.errorMark} aria-hidden="true">
            !
          </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function OrderWindow({ target, meta, address, open, onClose, onConfirmed }: WindowProps & { address: OrderReturnAddress }) {
  const router = useRouter();
  // 다른 주소 입력 중이거나, 결제 때 사본이 없어 입력해야 한다
  const [entering, setEntering] = useState(false);
  const [noCopy, setNoCopy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const otherRef = useRef<HTMLButtonElement>(null);
  const [backFromEdit, setBackFromEdit] = useState(false);

  useEffect(() => {
    if (open && !entering && backFromEdit) {
      otherRef.current?.focus();
      setBackFromEdit(false);
    }
  }, [open, entering, backFromEdit]);

  const done = () => {
    if (onConfirmed) onConfirmed();
    else router.refresh();
    onClose();
  };

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await sendReturnConfirm(writeOf(target));
    setBusy(false);
    if (r.kind === "ok") return done();
    if (r.kind === "login") return router.push("/login");
    if (r.kind === "failed" || r.kind === "invalid") return setError(FAILED_TEXT);
    if (r.reason === "no_address") {
      // 결제 때 사본이 없다 — 그 자리에서 입력한다
      setNoCopy(true);
      setEntering(true);
      return;
    }
    setError(REFUSED_TEXT[r.reason]);
    router.refresh();
  }

  // 입력 칸이 봉인한 주소로 바로 확인한다 — 결과를 칸에 돌려준다(거부 문구는 칸이 보인다)
  const sendEntered = async (envelope: Envelope): Promise<SealedAddressSendOutcome> => {
    setError(null);
    const r = await sendReturnConfirm({ ...writeOf(target), address: envelope });
    if (r.kind === "ok") return { kind: "ok" };
    if (r.kind === "login") return { kind: "login" };
    if (r.kind === "invalid") return { kind: "refused", message: r.message };
    if (r.kind === "failed") return { kind: "failed" };
    if (r.reason !== "no_address") router.refresh();
    return { kind: "refused", message: r.reason === "no_address" ? FAILED_TEXT : REFUSED_TEXT[r.reason] };
  };

  function body() {
    if (!entering) {
      return (
        <>
          <div className="card card--soft">
            <p className="t-strong">결제할 때 입력한 반송 주소</p>
          </div>
          <div className={`${d.btns} ${d.two}`}>
            <button
              ref={otherRef}
              className="btn btn--line"
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                setEntering(true);
              }}
            >
              다른 주소 입력
            </button>
            <button className="btn" type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => void confirm()}>
              주소 확인
            </button>
          </div>
        </>
      );
    }
    if (!address.canEnter) {
      return (
        <p className="err" role="status">
          {address.missingKeyText}
        </p>
      );
    }
    return address.renderForm({
      autoFocusFirst: true,
      send: sendEntered,
      onDone: done,
      // 사본이 없으면 돌아갈 확인 단계가 없다 — 창을 닫는 것은 창의 닫기 버튼으로
      onCancel: noCopy
        ? undefined
        : () => {
            setEntering(false);
            setBackFromEdit(true);
          },
    });
  }

  return (
    <BottomSheet open={open} title="반송 주소 확인" meta={meta} busy={busy} onClose={onClose}>
      <div className={d.stack}>
        {entering ? <h3 className="t-card">주소 입력</h3> : null}
        {body()}
        <ErrorLine error={error} />
      </div>
    </BottomSheet>
  );
}

function RegisteredWindow({ target, meta, address, open, onClose, onConfirmed }: WindowProps & { address: RegisteredReturnAddress }) {
  const router = useRouter();
  const [status, setStatus] = useState(address.status);
  const [editing, setEditing] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  // 입력 칸의 「돌아가기」로 확인 단계에 돌아왔다 — 그 버튼이 사라졌으니 입력 칸을 연 「바꾸기」로 포커스를 돌린다
  const [backFromEdit, setBackFromEdit] = useState(false);
  const registered = status?.registered ?? false;
  const confirming = registered && !editing;

  // 등록·바꾸기가 끝나 확인 단계로 오면 「확인」에 포커스 — 누른 버튼(저장)이 사라졌다
  useEffect(() => {
    if (open && confirming && savedMsg) confirmRef.current?.focus();
  }, [open, confirming, savedMsg]);
  useEffect(() => {
    if (open && confirming && backFromEdit) {
      changeRef.current?.focus();
      setBackFromEdit(false);
    }
  }, [open, confirming, backFromEdit]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await sendReturnConfirm(writeOf(target));
    setBusy(false);
    if (r.kind === "ok") {
      if (onConfirmed) onConfirmed();
      else router.refresh();
      onClose();
      return;
    }
    if (r.kind === "login") {
      router.push("/login");
      return;
    }
    if (r.kind === "failed" || r.kind === "invalid") {
      setError(FAILED_TEXT);
      return;
    }
    if (r.reason === "no_address") {
      // 화면이 들고 있던 「등록됨」이 틀렸다 — 입력부터 다시
      setStatus({ registered: false, label: null, updatedAt: null });
      setEditing(false);
      setSavedMsg(null);
      return;
    }
    setError(REFUSED_TEXT[r.reason]);
    router.refresh();
  }

  function body() {
    if (!status) return <p className="err">주소 정보를 불러오지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.</p>;
    if (confirming) {
      return (
        <>
          <div className="card card--soft">
            <p className="t-strong" data-address-on-file="">
              {addressOnFileText(status)}
            </p>
          </div>
          <p className="t-meta" role="status">
            {savedMsg ?? ""}
          </p>
          <div className={`${d.btns} ${d.two}`}>
            <button
              ref={changeRef}
              className="btn btn--line"
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                setSavedMsg(null);
                setEditing(true);
              }}
            >
              주소 변경
            </button>
            <button ref={confirmRef} className="btn" type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => void confirm()}>
              주소 확인
            </button>
          </div>
        </>
      );
    }
    if (!address.canEnter) {
      return (
        <p className="err" role="status">
          {address.missingKeyText}
        </p>
      );
    }
    return address.renderForm({
      initialLabel: status.label,
      autoFocusFirst: true,
      onSaved: (label) => {
        // 서버에 저장된 뒤에만 바뀐다 — 이어서 같은 창에서 「확인」을 누른다
        setSavedMsg(registered ? "주소가 변경되었습니다." : "주소가 등록되었습니다.");
        setError(null);
        setStatus({ registered: true, label, updatedAt: new Date().toISOString() });
        setEditing(false);
      },
      onCancel: () => {
        if (registered) {
          setEditing(false);
          setBackFromEdit(true);
        } else onClose();
      },
    });
  }

  return (
    <BottomSheet open={open} title="반송 주소 확인" meta={meta} busy={busy} onClose={onClose}>
      <div className={d.stack}>
        {confirming ? null : <h3 className="t-card">{registered ? "주소 변경" : "주소 등록"}</h3>}
        {body()}
        <ErrorLine error={error} />
      </div>
    </BottomSheet>
  );
}
