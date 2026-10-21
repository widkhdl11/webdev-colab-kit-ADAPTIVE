import type { ReactNode } from "react";
import { TODO_FRAGMENT } from "../model/action-items";
import s from "./todo-box.module.css";

// 선물 상세 맨 위 「지금 할 일」 칸 (action-center INV-J13, design-rules 21절, 시안 v34-part1/gift-detail.html·revgift-detail.html 의 .tbox).
// 칸을 그릴지는 이 컴포넌트가 정하지 않는다 — 화면이 처리할 일 읽기 결과를 그 주문으로 거른 줄이 있을 때만 그린다.
// 처리 칸(버튼·양식)은 부르는 쪽이 기존 처리 함수를 그대로 부르는 것을 넣는다(INV-J4). 칸의 id 는 링크 조각 #todo 와 같다 —
// 지금 할 일 줄·알림 링크로 열면 브라우저가 이 칸으로 바로 내려온다. 칸은 늘 펼쳐져 있고, 여는 것만으로는 아무것도 처리하지 않는다.

/** 칸 하나 — 「지금 할 일」 작은 머리 + 할 일 줄들. revgift = 받은 역조공 받기 칸(위로 고양이 그림이 걸치고 주소 입력이 칸 안에 들어간다) */
export function TodoBox({ children, variant = "gift" }: { children: ReactNode; variant?: "gift" | "revgift" }) {
  return (
    <section id={TODO_FRAGMENT} className={`${s.box} ${variant === "revgift" ? s.rv : ""}`} aria-labelledby="todo-eyebrow">
      {variant === "revgift" ? <img className={s.peek} src="/images/home/icon-gift.webp" alt="" aria-hidden="true" width={96} height={96} /> : null}
      <p className={s.eyebrow} id="todo-eyebrow">
        지금 할 일
      </p>
      {children}
    </section>
  );
}

/**
 * 할 일 한 줄 — 제목 20 → 한 줄 설명(14 회색), 오른쪽에 큰 숫자(금액·남은 날)와 버튼.
 * wide = 처리 칸이 양식이라 아래 한 줄 전체를 쓴다(받는 주소 없이 보냈어요 찾기 · 역조공 받기 주소).
 */
export function TodoTask({
  kind,
  titleId,
  title,
  sub,
  figure,
  action,
  wide = false,
}: {
  kind: string;
  titleId: string;
  title: string;
  sub?: ReactNode;
  figure?: ReactNode;
  action: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={s.task} data-kind={kind} role="group" aria-labelledby={titleId}>
      <div className={s.text}>
        <h2 id={titleId}>{title}</h2>
        {sub ? <p className={s.sub}>{sub}</p> : null}
      </div>
      {figure ? <div className={s.fig}>{figure}</div> : null}
      <div className={wide ? s.wide : s.act}>{action}</div>
    </div>
  );
}
