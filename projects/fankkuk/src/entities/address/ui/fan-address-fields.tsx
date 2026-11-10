"use client";

import type { ReactNode } from "react";
import type { Envelope } from "@/shared/lib/envelope/envelope";
import { SealedAddressForm, useSealedAddressEntry, type SealedAddressSendOutcome } from "@/shared/ui/sealed-address-form";
import { fanAddressPlaintext } from "../model/fan-address-plaintext";
import { surchargeRegionOf, type SurchargeRegion } from "../model/surcharge-region";

// 팬이 그때마다 입력하는 주소 칸(address-protection INV-P1·P17) — 결제 때 반송 주소(payment INV-M25)·선물함 신청(revgift-box INV-GB6)·
// 역조공 받기(reverse-gift INV-R4)·반송 주소 확인(office-workflow INV-W15)이 같이 쓴다. 팬 주소는 등록해 두지 않으므로 이름표(주소 별칭)가 없다(2026-11-08).
// 봉인 속 식별값은 그 팬의 계정(profiles.id — reverse-gift INV-R5): 송장 출력이 연 뒤 그 주문·신청·몫의 팬과 대조한다.
// 무엇에 실어 보내는지(send)·버튼 글자는 부르는 쪽이 정한다. 우편번호는 봉인 속에만 들어가고 서버로는 할증 구분만 간다(INV-P20 ②).

export type FanAddressFieldsProps = {
  idPrefix: string;
  /** 로그인한 팬의 계정 ID — 봉인할 내용에 묶는다 */
  accountId: string;
  sealingKeyPem: string;
  send: (envelope: Envelope, region: SurchargeRegion) => Promise<SealedAddressSendOutcome>;
  onSaved: () => void;
  onCancel?: () => void;
  onLoginExpired: () => void;
  submitClassName?: string;
  submitContent: (busy: boolean) => ReactNode;
  autoFocusFirst?: boolean;
  /** 바깥 폼 안에 넣을 때 group, 묶음 이름은 groupLabel */
  mode?: "form" | "group";
  groupLabel?: string;
};

export function FanAddressFields({ accountId, submitClassName = "btn", ...p }: FanAddressFieldsProps) {
  return (
    <SealedAddressForm<never, SurchargeRegion>
      idPrefix={p.idPrefix}
      sealingKeyPem={p.sealingKeyPem}
      toPlaintext={(f) => fanAddressPlaintext({ accountId, ...f })}
      classify={(zip) => surchargeRegionOf(zip)}
      send={p.send}
      onSaved={p.onSaved}
      onCancel={p.onCancel}
      onLoginExpired={p.onLoginExpired}
      submitClassName={submitClassName}
      submitContent={p.submitContent}
      autoFocusFirst={p.autoFocusFirst}
      mode={p.mode}
      groupLabel={p.groupLabel}
    />
  );
}

/**
 * 단계형 창(선물함 신청 모달)용 — 같은 칸·같은 봉인 내용(그 팬의 계정 ID)·같은 할증 구분을 칸 묶음(받을 곳 / 받는 분)으로 나눠 쓴다.
 * 보내기는 부르는 쪽이 seal() 의 봉인값으로 한다.
 */
export function useFanAddressEntry({ idPrefix, accountId, sealingKeyPem }: { idPrefix: string; accountId: string; sealingKeyPem: string }) {
  return useSealedAddressEntry<SurchargeRegion>({
    idPrefix,
    sealingKeyPem,
    toPlaintext: (f) => fanAddressPlaintext({ accountId, ...f }),
    classify: (zip) => surchargeRegionOf(zip),
  });
}

export type FanAddressEntry = ReturnType<typeof useFanAddressEntry>;
