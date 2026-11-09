"use client";

import { useEffect, useRef, useState } from "react";
import { BoxCreateForm } from "@/features/revgift-box-manage/ui/box-create-form";
import s from "./revgift-box.module.css";

// 팬에게 보내기 1페이지(설명) → 선물함 만들기 (UX 명세 docs/ux/pages/creator-revgifts-new.md 「1페이지 — 설명」, 확정 4~7).
// 설명은 화면이지 상태가 아니다 — 저장되는 것이 없다(revgift-box INV-GB1). 「이해했어요, 진행하기」를 누르면 같은 자리에 만들기 폼이 열린다.
// 배송비 횟수 비교는 쓰지 않는다(확정 4). 헤더·푸터는 라우트(app)가 붙인다.

export function BoxNewPage() {
  const [step, setStep] = useState<"explain" | "create">("explain");
  const headRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  // 진행하기를 누르면 그 버튼이 사라진다 — 폼 제목으로 초점을 옮긴다
  useEffect(() => {
    if (moved.current) headRef.current?.focus();
  }, [step]);

  return (
    <main id="main" className="page-centered v34">
      <div className={s.col}>
        <header className="page-head">
          <h1 className="ph-title" ref={headRef} tabIndex={-1}>
            {step === "explain" ? "팬에게 보내기" : "선물함 만들기"}
          </h1>
        </header>
        {step === "explain" ? (
          <div className={s.stack}>
            <ol className={s.flow} aria-label="보내는 흐름">
              <li>
                <img className={s.flowImg} src="/images/home/icon-gift.webp" alt="" aria-hidden="true" width={72} height={72} />
                크리에이터
              </li>
              <li>
                <img className={s.flowImg} src="/images/home/icon-inspect.webp" alt="" aria-hidden="true" width={72} height={72} />
                팬꾹
              </li>
              <li>
                <img className={s.flowImg} src="/images/home/icon-truck.webp" alt="" aria-hidden="true" width={72} height={72} />
                팬
              </li>
            </ol>
            <div className={s.compare}>
              <section className={s.cmp}>
                <h2 className={s.cmpH}>직접 보낼 때</h2>
                <p>팬마다 주소를 받고, 포장하고, 택배 접수를 팬 수만큼 합니다.</p>
              </section>
              <section className={`${s.cmp} ${s.cmpOn}`}>
                <h2 className={s.cmpH}>팬꾹</h2>
                <p>닉네임을 적은 선물을 큰 상자 하나에 담아 보내면, 팬꾹이 열어 팬마다 발송합니다.</p>
              </section>
            </div>
            <p className={s.note}>큰 상자를 팬꾹으로 보내는 택배비는 팬꾹 결제와 별도이며 크리에이터가 부담합니다(착불 가능).</p>
            <section className={s.prep} aria-labelledby="prep-h">
              <h2 id="prep-h" className={s.cmpH}>
                준비물
              </h2>
              <ul>
                <li>닉네임을 적거나 라벨을 붙인 선물</li>
                <li>큰 상자</li>
                <li>팬꾹 수령 주소</li>
              </ul>
            </section>
            <div>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  moved.current = true;
                  setStep("create");
                }}
              >
                이해했어요, 진행하기
              </button>
            </div>
          </div>
        ) : (
          <BoxCreateForm />
        )}
      </div>
    </main>
  );
}
