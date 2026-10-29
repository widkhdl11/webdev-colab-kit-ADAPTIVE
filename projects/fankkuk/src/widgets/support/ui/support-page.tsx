"use client";

import { statusTagClass } from "@/shared/ui/status-tone";
import { useRef, useState, type KeyboardEvent } from "react";
import { INQUIRY_KIND_LABELS } from "@/entities/inquiry/model/inquiry-kind";
import type { MyInquiry } from "@/entities/inquiry/model/my-inquiry";
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import { OVERSIZE_RULE, PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { PRICED_TIERS, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { InquiryForm } from "@/features/inquiry-submit/ui/inquiry-form";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { PROMISE } from "@/shared/config/site-copy";
import { SITE_INFO } from "@/shared/config/site-info";
import s from "./support.module.css";

// 고객센터. 시안: docs/design/mockups/site/part7-2026-10-22/support.html (design-rules 28절, UX 명세 docs/ux/pages/support.md)
// 머리 → 자주 묻는 질문(탭 줄 880, 펼친 답 680) → 1:1 문의(화면 폭 크림 띠 안 680 한 기둥) → 연락처 사실 한 줄.
// 1:1 문의: 로그인하지 않았으면 칸 없이 로그인 버튼 하나, 로그인했으면 실제로 접수한다(결정 d25).
// 양식 아래 「내 문의」는 자주 묻는 질문과 같은 펼치는 줄로 보인다(쓴 사람 본인 것만 — DB 가 거른다).
// 요금 답변의 숫자는 결제와 같은 DB 요금표(서버 page 가 읽어 넘긴다)를, 구간 기준은 size-tier 를 읽는다.

type Faq = { q: string; a: string };

type Category = { id: string; label: string; faqs: readonly Faq[] };

function feeAnswer(prices: PublicPriceTable): string {
  return `상자별 요금 · 크리에이터에게 보내는 배송비·검수비·서비스료 포함\n${PRICED_TIERS.map(
    (t) => `• ${PARCEL_TIER_GUIDE[t].name}: ${prices[t].priceKrw.toLocaleString("ko-KR")}원 · ${PARCEL_TIER_GUIDE[t].rule}`,
  ).join("\n")}`;
}

const categoriesFor = (prices: PublicPriceTable): readonly Category[] => [
  {
    id: "gift",
    label: "선물 보내기",
    faqs: [
      {
        q: "선물은 어떻게 보내나요?",
        a: "크리에이터를 선택하고 ‘선물 보내기’에서 상자 크기를 골라 결제해 주세요.\n결제 후 상자별 팬꾹 주소가 발급됩니다. 승인 후 주소를 확인할 수 있으며, 승인 전에는 ‘먼저 보내기’로 주소를 확인해 상자를 보낼 수 있습니다.",
      },
      {
        q: "크리에이터가 받지 않으면 어떻게 되나요?",
        a: `크리에이터가 거절하거나 결제 후 ${APPROVAL_DEADLINE_DAYS}일 이내에 승인하지 않은 선물은 배송하지 않습니다. 거절 사유는 공개하지 않습니다.\n• 입고 전·팬꾹 주소 미확인: 전액 환불\n• 입고 전·팬꾹 주소 확인: 반송 택배비를 제외한 금액 우선 환불. 이후 도착한 상자는 반송하며, 결제 후 30일 이내에 도착하지 않으면 보류한 택배비도 환불\n• 입고 후: 확인한 반송 주소로 반송하고, 반송 택배비를 제외한 금액 환불\n• 검수 불합격 상자: 환불 금액 없음`,
      },
      {
        q: "여러 상자를 한 번에 보낼 수 있나요?",
        a: "네. 한 건에 상자를 여러 개 등록할 수 있습니다. 요금은 상자별 크기·무게에 따라 적용됩니다.",
      },
    ],
  },
  {
    id: "fee",
    label: "요금",
    faqs: [
      { q: "요금은 얼마인가요?", a: feeAnswer(prices) },
      {
        q: "크기와 무게가 서로 다른 구간이면 어떻게 정해지나요?",
        a: "크기·무게 중 더 높은 요금 구간을 적용합니다. 예를 들어 세 변의 합이 80cm이고 무게가 7kg이면 중형 요금입니다.",
      },
      {
        q: "실제 상자 크기가 등록한 크기보다 크면 어떻게 되나요?",
        a: `크기·무게 실측 요금 구간이 선택한 구간보다 높으면 차액을 결제해야 합니다. ${OVERSIZE_RULE}는 반송하며, 검수비·서비스료·반송 택배비 차감 후 환불 금액은 없습니다.`,
      },
    ],
  },
  {
    id: "ship",
    label: "배송",
    faqs: [
      {
        q: "선물의 배송 상황은 어디에서 확인하나요?",
        a: "‘보낸 선물’에서 선물을 선택하면 진행 상황을 확인할 수 있습니다.\n등록 → 입고 → 검수 → 출고 → 배송 중 → 수령\n크리에이터 승인 여부는 검수와 출고 사이에 별도로 표시됩니다.",
      },
      {
        q: "크리에이터에게 보낸 상자의 송장번호를 볼 수 있나요?",
        a: "크리에이터에게 보낸 상자의 송장번호는 팬에게 공개하지 않습니다. 팬이 선물 상세에 입력하는 송장번호는 팬꾹 사무실로 보내는 상자의 송장번호입니다.",
      },
      {
        q: "검수는 어떻게 진행되나요?",
        a: `팬이 보낸 상자는 원래 송장을 제거하고 겉면·추적 장치를 검사합니다. ${PROMISE.inspectionOpen}\n보낼 수 없는 물품이 있거나 ${OVERSIZE_RULE}는 반송합니다. 단, 추적 장치가 확인된 상자는 보관 후 크리에이터의 신고 선택에 따라 수사기관에 인계하거나 반송합니다.\n이 경우 검수비·서비스료·반송 택배비가 차감되어 환불 금액이 없습니다.`,
      },
    ],
  },
  {
    id: "creator",
    label: "크리에이터",
    faqs: [
      {
        q: "크리에이터는 어떻게 가입하나요?",
        a: "가입 시 ‘크리에이터’를 선택해 주세요. 가입 후 ‘계정 설정’에서 채널 소유자 확인을 완료하면 ‘크리에이터 찾기’에 표시됩니다.\n유튜브·치지직은 해당 계정으로 로그인해 확인할 수 있습니다. 인스타그램은 프로페셔널 계정만 지원합니다.",
      },
      { q: "선물은 어떻게 승인하나요?", a: "승인 요청이 오면 선물마다 카카오톡으로 승인해 주세요. 한꺼번에 승인하는 기능은 없습니다." },
      { q: "특정 팬의 선물을 차단할 수 있나요?", a: "네. 승인 요청에서 팬을 차단하면 해당 팬은 새 선물을 등록할 수 없습니다. 차단 사실과 거절 사유는 팬에게 알리지 않습니다." },
    ],
  },
  {
    id: "account",
    label: "계정",
    faqs: [
      {
        q: "비밀번호를 잊었어요. 어떻게 재설정하나요?",
        a: "로그인 화면에서 「비밀번호 찾기」를 누르고 가입한 이메일 주소를 입력해 주세요. 비밀번호 재설정 링크를 보냅니다.",
      },
      { q: "아이디를 바꿀 수 있나요?", a: "아이디는 바꿀 수 없습니다. 닉네임은 「프로필 수정」에서, 이메일은 「계정 설정」에서 바꿀 수 있습니다." },
      { q: "휴대폰 번호는 어떻게 변경하나요?", a: "「계정 설정」의 휴대폰 번호에서 바꿀 수 있습니다. 지금 비밀번호를 입력하고 카카오톡으로 본인 확인을 다시 받아 주세요." },
    ],
  },
];

// 연락처는 사이트 하단과 같은 설정값(shared/config/site-info)을 읽는다. 값이 빈 칸은 그리지 않는다(design-rules 28절) —
// 점심 시간은 설정값이 없어 줄에서 뺐다.
const CONTACT: readonly (readonly [string, string])[] = (
  [
    ["운영 시간", SITE_INFO.supportHours],
    ["전화", SITE_INFO.supportPhone],
    ["이메일", SITE_INFO.supportEmail],
  ] as const
).filter(([, v]) => v.trim() !== "");

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 7.5 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MyInquiries({ inquiries }: { inquiries: readonly MyInquiry[] }) {
  return (
    <section className={s.mine} aria-labelledby="mine-title">
      <h3 id="mine-title">내 문의</h3>
      {inquiries.length === 0 ? (
        <p className="t-meta">등록한 문의가 없습니다.</p>
      ) : (
        <div className="acc">
          {inquiries.map((q) => (
            <details key={q.id}>
              <summary>
                <span className="q">
                  <b>{q.title}</b>
                </span>
                {q.status === "answered" ? <span className={statusTagClass("success")}>답변 완료</span> : <span className={statusTagClass("warn")}>답변 대기</span>}
                <Chevron />
              </summary>
              <div className="ans">
                <p className="t-meta">
                  {INQUIRY_KIND_LABELS[q.kind]}
                  {q.orderNo && ` · 주문번호 ${q.orderNo}`} · {formatDateTime(q.createdAt)}
                </p>
                <p className={s["mine-text"]}>{q.body}</p>
                {q.status === "answered" && q.answer !== null ? (
                  <div className={s["mine-reply"]}>
                    <p className="t-strong">팬꾹의 답변{q.answeredAt && ` · ${formatDateTime(q.answeredAt)}`}</p>
                    <p className={s["mine-text"]}>{q.answer}</p>
                  </div>
                ) : (
                  <p className="t-meta">답변 대기 중입니다. 접수 순서대로 답변합니다.</p>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

export function SupportPage({
  prices,
  signedIn,
  myInquiries,
  inquiryRestricted,
}: {
  prices: PublicPriceTable;
  signedIn: boolean;
  myInquiries: readonly MyInquiry[];
  inquiryRestricted: boolean;
}) {
  const categories = categoriesFor(prices);
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 화살표로 옆 탭을 고르고 포커스도 옮긴다(시안 site.js 와 같은 동작).
  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = (i + step + categories.length) % categories.length;
    setSelected(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <main id="main" className={s.page}>
      <section aria-labelledby="page-title">
        <div className="pub-inner">
          <header className="page-head">
            <div className="ph-row">
              <h1 className="ph-title" id="page-title">
                고객센터
              </h1>
            </div>
            <p className="ph-desc">자주 묻는 질문에서 궁금한 내용을 확인해 보세요. 원하는 답변을 찾지 못했다면 1:1 문의를 남겨 주세요.</p>
          </header>
        </div>
      </section>

      <section className={s.sec} aria-labelledby="faq-title">
        <div className="pub-inner">
          <div className="sec-head">
            <h2 id="faq-title">자주 묻는 질문</h2>
          </div>
          <div className={`tabs ${s.tabs}`} role="tablist" aria-label="질문 분류">
            {categories.map((c, i) => (
              <button
                key={c.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                className="tab"
                type="button"
                role="tab"
                id={`t-${c.id}`}
                aria-controls={`p-${c.id}`}
                aria-selected={i === selected}
                tabIndex={i === selected ? 0 : -1}
                onClick={() => setSelected(i)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
              >
                {c.label}
              </button>
            ))}
          </div>
          {categories.map((c, i) => (
            <div
              key={c.id}
              className="acc"
              role="tabpanel"
              id={`p-${c.id}`}
              aria-labelledby={`t-${c.id}`}
              hidden={i !== selected}
            >
              {c.faqs.map((f, j) => (
                <details key={f.q} open={j === 0}>
                  <summary>
                    <span className="q">
                      <b>{f.q}</b>
                    </span>
                    <Chevron />
                  </summary>
                  <div className="ans">
                    <p style={{ whiteSpace: "pre-line" }}>{f.a}</p>
                  </div>
                </details>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className={s.band} aria-labelledby="inquiry-title">
        <div className="pub-inner">
          <div className={s.col}>
            <div className="sec-head">
              <h2 id="inquiry-title">1:1 문의</h2>
              {/* 「내 문의」는 로그인해야 보이므로 로그인 전에는 뒷문장을 뺀다 */}
              <p className="t-lead t-desc">
                문의는 접수 순서대로 답변합니다.{signedIn && " 답변은 ‘내 문의’에서 확인해 주세요."}
              </p>
            </div>
            <InquiryForm signedIn={signedIn} restricted={inquiryRestricted} />
            {signedIn && <MyInquiries inquiries={myInquiries} />}
          </div>
        </div>
      </section>

      <section className={s.sec} aria-labelledby="contact-title">
        <div className="pub-inner">
          <div className="sec-head">
            <h2 id="contact-title">운영 시간 및 연락처</h2>
          </div>
          <dl className={s.fact}>
            {CONTACT.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </main>
  );
}
