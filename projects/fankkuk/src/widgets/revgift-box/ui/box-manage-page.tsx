import Link from "next/link";
import type { MyBox } from "@/entities/revgift-box/api/box-reads";
import { BOX_STATUS_NAME } from "@/entities/revgift-box/model/box-status";
import { BoxManagePanel } from "@/features/revgift-box-manage/ui/box-manage-panel";
import s from "./revgift-box.module.css";

// 신청 관리 창 화면(크리에이터, revgift-box INV-GB7). 머리: 선물함 이름 · 상태 · 공개 여부. 본문은 신청 관리 기능.
// applyUrl 은 라우트가 서버에서 만든 신청 링크(비공개면 초대 토큰 포함) — 주인에게만 보인다.
export function BoxManagePage({ box, applyUrl }: { box: MyBox; applyUrl: string }) {
  return (
    <main id="main" className="page-centered v34">
      <div className={s.col}>
        <p>
          <Link className={s.back} href="/creator/revgift-boxes">
            선물함 목록
          </Link>
        </p>
        <header className="page-head">
          <h1 className={`ph-title ${s.title}`}>{box.name}</h1>
          <p className={s.headTags}>
            <span className="tag tag--brand">{BOX_STATUS_NAME[box.status]}</span>
            <span className="tag">{box.isPublic ? "공개" : "비공개"}</span>
          </p>
        </header>
        <BoxManagePanel key={`${box.status}-${box.applications.length}`} box={box} applyUrl={applyUrl} />
      </div>
    </main>
  );
}
