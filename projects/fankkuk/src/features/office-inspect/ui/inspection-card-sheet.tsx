"use client";

import { useState } from "react";
import { kstToday, toIsoDate } from "@/entities/creator/model/receiving";
import a from "@/shared/ui/admin.module.css";
import { LogoMark } from "@/shared/ui/logo";
import { cardCount, cardDate, inspectionDateLabel, MAX_CARD_COUNT, type CardSize } from "../model/inspection-card";
import s from "./inspection-card-sheet.module.css";

// 상자 속 검수 완료 카드 인쇄 (추가분 F-8, 시안 mockups/addendum/inspection-card.html).
// 카드에는 로고·「추적 장치 검수 완료」·검수일만 — 주문번호·닉네임·주소는 받지도 않는다.
// 인쇄하면 카드만 실제 크기(명함 90×50mm · 엽서 148×100mm)로 나온다.

const SIZE_LABEL: Record<CardSize, string> = { biz: "명함 90×50mm", post: "엽서 148×100mm" };

export function InspectionCardSheet() {
  const today = kstToday(new Date());
  const [dateInput, setDateInput] = useState(toIsoDate(today));
  const [size, setSize] = useState<CardSize>("biz");
  const [countInput, setCountInput] = useState(10);
  const date = cardDate(dateInput, today);
  const count = cardCount(countInput);
  const label = inspectionDateLabel(date);

  return (
    <>
      <div className={`${a.card} ${s.controls}`}>
        <div className={a.toolbar}>
          <div className={a.field}>
            <label htmlFor="ic-date">검수일</label>
            <input id="ic-date" className={a.input} type="date" max={toIsoDate(today)} value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
          </div>
          <fieldset className={s.sizes}>
            <legend className={a.fieldLabel}>크기</legend>
            {(Object.keys(SIZE_LABEL) as CardSize[]).map((k) => (
              <label key={k} className={s.sizeOpt}>
                <input type="radio" name="ic-size" value={k} checked={size === k} onChange={() => setSize(k)} />
                {SIZE_LABEL[k]}
              </label>
            ))}
          </fieldset>
          <div className={a.field}>
            <label htmlFor="ic-count">장수 (최대 {MAX_CARD_COUNT})</label>
            <input
              id="ic-count"
              className={`${a.input} ${a.num} ${s.count}`}
              type="number"
              min={1}
              max={MAX_CARD_COUNT}
              value={countInput}
              onChange={(e) => setCountInput(e.target.valueAsNumber)}
              onBlur={() => setCountInput(count)}
            />
          </div>
          <button type="button" className={a.btn} onClick={() => window.print()}>
            {count}장 인쇄
          </button>
        </div>
      </div>
      <div className={s.sheet} aria-label={`${label} 검수 완료 카드 ${count}장 미리 보기`}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={size === "biz" ? s.biz : s.post} aria-hidden={i > 0 ? true : undefined}>
            <LogoMark size={size === "biz" ? 56 : 80} />
            <div className={s.text}>
              <p className={s.title}>{size === "biz" ? <>추적 장치<br />검수 완료</> : "추적 장치 검수 완료"}</p>
              <p className={s.date}>{label}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
