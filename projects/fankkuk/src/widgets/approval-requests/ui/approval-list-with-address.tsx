"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { addressOnFileText } from "@/entities/address/ui/address-on-file-text";
import type { MyAddressStatus } from "@/entities/address/api/my-address-status";
import type { DecidedRequestView } from "@/entities/order/model/decided-request";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import { ApprovalRequestList, type ApprovalAddressStep } from "@/features/approval-request/ui/approval-request-list";
import { AddressChangeForm } from "@/features/creator-address/ui/address-change-form";
import { ADDRESS_KEY_MISSING_TEXT } from "@/features/creator-address/ui/address-copy";
import s from "./approval-requests.module.css";

// 승인 창의 주소 단계를 조립한다(approval-signature INV-S13 · address-protection INV-P16). 승인 기능과 주소 기능은 서로 import 하지
// 않으므로(FSD) 위젯이 둘을 잇는다. 주소가 없으면 입력 칸, 있으면 이름표·등록한 날과 「주소 바꾸기」. 주소 자체는 보이지 않는다.
// 주소 등록과 승인은 서명을 따로 받는다 — 여기서 주소를 저장해도 승인은 아래 서명 칸을 눌러야 일어난다.
// 「등록한 날」은 저장 직후에는 이 브라우저의 시각이다 — 다음에 화면을 열면 서버에 저장된 시각으로 바뀐다(날짜만 보여 차이가 거의 없다).

export function ApprovalListWithAddress({
  requests,
  decided,
  now,
  address,
  sealingKeyPem,
}: {
  requests: readonly ApprovalRequestView[];
  decided: readonly DecidedRequestView[];
  now: string;
  /** 로그인한 크리에이터의 주소 상태. 크리에이터 줄이 없거나 읽지 못했으면 null */
  address: MyAddressStatus | null;
  /** 주소 봉인 공개키(PEM). 없으면 주소 입력 대신 안내만 보인다. */
  sealingKeyPem: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(address);
  const [editing, setEditing] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const registered = status?.registered ?? false;

  // 바꾸던 입력을 그만두면 사라진 폼 대신 「주소 바꾸기」로 포커스를 돌린다
  const changeRef = useRef<HTMLButtonElement>(null);
  const [refocusChange, setRefocusChange] = useState(false);
  useEffect(() => {
    if (!refocusChange) return;
    changeRef.current?.focus();
    setRefocusChange(false);
  }, [refocusChange]);

  const renderStep = (closeSheet: () => void) => {
    if (!status) return <p className="err">주소 정보를 읽지 못했어요. 새로 고침한 뒤 다시 해 주세요.</p>;
    if (registered && !editing) {
      return (
        <>
          <div className={`card card--soft ${s["addr-on-file"]}`}>
            <p className="t-strong" data-address-on-file="">
              {addressOnFileText(status)}
            </p>
            <p className="t-meta">주소는 잠가서 보관해서 여기서도 보이지 않아요. 이사했거나 받는 곳이 바뀌었으면 승인하기 전에 바꿔 주세요.</p>
            <div>
              <button ref={changeRef} className="btn btn--line btn--sm" type="button" onClick={() => setEditing(true)}>
                주소 바꾸기
              </button>
            </div>
          </div>
          <p className={`t-meta ${s["addr-saved"]}`} role="status">
            {savedMsg ?? ""}
          </p>
        </>
      );
    }
    if (!sealingKeyPem) {
      return (
        <p className="err" role="status">
          {ADDRESS_KEY_MISSING_TEXT}
        </p>
      );
    }
    return (
      <>
        <p className="sub">
          {registered
            ? "새 주소를 입력하면 지금 주소를 덮어써요. 아직 송장을 뽑지 않은 선물부터 새 주소로 나가요."
            : "승인한 선물은 이 주소로 보내요. 받는 주소가 있어야 승인할 수 있어요."}
        </p>
        <p className="t-meta">주소는 이 브라우저에서 잠가서 보내요. 주소 서명을 마치면 이어서 승인 서명을 따로 받아요.</p>
        <AddressChangeForm
          creatorId={status.creatorId}
          sealingKeyPem={sealingKeyPem}
          initialLabel={status.label}
          autoFocusFirst={registered}
          onSaved={(label) => {
            // 서버에 저장된 뒤에만 바뀐다 — 이어서 같은 창에 승인 서명 칸이 붙고, 목록이 그 머리로 포커스를 옮긴다
            setSavedMsg(registered ? "주소를 바꿨어요." : "주소를 등록했어요.");
            setStatus({ ...status, registered: true, label, updatedAt: new Date().toISOString() });
            setEditing(false);
          }}
          onCancel={() => {
            if (!registered) return closeSheet();
            setEditing(false);
            setRefocusChange(true);
          }}
          onLoginExpired={() => router.push("/login?next=/creator/requests")}
        />
      </>
    );
  };

  const step: ApprovalAddressStep = {
    registered,
    ready: registered && !editing,
    renderStep,
    onOpen: () => {
      setEditing(false);
      setSavedMsg(null);
    },
    // 서버가 「주소 없음」으로 거부했다(INV-S13) — 화면이 들고 있던 「등록됨」이 틀렸으니 입력부터 다시
    onMissing: () => {
      setStatus((cur) => (cur ? { ...cur, registered: false, label: null, updatedAt: null } : cur));
      setEditing(false);
      setSavedMsg(null);
    },
  };
  return <ApprovalRequestList requests={requests} decided={decided} now={now} address={step} />;
}
