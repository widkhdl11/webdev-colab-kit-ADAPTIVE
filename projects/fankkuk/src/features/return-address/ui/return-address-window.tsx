"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AddressLabel } from "@/entities/address/model/address-label";
import { addressOnFileText } from "@/entities/address/ui/address-on-file-text";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import d from "@/shared/ui/dialog-parts.module.css";
import { sendReturnConfirm, type ReturnRefusal } from "../api/send-return-confirm";

// 돌려받을 주소 확인 창 (office-workflow INV-W15, action-center INV-J1·J4·J5, address-protection INV-P16·P17).
// 등록 주소가 있으면 이름표와 바꾼 날만 보이고(주소 글자는 다시 보이지 않는다) 「바꾸기」로 새로 등록하거나 그대로 「확인」.
// 등록 전이면 「주소를 입력해 주세요」로 그 자리에서 등록한 뒤 확인한다 — 확인 없이 진행되는 길은 없다.
// 「확인」은 기존 확인 처리(/api/me/return-address)를 그대로 부르고, 끝나면 창을 닫고 다시 읽는다 — 카드·줄은 상자 상태로 사라진다(J4).
// 주소 입력 칸은 위젯이 넘긴다 — 팬은 받을 주소 등록, 크리에이터는 크리에이터 주소 등록(기능끼리는 서로 import 하지 않는다 — FSD).
// 글자는 용어집 return_address 행: 창 제목 「돌려받을 주소 확인」, 버튼 「확인」「바꾸기」.

export type ReturnAddressStep = {
  /** 로그인한 사람의 등록 주소 상태(등록 여부·이름표·바꾼 시각만). 읽지 못했으면 null */
  status: { registered: boolean; label: AddressLabel | null; updatedAt: string | null } | null;
  /** 주소 입력 칸을 그릴 수 있는가(봉인 공개키가 있다) */
  canEnter: boolean;
  /** canEnter 가 아닐 때 입력 칸 자리에 보이는 안내 */
  missingKeyText: string;
  renderForm: (p: { initialLabel: AddressLabel | null; autoFocusFirst: boolean; onSaved: (label: AddressLabel) => void; onCancel: () => void }) => ReactNode;
};

/** 확인할 상자 — 팬 선물 상자는 주문번호 + 상자 순번, 역조공 몫은 주문번호만(boxSeq null) */
export type ReturnTarget = { orderNo: string; boxSeq: number | null };

const REFUSED_TEXT: Record<Exclude<ReturnRefusal, "no_address">, string> = {
  not_found: "찾을 수 없는 상자예요.",
  expired: "기한이 지나 확인할 수 없어요.",
  closed: "지금은 확인할 수 없는 상자예요.",
  retry: "잠시 뒤 다시 해 주세요.",
};
const FAILED_TEXT = "확인하지 못했어요. 잠시 뒤 다시 해 주세요.";

export function ReturnAddressWindow({
  target,
  meta,
  address,
  open,
  onClose,
}: {
  target: ReturnTarget;
  /** 제목 아래 한 줄 — 어느 선물의 상자인지 */
  meta: string;
  address: ReturnAddressStep;
  open: boolean;
  onClose: () => void;
}) {
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
    const r = await sendReturnConfirm(target.boxSeq === null ? { orderNo: target.orderNo } : { orderNo: target.orderNo, boxSeq: target.boxSeq });
    setBusy(false);
    if (r.kind === "ok") {
      router.refresh();
      onClose();
      return;
    }
    if (r.kind === "login") {
      router.push("/login");
      return;
    }
    if (r.kind === "failed") {
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
    if (!status) return <p className="err">주소 정보를 읽지 못했어요. 새로 고침한 뒤 다시 해 주세요.</p>;
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
              바꾸기
            </button>
            <button ref={confirmRef} className="btn" type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => void confirm()}>
              확인
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
        setSavedMsg(registered ? "주소를 바꿨어요." : "주소를 등록했어요.");
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
    <BottomSheet open={open} title="돌려받을 주소 확인" meta={meta} busy={busy} onClose={onClose}>
      <div className={d.stack}>
        {confirming ? null : <h3 className="t-card">{registered ? "새 주소를 입력해 주세요" : "주소를 입력해 주세요"}</h3>}
        {body()}
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
      </div>
    </BottomSheet>
  );
}
