import type { ReactNode } from "react";
import s from "./status-page.module.css";

// 없는 페이지·오류 화면 본문 — 문구는 용어집 13절. 버튼은 부르는 쪽이 넣는다(채운 버튼은 하나만)
// 설명은 생략할 수 있다 — 탈퇴한 크리에이터 화면은 제목만 둔다(UX 명세 handle.md, 시안에 없는 안내를 덧붙이지 않는다)
export function StatusPage({ title, description, actions }: { title: string; description?: string; actions: ReactNode }) {
  return (
    <main id="main" className={s.page}>
      <img className={s.art} src="/images/mascot-box.png" width={160} height={160} alt="" aria-hidden="true" />
      <h1 className={s.title}>{title}</h1>
      {description && <p className={s.desc}>{description}</p>}
      <div className={s.actions}>{actions}</div>
    </main>
  );
}
