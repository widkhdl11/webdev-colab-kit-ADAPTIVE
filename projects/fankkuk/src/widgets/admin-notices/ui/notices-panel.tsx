"use client";

import { useState } from "react";
import { noticeBodyText, type AdminNotice } from "@/entities/notice/model/admin-notice";
import { NoticeForm, type NoticeDraft } from "@/features/admin-notice-edit/ui/notice-form";
import { formatMonthDay } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";

// 관리자 「공지」 본문 (admin-console INV-K11·K8, 시안 admin/notices.html). 운영자(대표·직원) 누구나 쓰고 고친다.
// 고정한 글이 먼저, 그다음 최신순(DB 가 정한 순서). 쓴 사람은 닉네임으로만 — 쓴 사람이 기록되기 전의 옛 공지는 비워 둔다.

export function NoticesPanel({ notices }: { notices: readonly AdminNotice[] }) {
  const [editing, setEditing] = useState<NoticeDraft | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function startEditing(n: AdminNotice) {
    setEditing({ slug: n.slug, title: n.title, body: noticeBodyText(n.body), pinned: n.pinned });
    setSaved(null);
    // 양식이 새 key 로 다시 그려진 뒤에 칸으로 옮긴다
    requestAnimationFrame(() => document.getElementById("notice-title")?.focus());
  }

  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>공지</h1>
          <p>팬과 크리에이터 화면의 공지사항에 보여요. 고정한 글은 맨 위에 있어요.</p>
        </div>
      </div>

      <div className={a.split}>
        <div className={a.tblWrap}>
          <table className={a.tbl} style={{ minWidth: 540 }}>
            <caption className="sr-only">공지 목록</caption>
            <thead>
              <tr>
                <th scope="col">제목</th>
                <th scope="col">고정</th>
                <th scope="col">쓴 사람</th>
                <th scope="col">올린 날</th>
                <th scope="col">
                  <span className="sr-only">관리</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {notices.length === 0 ? (
                <tr>
                  <td colSpan={5} className={a.empty}>
                    아직 올린 공지가 없어요.
                  </td>
                </tr>
              ) : (
                notices.map((n) => (
                  <tr key={n.slug}>
                    <td>
                      <strong>{n.title}</strong>
                    </td>
                    <td>{n.pinned ? <span className={`${a.tag} ${a.tagBrand}`}>고정</span> : <span className={a.faint}>—</span>}</td>
                    <td>{n.authorNickname ?? <span className={a.faint}>—</span>}</td>
                    <td className={`${a.mono} ${a.nowrap}`}>{formatMonthDay(n.publishedAt)}</td>
                    <td className={a.act}>
                      <button
                        type="button"
                        className={`${a.btn} ${a.btnSm} ${a.btnLine}`}
                        onClick={() => startEditing(n)}
                        aria-label={`${n.title} 고치기`}
                        aria-pressed={editing?.slug === n.slug}
                      >
                        고치기
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <section className={`${a.card} ${a.sideCard}`} aria-labelledby="h-notice-form">
          <div className={a.sectionH}>
            <h2 id="h-notice-form">{editing ? "공지 고치기" : "공지 쓰기"}</h2>
          </div>
          <NoticeForm key={editing?.slug ?? "new"} editing={editing} onStopEditing={() => setEditing(null)} onSubmitStart={() => setSaved(null)} onSaved={setSaved} />
          <p role="status" className={a.doneLine} style={{ marginTop: 8 }}>
            {saved}
          </p>
        </section>
      </div>
    </>
  );
}
