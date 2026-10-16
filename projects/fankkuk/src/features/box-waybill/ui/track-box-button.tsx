"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CARRIER_LABEL, isCarrier, type Carrier } from "@/entities/parcel/model/carrier";
import { TRACKABLE_CARRIERS, trackingUrlOf } from "@/entities/parcel/model/carrier-tracking";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import d from "@/shared/ui/dialog-parts.module.css";

// 배송 조회 버튼 + 창 (action-center INV-J10 S10b, 시안 v21-addendum3/cre-action-center-c.html 창 A — 택배사 연결 전). 창 제목은 시안 창 A 그대로.
// 크리에이터가 자기가 보낸 상자의 택배사·송장번호를 넣으면 택배사 조회 페이지를 새 탭으로 여는 링크만 만든다.
// 서버를 부르지 않는다 — 송장번호를 저장하지 않고(카드 d93 ⑦) 상자를 어느 팬별 선물에도 잇지 않는다(잇는 길은 「내 상자 찾기」 창뿐).
// 창 A 시안의 「코드를 적지 않고 보냈어요」 줄은 두지 않는다 — 같은 줄에 「내 상자 찾기」 버튼이 늘 있다(카드 d96 ①).

export function TrackBoxButton({ meta, label, className = "btn btn--line" }: { meta: string; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} type="button" aria-haspopup="dialog" aria-label={label} onClick={() => setOpen(true)}>
        배송 조회
      </button>
      {open ? (
        <BottomSheet open title="도착하지 않았어요" meta={meta} onClose={() => setOpen(false)}>
          <TrackBoxForm />
        </BottomSheet>
      ) : null}
    </>
  );
}

function TrackBoxForm() {
  const id = useId();
  const [carrier, setCarrier] = useState<Carrier | "">("");
  const [waybill, setWaybill] = useState("");
  const carrierSelect = useRef<HTMLSelectElement>(null);
  // 열리면 첫 초점은 택배사 칸(시안 창 A 의 첫 입력)
  useEffect(() => carrierSelect.current?.focus(), []);
  const url = carrier ? trackingUrlOf(carrier, waybill) : null;
  return (
    <form className={d.stack} aria-label="배송 조회" noValidate onSubmit={(e) => e.preventDefault()}>
      <div className={d.f2}>
        <div className="field">
          <label className="label" htmlFor={`${id}-cr`}>
            택배사
          </label>
          <select ref={carrierSelect} id={`${id}-cr`} className="input" value={carrier} onChange={(e) => setCarrier(isCarrier(e.currentTarget.value) ? e.currentTarget.value : "")}>
            <option value="">고르세요</option>
            {TRACKABLE_CARRIERS.map((c) => (
              <option key={c} value={c}>
                {CARRIER_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-no`}>
            송장번호
          </label>
          <input
            id={`${id}-no`}
            className="input"
            type="text"
            inputMode="numeric"
            placeholder="숫자만 입력해요"
            autoComplete="off"
            value={waybill}
            onChange={(e) => setWaybill(e.currentTarget.value)}
          />
        </div>
      </div>
      <div className={d.btns}>
        {url && carrier ? (
          <a className="btn" href={url} target="_blank" rel="noopener noreferrer">
            {CARRIER_LABEL[carrier]}에서 배송 조회
            <svg className={d.ext} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
            <span className="sr-only">(새 탭)</span>
          </a>
        ) : (
          <button className="btn" type="button" disabled>
            배송 조회
          </button>
        )}
      </div>
    </form>
  );
}
