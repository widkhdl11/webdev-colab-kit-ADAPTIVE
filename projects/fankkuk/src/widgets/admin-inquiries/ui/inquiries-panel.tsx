"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminInquiry } from "@/entities/inquiry/model/admin-inquiry";
import type { InquiryStatus } from "@/entities/inquiry/model/inquiry-row";
import { INQUIRY_KIND_LABELS } from "@/entities/inquiry/model/inquiry-kind";
import { WithdrawForm } from "@/features/admin-account-withdraw/ui/withdraw-form";
import { AnswerForm } from "@/features/admin-inquiry-answer/ui/answer-form";
import { RestrictionForm } from "@/features/admin-inquiry-restrict/ui/restriction-form";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";

// 관리자 「1:1 문의」 본문 (admin-console INV-K11·K8, 시안 admin/inquiries.html).
// 왼쪽 목록(답변 대기가 먼저 — DB 순서) + 오른쪽 상세. 답이 달린 문의는 보낸 답을 읽기만 한다.
// 쓴 사람은 닉네임·아이디로만. 분류·주문번호는 쓴 사람이 고른·적은 그대로 보인다(주문번호는 실제 주문과 잇지 않는다 — 결정 d25).
// 「자주 쓰는 답 넣기」는 아직 자료가 없어 뺐다.
// 쓴 사람이 문의 제한 중이면 목록·상세에 표시하고 사유를 보인다. 제한·풀기 버튼은 대표 화면에만(INV-K12 — 최종 판정은 DB).

type Tab = "all" | InquiryStatus;

const TABS: readonly { key: Tab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "open", label: "답변 대기" },
  { key: "answered", label: "답변 완료" },
];

function StatusTag({ status }: { status: InquiryStatus }) {
  return status === "open" ? <span className={`${a.tag} ${a.tagWarn}`}>답변 대기</span> : <span className={a.tag}>답변 완료</span>;
}

export function InquiriesPanel({ inquiries, canRestrict }: { inquiries: readonly AdminInquiry[]; canRestrict: boolean }) {
  const [tab, setTab] = useState<Tab>("all");
  const [pickedId, setPickedId] = useState<string | null>(inquiries[0]?.id ?? null);

  const shown = tab === "all" ? inquiries : inquiries.filter((q) => q.status === tab);
  const count = (t: Tab) => (t === "all" ? inquiries.length : inquiries.filter((q) => q.status === t).length);
  // 고른 문의가 지금 탭에서 빠졌으면(또는 다시 읽어 사라졌으면) 보이는 목록의 첫 문의를 보여 준다
  const picked = shown.find((q) => q.id === pickedId) ?? shown[0] ?? null;

  // 목록에서 문의를 고르면 상세 제목으로 포커스를 옮긴다 — 화면 낭독기가 바뀐 상세를 제목부터 읽는다.
  // 처음 열 때·탭을 바꿀 때는 옮기지 않는다(사람이 고른 때만).
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusTitleNext = useRef(false);
  const pickedKey = picked?.id ?? null;
  useEffect(() => {
    if (!focusTitleNext.current) return;
    focusTitleNext.current = false;
    titleRef.current?.focus();
  }, [pickedKey]);
  const pick = (id: string) => {
    focusTitleNext.current = id !== picked?.id;
    setPickedId(id);
  };

  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>1:1 문의</h1>
          <p>쓴 사람과 운영자만 볼 수 있는 글이에요. 답을 달면 쓴 사람이 고칠 수 없어요.</p>
        </div>
      </div>

      {canRestrict && (
        <div style={{ marginBottom: 16 }}>
          <WithdrawForm />
        </div>
      )}

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
                        <button type="button" className={a.pick} aria-current={q.id === picked?.id} onClick={() => pick(q.id)}>
                          <span className={a.pickTitle}>
                            <span>{q.title}</span>
                            <StatusTag status={q.status} />
                          </span>
                          <span className={a.pickMeta}>
                            {INQUIRY_KIND_LABELS[q.kind]} · {q.authorNickname}
                            {q.authorRestricted && " (문의 제한 중)"} · {formatStamp(q.createdAt)}
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

        <section className={a.card} aria-labelledby="inquiry-title">
          {picked ? (
            <>
              <div className={a.sectionH}>
                <h2 id="inquiry-title" ref={titleRef} tabIndex={-1} style={{ fontSize: 18 }}>
                  {picked.title}
                </h2>
                <StatusTag status={picked.status} />
              </div>
              <dl className={a.kv} style={{ marginBottom: 12 }}>
                <dt>작성자</dt>
                <dd>
                  {picked.authorNickname} <span className={`${a.sub} ${a.mono}`}>({picked.authorLoginId})</span>
                </dd>
                <dt>분류</dt>
                <dd>{INQUIRY_KIND_LABELS[picked.kind]}</dd>
                <dt>주문번호</dt>
                <dd className={picked.orderNo ? a.mono : a.sub}>{picked.orderNo ?? "적지 않음"}</dd>
                <dt>쓴 시각</dt>
                <dd className={a.mono}>{formatStamp(picked.createdAt)}</dd>
                <dt>문의 제한</dt>
                <dd>
                  {picked.authorRestricted ? (
                    <>
                      <span className={`${a.tag} ${a.tagWarn}`}>제한 중</span>{" "}
                      <span className={a.sub}>{picked.authorRestrictionReason}</span>
                    </>
                  ) : (
                    <span className={a.sub}>없음</span>
                  )}
                  {canRestrict && (
                    <div style={{ marginTop: 8 }}>
                      <RestrictionForm key={picked.id} inquiryId={picked.id} restricted={picked.authorRestricted} />
                    </div>
                  )}
                </dd>
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
