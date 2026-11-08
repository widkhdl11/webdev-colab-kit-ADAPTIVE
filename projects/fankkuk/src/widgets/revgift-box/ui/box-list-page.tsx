import Link from "next/link";
import type { MyBoxRow } from "@/entities/revgift-box/api/box-reads";
import { BOX_STATUS_NAME } from "@/entities/revgift-box/model/box-status";
import { formatDate } from "@/shared/lib/format/datetime";
import s from "./revgift-box.module.css";

// 내 선물함 목록(크리에이터). 줄마다 이름·상태·신청 수/받을 인원·만든 날, 누르면 신청 관리 창. 사람 칸이 없다(revgift-box INV-GB9).
export function BoxListPage({ rows }: { rows: readonly MyBoxRow[] }) {
  return (
    <main id="main" className="page-centered v34">
      <div className={s.col}>
        <header className={`page-head ${s.head}`}>
          <h1 className="ph-title">선물함</h1>
          <Link className="btn" href="/creator/revgift-boxes/new">
            선물함 만들기
          </Link>
        </header>
        {rows.length === 0 ? (
          <p className={s.none}>아직 만든 선물함이 없습니다.</p>
        ) : (
          <ul className={s.list}>
            {rows.map((r) => (
              <li key={r.id} className={s.item}>
                <Link className={s.itemLink} href={`/creator/revgift-boxes/${r.id}`}>
                  <span className={s.itemName}>{r.name}</span>
                </Link>
                <span className="tag">{BOX_STATUS_NAME[r.status]}</span>
                <span className={s.meta}>{`신청 ${r.activeCount}명 / ${r.capacity}명 · ${r.isPublic ? "공개" : "비공개"} · ${formatDate(r.createdAt)}`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
