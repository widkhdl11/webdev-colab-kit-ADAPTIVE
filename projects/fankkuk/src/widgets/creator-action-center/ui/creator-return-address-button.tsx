"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MyAddressStatus } from "@/entities/address/api/my-address-status";
import { AddressChangeForm } from "@/features/creator-address/ui/address-change-form";
import { ADDRESS_KEY_MISSING_TEXT } from "@/features/creator-address/ui/address-copy";
import { ReturnAddressWindow, type ReturnTarget } from "@/features/return-address/ui/return-address-window";

// 크리에이터 처리할 일의 반송 주소 줄 버튼(action-center INV-J5, office-workflow INV-W15) — 보낸 역조공 몫·보낸 팬 선물 상자.
// 반송은 보낸 크리에이터의 등록 주소(address-protection INV-P13)로 간다 — 확인 창에 크리에이터 주소 입력 칸(승인 창과 같은 것)을 위젯이 잇는다.

export function CreatorReturnAddressButton({
  target,
  meta,
  address,
  sealingKeyPem,
}: {
  target: ReturnTarget;
  meta: string;
  address: MyAddressStatus | null;
  sealingKeyPem: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
            status: address,
            canEnter: sealingKeyPem !== null && address !== null,
            missingKeyText: ADDRESS_KEY_MISSING_TEXT,
            renderForm: (p) =>
              sealingKeyPem && address ? (
                <AddressChangeForm
                  creatorId={address.creatorId}
                  sealingKeyPem={sealingKeyPem}
                  initialLabel={p.initialLabel}
                  autoFocusFirst={p.autoFocusFirst}
                  onSaved={p.onSaved}
                  onCancel={p.onCancel}
                  onLoginExpired={() => router.push("/login?next=/creator/actions")}
                />
              ) : null,
          }}
        />
      ) : null}
    </>
  );
}
