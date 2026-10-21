"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MyFanAddressStatus } from "@/entities/address/api/my-fan-address-status";
import { FanAddressForm } from "@/features/fan-address/ui/fan-address-form";
import { ReturnAddressWindow, type ReturnTarget } from "@/features/return-address/ui/return-address-window";
import { ADDRESS_KEY_MISSING_TEXT } from "@/shared/ui/sealed-address-form";
import { giftDetailHref } from "@/entities/action-item/model/action-items";

// 선물 상세 「지금 할 일」 칸의 「돌려받을 주소 확인」 버튼(action-center INV-J1·J4·J13, office-workflow INV-W15). 반송 주소 확인 창과
// 팬 받을 주소 입력 칸을 위젯이 잇는다(기능끼리는 서로 import 하지 않는다 — FSD). 확인은 기존 확인 처리를 그대로 부른다.

/** 팬의 받을 주소 — 라우트가 읽어 넘긴다. 상태를 읽지 못했으면 status null, 봉인 공개키가 없으면 sealingKeyPem null */
export type FanReturnAddress = { accountId: string; status: MyFanAddressStatus | null; sealingKeyPem: string | null };

export function ReturnAddressButton({ target, meta, address }: { target: ReturnTarget; meta: string; address: FanReturnAddress }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { accountId, sealingKeyPem } = address;
  return (
    <>
      <button className="btn" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        확인하기
      </button>
      {open ? (
        <ReturnAddressWindow
          target={target}
          meta={meta}
          open
          onClose={() => setOpen(false)}
          address={{
            status: address.status,
            canEnter: sealingKeyPem !== null,
            missingKeyText: ADDRESS_KEY_MISSING_TEXT,
            renderForm: (p) =>
              sealingKeyPem ? (
                <FanAddressForm
                  accountId={accountId}
                  sealingKeyPem={sealingKeyPem}
                  initialLabel={p.initialLabel}
                  autoFocusFirst={p.autoFocusFirst}
                  onSaved={p.onSaved}
                  onCancel={p.onCancel}
                  receiveHint={false}
                  onLoginExpired={() => router.push(`/login?next=${encodeURIComponent(giftDetailHref(target.orderNo))}`)}
                />
              ) : null,
          }}
        />
      ) : null}
    </>
  );
}
