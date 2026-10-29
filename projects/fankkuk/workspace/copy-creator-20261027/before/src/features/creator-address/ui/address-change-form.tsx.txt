"use client";

import { ADDRESS_LABELS, ADDRESS_LABEL_NAME, type AddressLabel } from "@/entities/address/model/address-label";
import { creatorAddressPlaintext } from "@/entities/address/model/creator-address-plaintext";
import { KakaoBubble } from "@/shared/ui/kakao-bubble";
import { SealedAddressForm } from "@/shared/ui/sealed-address-form";
import { sendCreatorAddress } from "../api/send-creator-address";

// 크리에이터 주소 등록·변경 입력 (address-protection INV-P1·P13). 시안: docs/design/mockups/site/v4/creator-settings.html 의 주소 바꾸기 창 +
// 역조공 받기 화면의 주소 입력 칸. 칸·봉인·저장 흐름은 공용 봉인 주소 폼(shared/ui/sealed-address-form)이 맡고, 여기서는 크리에이터 몫만 정한다:
// 봉인 속 식별값은 그 크리에이터(creators.id), 저장은 /api/creator/address, 버튼은 「카카오톡으로 서명하기」.
// 「카카오톡으로 서명하기」는 지금 로컬 가짜 서명 창구로 저장된다(카드 d28). 운영에서는 서버가 창구가 없어 거부한다.

const LABEL_OPTIONS = ADDRESS_LABELS.map((value) => ({ value, name: ADDRESS_LABEL_NAME[value] }));

export type AddressChangeFormProps = {
  creatorId: string;
  sealingKeyPem: string;
  /** 지금 등록된 주소의 이름표 — 바꿀 때 먼저 골라 둔다 */
  initialLabel?: AddressLabel | null;
  /** 폼이 나타날 때 첫 칸에 포커스 — 누른 버튼이 사라지는 자리에서 쓴다 */
  autoFocusFirst?: boolean;
  onSaved: (label: AddressLabel) => void;
  onCancel: () => void;
  onLoginExpired: () => void;
  /** 승인 안내 뒷문장을 붙일지 — 반송 주소 확인 창에서는 승인과 관계가 없어 뺀다 */
  approvalHint?: boolean;
};

export function AddressChangeForm({ creatorId, sealingKeyPem, initialLabel = null, autoFocusFirst = false, onSaved, onCancel, onLoginExpired, approvalHint = true }: AddressChangeFormProps) {
  return (
    <SealedAddressForm
      idPrefix="ca"
      sealingKeyPem={sealingKeyPem}
      toPlaintext={(f) => creatorAddressPlaintext({ creatorId, ...f })}
      labelOptions={LABEL_OPTIONS}
      initialLabel={initialLabel}
      labelHint={approvalHint ? "등록한 주소는 다시 조회할 수 없습니다. 선물 승인 시 주소 별칭과 등록일로 확인해 주세요." : "등록한 주소는 다시 조회할 수 없습니다."}
      send={sendCreatorAddress}
      submitClassName="btn btn--kakao"
      submitContent={(busy) => (
        <>
          <KakaoBubble />
          {busy ? "저장 중…" : "카카오톡 서명"}
        </>
      )}
      autoFocusFirst={autoFocusFirst}
      onSaved={onSaved}
      onCancel={onCancel}
      onLoginExpired={onLoginExpired}
    />
  );
}
