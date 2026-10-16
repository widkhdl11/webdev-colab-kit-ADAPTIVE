"use client";

import { ADDRESS_LABELS, ADDRESS_LABEL_NAME, type AddressLabel } from "@/entities/address/model/address-label";
import { fanAddressPlaintext } from "@/entities/address/model/fan-address-plaintext";
import { SealedAddressForm } from "@/shared/ui/sealed-address-form";
import { sendFanAddress } from "../api/send-fan-address";

// 팬 받을 주소 등록·변경 입력 (address-protection INV-P1·P16·P17). 크리에이터 주소 입력과 같은 칸·같은 흐름(공용 봉인 주소 폼)이고,
// 다른 것은 셋이다: 봉인 속 식별값은 그 팬의 계정(profiles.id — reverse-gift INV-R5), 저장은 /api/me/address,
// 카카오 서명 없이 「저장하기」(INV-P17 — 로그인만으로 한다).

const LABEL_OPTIONS = ADDRESS_LABELS.map((value) => ({ value, name: ADDRESS_LABEL_NAME[value] }));

export type FanAddressFormProps = {
  /** 로그인한 팬의 계정 ID — 봉인할 내용에 묶는다 */
  accountId: string;
  sealingKeyPem: string;
  initialLabel?: AddressLabel | null;
  autoFocusFirst?: boolean;
  onSaved: (label: AddressLabel) => void;
  onCancel: () => void;
  onLoginExpired: () => void;
};

export function FanAddressForm({ accountId, sealingKeyPem, initialLabel = null, autoFocusFirst = false, onSaved, onCancel, onLoginExpired }: FanAddressFormProps) {
  return (
    <SealedAddressForm
      idPrefix="fa"
      sealingKeyPem={sealingKeyPem}
      toPlaintext={(f) => fanAddressPlaintext({ accountId, ...f })}
      labelOptions={LABEL_OPTIONS}
      initialLabel={initialLabel}
      labelHint="주소는 등록한 뒤에 다시 보이지 않아요. 크리에이터가 보낸 선물을 받을 때 이 이름표와 등록한 날로 확인해요."
      send={sendFanAddress}
      submitClassName="btn"
      submitContent={(busy) => (busy ? "저장하는 중…" : "저장하기")}
      autoFocusFirst={autoFocusFirst}
      onSaved={onSaved}
      onCancel={onCancel}
      onLoginExpired={onLoginExpired}
    />
  );
}
