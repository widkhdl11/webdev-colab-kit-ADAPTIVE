"use client";

import { useState } from "react";
import type { AdminInquiry, InquiryStatus } from "@/entities/inquiry/model/admin-inquiry";
import { AnswerForm } from "@/features/admin-inquiry-answer/ui/answer-form";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";

// 관리자 「1:1 문의」 본문 (admin-console INV-K11·K8, 시안 admin/inquiries.html).
// 왼쪽 목록(답변 대기가 먼저 — DB 순서) + 오른쪽 상세. 답이 달린 문의는 보낸 답을 읽기만 한다.
// 쓴 사람은 닉네임·아이디로만. 주문번호 칸과 「자주 쓰는 답 넣기」는 아직 자료가 없어 뺐다.

type Tab = "all" | InquiryStatus;

const TABS: readonly { key: Tab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "open", label: "답변 대기" },
  { key: "answered", label: "답변 완료" },
];

function StatusTag({ status }: { status: InquiryStatus }) {
  return status === "open" ? <span className={`${a.tag} ${a.tagWarn}`}>답변 대기</span> : <span className={a.tag}>답변 완료</span>;
}

export function InquiriesPanel({ inquiries }: { inquiries: readonly AdminInquiry[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [pickedId, setPickedId] = useState<string | null>(inquiries[0]?.id ?? null);

  const shown = tab === "all" ? inquiries : inquiries.filter((q) => q.status === tab);
  const count = (t: Tab) => (t === "all" ? inquiries.length : inquiries.filter((q) => q.status === t).length);
  // 고른 문의가 지금 탭에서 빠졌으면(또는 다시 읽어 사라졌으면) 보이는 목록의 첫 문의를 보여 준다
  const picked = shown.find((q) => q.id === pickedId) ?? shown[0] ?? null;

  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>1:1 문의</h1>
          <p>쓴 사람과 운영자만 볼 수 있는 글이에요. 답을 달면 쓴 사람이 고칠 수 없어요.</p>
        </div>
      </div>

      <div className={`${a.split} ${a.splitList}`}>
        <section aria-label="문의 목록">
          <div className={a.toolbar} style={{ marginBottom: 8 }}>
            <div className={a.tabs} role="group" aria-label="상태로 거르기">
              {TABS.map((t) => (
                <button key={t.key} type="button" className={a.tab} aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
                  {t.label} <span className={a.tabN}>{count(t.key)}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="sr-only" role="status">
            {shown.length}건
          </p>
          <div className={a.tblWrap}>
            <table className={a.tbl}>
              <caption className="sr-only">문의 목록</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">문의</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td className={a.empty}>문의가 없어요.</td>
                  </tr>
                ) : (
                  shown.map((q) => (
                    <tr key={q.id}>
                      <td className={a.pickCell}>
                        <button type="button" className={a.pick} aria-current={q.id === picked?.id} onClick={() => setPickedId(q.id)}>
                          <span className={a.pickTitle}>
                            <span>{q.title}</span>
                            <StatusTag status={q.status} />
                          </span>
                          <span className={a.pickMeta}>
                            {q.authorNickname} · {formatStamp(q.createdAt)}
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={a.card} aria-labelledby="inquiry-title" aria-live="polite">
          {picked ? (
            <>
              <div className={a.sectionH}>
                <h2 id="inquiry-title" style={{ fontSize: 18 }}>
                  {picked.title}
                </h2>
                <StatusTag status={picked.status} />
              </div>
              <dl className={a.kv} style={{ marginBottom: 12 }}>
                <dt>작성자</dt>
                <dd>
                  {picked.authorNickname} <span className={`${a.sub} ${a.mono}`}>({picked.authorLoginId})</span>
                </dd>
                <dt>쓴 시각</dt>
                <dd className={a.mono}>{formatStamp(picked.createdAt)}</dd>
              </dl>
              <div className={a.bubble}>{picked.body}</div>
              {picked.status === "answered" ? (
                <div style={{ marginTop: 12 }}>
                  <p className={a.fieldLabel} style={{ marginBottom: 4 }}>
                    보낸 답변
                    {picked.answeredByNickname && ` · ${picked.answeredByNickname}`}
                    {picked.answeredAt && ` · ${formatStamp(picked.answeredAt)}`}
                  </p>
                  <div className={`${a.bubble} ${a.bubbleStaff}`}>{picked.answer}</div>
                </div>
              ) : (
                <AnswerForm key={picked.id} inquiryId={picked.id} />
              )}
            </>
          ) : (
            <p id="inquiry-title" className={a.empty}>
              왼쪽에서 문의를 고르면 여기에 보여요.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
