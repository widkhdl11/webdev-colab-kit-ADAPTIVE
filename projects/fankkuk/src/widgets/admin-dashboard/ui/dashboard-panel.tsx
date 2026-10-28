import Link from "next/link";
import type { DashboardTile } from "@/features/admin-dashboard/model/dashboard-tiles";
import a from "@/shared/ui/admin.module.css";
import s from "./dashboard-panel.module.css";

// 관리자 첫 화면 (docs/ux/pages/admin.md). 운영자 틀 안에서만 그려진다 — 운영자가 아니면 그 전에 404 다.
// 숫자와 링크뿐이다 — 상자 상태를 바꾸는 버튼은 없다(design-rules 8절). 세는 규칙은 features/admin-dashboard 가 정한다.

function Value({ tile }: { tile: DashboardTile }) {
  if (tile.value.kind === "failed") {
    return (
      <>
        <span className={`${s.val} ${s.dash}`} aria-hidden="true">
          —
        </span>
        <span className={s.failed}>불러오지 못했습니다</span>
      </>
    );
  }
  return (
    <span className={s.val}>
      {tile.value.count}
      {tile.value.capped ? "+" : ""}
      <small>건</small>
    </span>
  );
}

export function DashboardPanel({ tiles, today }: { tiles: DashboardTile[]; today: string }) {
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>오늘 할 일</h1>
          <p>{today}</p>
        </div>
      </div>
      <section aria-labelledby="dashboard-counts">
        <h2 id="dashboard-counts" className="sr-only">
          처리할 일 건수
        </h2>
        <div className={s.kpis}>
          {tiles.map((t) => {
            const zero = t.value.kind === "count" && t.value.count === 0 && !t.value.capped;
            return (
              <Link key={t.key} href={t.href} className={`${s.kpi} ${t.hot ? s.hot : ""} ${zero ? s.zero : ""}`}>
                <span className={s.lab}>{t.label}</span>
                <Value tile={t} />
                {t.foot ? <span className={s.foot}>{t.foot}</span> : null}
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
