"use client";

import { useState } from "react";
import { describeProhibitedChange, type AdminProhibitedItem, type ProhibitedChange } from "@/entities/parcel/model/admin-prohibited";
import { DeleteProhibitedButton } from "@/features/admin-prohibited-edit/ui/delete-prohibited-button";
import { ProhibitedForm, type ProhibitedDraft } from "@/features/admin-prohibited-edit/ui/prohibited-form";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";

// 관리자 「보낼 수 없는 물품」 본문 (admin-console INV-K9·K8, 시안 admin/prohibited.html).
// 운영자(대표·직원) 누구나 더하고 고치고 지운다. 바뀐 기록은 고치거나 지울 수 없다(DB 가 막는다). 사람은 닉네임으로만.

type Props = { items: readonly AdminProhibitedItem[]; changes: readonly ProhibitedChange[] };

export function ProhibitedPanel({ items, changes }: Props) {
  const [editing, setEditing] = useState<ProhibitedDraft | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function startEditing(item: AdminProhibitedItem) {
    setEditing({ id: item.id, name: item.name, description: item.description });
    setSaved(null);
    // 양식이 새 key 로 다시 그려진 뒤에 칸으로 옮긴다
    requestAnimationFrame(() => document.getElementById("prohibited-name")?.focus());
  }

  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1 id="prohibited-title" tabIndex={-1}>
            보낼 수 없는 물품
          </h1>
          <p>크리에이터 페이지에 그대로 보이는 목록이에요. 이름은 40자, 설명은 120자까지예요.</p>
        </div>
      </div>

      {/* 추가·고치기·지우기 결과를 한곳에서 알린다 */}
      <p role="status" className={a.doneLine}>
        {saved}
      </p>

      <div className={a.split}>
        <div className={a.stack}>
          <section aria-labelledby="h-prohibited-list">
            <div className={a.sectionH}>
              <h2 id="h-prohibited-list">
                지금 보이는 목록 <span>{items.length}개</span>
              </h2>
            </div>
            <div className={a.tblWrap}>
              <table className={a.tbl} style={{ minWidth: 560 }}>
                <caption className="sr-only">보낼 수 없는 물품 목록</caption>
                <thead>
                  <tr>
                    <th scope="col">이름</th>
                    <th scope="col">설명</th>
                    <th scope="col">바뀐 시각</th>
                    <th scope="col">
                      <span className="sr-only">관리</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={a.empty}>
                        아직 등록한 물품이 없어요.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                        </td>
                        <td className={a.sub}>{item.description === "" ? <span className={a.faint}>설명 없음</span> : item.description}</td>
                        <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(item.updatedAt)}</td>
                        <td className={a.act}>
                          <button
                            type="button"
                            className={`${a.btn} ${a.btnSm} ${a.btnLine}`}
                            onClick={() => startEditing(item)}
                            aria-label={`${item.name} 고치기`}
                            aria-pressed={editing?.id === item.id}
                          >
                            고치기
                          </button>
                          <DeleteProhibitedButton itemId={item.id} itemName={item.name} returnFocusId="prohibited-title" onDone={setSaved} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="h-prohibited-log">
            <div className={a.sectionH}>
              <h2 id="h-prohibited-log">바뀐 기록</h2>
              <span>고치거나 지울 수 없어요</span>
            </div>
            <div className={a.tblWrap}>
              <table className={a.tbl} style={{ minWidth: 520 }}>
                <caption className="sr-only">물품 목록 변경 기록</caption>
                <thead>
                  <tr>
                    <th scope="col">시각</th>
                    <th scope="col">누가</th>
                    <th scope="col">무엇을</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.length === 0 ? (
                    <tr>
                      <td colSpan={3} className={a.empty}>
                        아직 바뀐 기록이 없어요.
                      </td>
                    </tr>
                  ) : (
                    changes.map((c, i) => (
                      <tr key={`${c.at}-${i}`}>
                        <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(c.at)}</td>
                        <td>{c.byNickname}</td>
                        <td>{describeProhibitedChange(c)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className={`${a.card} ${a.sideCard}`} aria-labelledby="h-prohibited-form">
          <div className={a.sectionH}>
            <h2 id="h-prohibited-form">{editing ? "항목 고치기" : "항목 추가"}</h2>
          </div>
          <ProhibitedForm key={editing?.id ?? "new"} editing={editing} onStopEditing={() => setEditing(null)} onSubmitStart={() => setSaved(null)} onSaved={setSaved} />
        </section>
      </div>
    </>
  );
}
