"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MyFanAddressStatus } from "@/entities/address/api/my-fan-address-status";
import { FanAddressForm } from "@/features/fan-address/ui/fan-address-form";
import { ReturnAddressWindow, type ReturnTarget } from "@/features/return-address/ui/return-address-window";
import { ADDRESS_KEY_MISSING_TEXT } from "@/shared/ui/sealed-address-form";
import { giftDetailHref } from "@/entities/action-item/model/action-items";

// 선물 상세 「지금 할 일」 칸의 「돌려받을 주소 확인」 버튼(action-center INV-J1·J4·J13, office-workflow INV-W15). 반송 주소 확인 창과
// 팬 받을 주소 입력 칸을 위젯이 잇는다(기능끼리는 서로 import 하지 않는다 — FSD). 확인은 기존 확인 처리를 그대로 부른다.
// 확인이 끝나면 같은 상세를 ?address=confirmed 로 다시 읽는다 — 상세 맨 위에 「돌려받을 주소를 확인했어요.」(2026-10-22 d113 진단 C-3, features/return-address ReturnConfirmedNotice).

/** 팬의 받을 주소 — 라우트가 읽어 넘긴다. 상태를 읽지 못했으면 status null, 봉인 공개키가 없으면 sealingKeyPem null */
export type FanReturnAddress = { accountId: string; status: MyFanAddressStatus | null; sealingKeyPem: string | null };

/** focusAfterIds: 확인이 끝나 칸이 사라지면 포커스를 옮길, 새로 읽어도 남는 요소(tabIndex -1)의 id 후보 — 앞에서부터 그려져 있는 첫 요소로 */
export function ReturnAddressButton({ target, meta, address, focusAfterIds = [] }: { target: ReturnTarget; meta: string; address: FanReturnAddress; focusAfterIds?: readonly string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const { accountId, sealingKeyPem } = address;
  // 확인이 끝나면 창이 닫힌 뒤에 포커스를 옮긴다. 창이 열린 동안은 바깥이 비활성이라 focus() 가 먹지 않고,
  // 창은 닫힐 때 포커스를 「확인하기」로 돌려놓는데 그 버튼은 새로 읽으면 사라진다 — 이 effect 는 창의 정리보다 늦게 돈다(ui 재리뷰 2026-10-22)
  useEffect(() => {
    if (open || !confirmed) return;
    focusAfterIds.map((id) => document.getElementById(id)).find((el) => el !== null)?.focus();
    setConfirmed(false);
  }, [open, confirmed, focusAfterIds]);
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
          onConfirmed={() => {
            setConfirmed(true);
            router.replace(`${pathname}?address=confirmed`, { scroll: false });
          }}
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
