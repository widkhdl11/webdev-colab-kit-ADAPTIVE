"use client";

import { useState, type ReactNode } from "react";
import s from "./together.module.css";

// 「이전 기록 N개 더 보기」 접힌 칸. 처음 펼칠 때 안을 그린다 — 접힌 카드의 사진은 펼치기 전에는 불러오지 않는다
// (사진은 그릴 때마다 서버가 60초짜리 서명 주소를 새로 만들어 넘긴다, together INV-F2). 한 번 펼친 뒤에는 접어도 그대로 둔다.

export function OlderRecords({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className={s.fold}
      onToggle={(e) => {
        if (e.currentTarget.open) setOpened(true);
      }}
    >
      <summary>{summary}</summary>
      {opened ? children : null}
    </details>
  );
}
