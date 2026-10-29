"use client";

import { useId, useState } from "react";
import { CopyButton } from "@/shared/ui/copy-button";
import s from "./box-waybill.module.css";

// 이 선물의 받는 주소 (inbound-address-code INV-C2·C3). 상자마다 사무실 주소 끝에 6자리가 붙은 주소가 하나씩이다.
// - 끝 6자리는 기본으로 가려 두고 「6자리 보기」를 눌러야 보인다(어깨 너머·화면 공유로 새지 않게).
// - 「전체 주소 복사」는 가려져 있어도 6자리를 포함한 전체 주소를 복사한다 — 팬은 그대로 붙여 넣어 보내기만 하면 된다.
// - 6자리가 빠진 기본 사무실 주소는 따로 보여 주지 않는다. 6자리는 DB 가 로그인한 주문 주인에게, 유효할 때만 준다 —
//   거절·반려·취소되거나 상자가 입고되면 이 칸을 그리지 않는다(부르는 쪽이 code 가 있을 때만 그린다).

type Props = {
  /** 사무실 주소(6자리 앞부분) */
  officeAddress: string;
  /** 이 상자의 6자리 */
  code: string;
  /** 화면 낭독기용 상자 이름(예: FC-7K3M9-2, 초코우유님 상자) */
  boxName: string;
  /** 한 화면에 받는 주소가 여러 개(상자 여럿)면 묶음 이름·복사 버튼 이름에 상자 이름을 붙여 낭독기가 구분하게 한다 */
  multiple?: boolean;
};

/** 받는 주소 전체 — 사무실 주소 상세 끝에 6자리 */
export function receivingAddressText(officeAddress: string, code: string): string {
  return `${officeAddress} ${code}`;
}

export function ReceivingAddress({ officeAddress, code, boxName, multiple = false }: Props) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const full = receivingAddressText(officeAddress, code);
  return (
    <div className={s.addr} role="group" aria-labelledby={`${id}-title`}>
      <p className={s["addr-title"]} id={`${id}-title`}>
        팬꾹 주소{multiple ? <span className="sr-only"> · {boxName}</span> : null}
      </p>
      <dl>
        <div>
          <dt>팬꾹 주소</dt>
          <dd>
            {officeAddress}{" "}
            {shown ? (
              <span className={s.code}>{code}</span>
            ) : (
              <>
                <span className={s.code} aria-hidden="true">
                  ••••••
                </span>
                <span className="sr-only">끝 6자리 가려짐</span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>받는 사람</dt>
          <dd>팬꾹</dd>
        </div>
      </dl>
      <div className={s["addr-actions"]}>
        <button type="button" className="btn btn--line btn--sm" aria-label={`${boxName} 팬꾹 주소 끝 6자리 ${shown ? "가리기" : "보기"}`} onClick={() => setShown((v) => !v)}>
          {shown ? "6자리 가리기" : "6자리 보기"}
        </button>
        <div>
          <CopyButton
            className="btn btn--soft btn--sm"
            text={full}
            label="전체 주소 복사"
            ariaLabel={multiple ? `${boxName} 전체 주소 복사` : undefined}
            copiedMessage="끝 6자리까지 전체 주소가 복사되었습니다."
            failedMessage="주소를 복사하지 못했습니다. ‘6자리 보기’를 눌러 전체 주소를 직접 입력해 주세요."
          />
        </div>
      </div>
      <p className={s["addr-note"]}>주소 끝 6자리로 상자를 구분합니다. 6자리를 포함한 전체 주소를 입력하고, 다른 사람과 공유하지 마세요.<br />송장의 보내는 분에는 팬꾹 닉네임을 입력해 주세요.</p>
    </div>
  );
}
