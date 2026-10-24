"use client";

import { statusTagClass } from "@/shared/ui/status-tone";
import { useRef, useState, type KeyboardEvent } from "react";
import { INQUIRY_KIND_LABELS } from "@/entities/inquiry/model/inquiry-kind";
import type { MyInquiry } from "@/entities/inquiry/model/my-inquiry";
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import { OVERSIZE_RULE, PARCEL_TIER_GUIDE, RETURN_ON_INSPECTION_NOTICE } from "@/entities/parcel/model/size-tier";
import { PRICED_TIERS, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { InquiryForm } from "@/features/inquiry-submit/ui/inquiry-form";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { PROMISE } from "@/shared/config/site-copy";
import { orBlank, SITE_INFO, SITE_INFO_BLANK } from "@/shared/config/site-info";
import s from "./support.module.css";

// 고객센터. 시안: docs/design/mockups/site/v18/support.html — 로그인 전 880 선, 페이지 머리 + 구간 넷(질문·문의·내 문의·연락처) 사이 48
// 1:1 문의: 로그인하지 않았으면 버튼이 로그인 화면으로 가고, 로그인했으면 실제로 접수한다(결정 d25).
// 그 아래 「내 문의」는 자주 묻는 질문과 같은 펼치는 줄로 보인다(쓴 사람 본인 것만 — DB 가 거른다).
// 요금 답변의 숫자는 결제와 같은 DB 요금표(서버 page 가 읽어 넘긴다)를, 구간 기준은 size-tier 를 읽는다.

type Faq = { q: string; a: string };

type Category = { id: string; label: string; faqs: readonly Faq[] };

function feeAnswer(prices: PublicPriceTable): string {
  return `요금은 상자마다 정해지고, 택배비와 검수비가 포함돼 있어요. ${PRICED_TIERS.map(
    (t) => `${PARCEL_TIER_GUIDE[t].name}(${PARCEL_TIER_GUIDE[t].rule}) ${prices[t].priceKrw.toLocaleString("ko-KR")}원`,
  ).join(", ")}이에요.`;
}

const categoriesFor = (prices: PublicPriceTable): readonly Category[] => [
  {
    id: "gift",
    label: "선물 보내기",
    faqs: [
      {
        q: "선물은 어떻게 보내나요?",
        a: "크리에이터를 찾아 「선물 보내기」를 누르고 상자 크기를 골라 결제해 주세요. 결제하면 상자마다 팬꾹 주소가 나와요. 크리에이터가 승인하면 팬꾹 주소를 볼 수 있고, 승인 전에도 「먼저 보내기」를 누르면 팬꾹 주소를 보고 상자를 보낼 수 있어요.",
      },
      {
        q: "크리에이터가 받지 않으면 어떻게 되나요?",
        a: `크리에이터가 받지 않은 선물과 결제하고 ${APPROVAL_DEADLINE_DAYS}일 안에 승인되지 않은 선물은 크리에이터에게 배송되지 않고, 받지 않은 이유는 팬에게 알리지 않아요. 사무실에 도착하기 전이고 팬꾹 주소를 본 적이 없으면 결제 금액을 모두 돌려드려요. 팬꾹 주소를 본 적이 있으면 택배비를 뺀 금액을 먼저 돌려드리고, 그 뒤에 도착한 상자는 돌려보내 드려요. 결제하고 30일 안에 상자가 오지 않으면 택배비도 돌려드려요. 사무실에 도착한 상자는 확인해 주신 돌려받을 주소로 돌려보내 드리고, 택배비를 뺀 금액을 돌려드려요(검수 기준에 맞지 않는 상자는 돌려드리는 금액이 없어요).`,
      },
      {
        q: "여러 상자를 한 번에 보낼 수 있나요?",
        a: "네. 선물 한 건에 상자를 여러 개 등록할 수 있어요. 요금은 상자마다 크기에 맞게 정해져요.",
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
        a: "크기와 무게 중 큰 쪽 기준으로 정해져요. 예를 들어 세 변 합은 80cm인데 무게가 7kg이면 중형이에요.",
      },
      {
        q: "실제 상자 크기가 등록한 크기보다 크면 어떻게 되나요?",
        a: `사무실에서 잰 크기가 등록한 상자 크기보다 크면 차액을 따로 결제해 주셔야 해요. ${OVERSIZE_RULE}는 받지 않고 돌려보내 드려요. 이때는 검수비와 택배비를 빼면 환불 금액이 남지 않아요.`,
      },
    ],
  },
  {
    id: "ship",
    label: "배송",
    faqs: [
      {
        q: "선물의 배송 상황은 어디에서 확인하나요?",
        a: "선물 상세 화면과 화면 위쪽의 선물 아이콘에서 볼 수 있어요. 진행 상황은 등록 → 입고 → 검수 → 출고 → 배송 중 → 수령, 여섯 단계로 표시돼요. 크리에이터 승인은 검수와 출고 사이에 따로 표시돼요.",
      },
      {
        q: "크리에이터에게 보낸 상자의 송장번호를 볼 수 있나요?",
        a: "크리에이터에게 보낸 상자의 송장번호는 팬에게 보여 드리지 않아요. 팬이 선물 상세에 입력하는 송장번호는 팬꾹 사무실로 보내는 상자의 송장번호예요.",
      },
      {
        q: "검수는 어떻게 진행되나요?",
        a: `${PROMISE.inspection} 송장을 떼고 겉면을 검사해요. 팬이 보낸 상자는 추적 장치도 검사하고, 탐지기 반응이 있으면 열어서 확인해요. ${RETURN_ON_INSPECTION_NOTICE}`,
      },
    ],
  },
  {
    id: "creator",
    label: "크리에이터",
    faqs: [
      {
        q: "크리에이터는 어떻게 가입하나요?",
        a: "가입할 때 「크리에이터」를 골라 주세요. 가입한 뒤 「계정 설정」에서 채널 소유 확인을 마치면 「크리에이터 찾기」에 나타나요. 유튜브·치지직은 그 계정으로 로그인하면 바로 확인돼요. 인스타그램은 프로페셔널 계정만 확인할 수 있어요.",
      },
      { q: "선물은 어떻게 승인하나요?", a: "승인 요청이 오면 선물마다 카카오톡으로 승인해 주세요. 한꺼번에 승인하는 기능은 없어요." },
      { q: "특정 팬의 선물을 차단할 수 있나요?", a: "네. 차단 목록에 추가한 팬은 그 크리에이터에게 선물을 요청할 수 없어요." },
    ],
  },
  {
    id: "account",
    label: "계정",
    faqs: [
      {
        q: "비밀번호를 잊어버렸어요.",
        a: "로그인 화면에서 「비밀번호를 잊으셨나요?」를 누르고 가입한 이메일 주소를 입력해 주세요. 비밀번호 재설정 링크를 보내 드려요.",
      },
      { q: "아이디를 바꿀 수 있나요?", a: "아이디는 바꿀 수 없어요. 닉네임은 「프로필 수정」에서, 이메일은 「계정 설정」에서 바꿀 수 있어요." },
      { q: "휴대폰 번호를 바꾸고 싶어요.", a: "「계정 설정」의 휴대폰 번호에서 바꿀 수 있어요. 지금 비밀번호를 입력하고 카카오톡으로 본인 확인을 다시 받아 주세요." },
    ],
  },
];

// 연락처는 사이트 하단과 같은 설정값(shared/config/site-info)을 읽는다. 점심 시간은 아직 설정값이 없다.
const CONTACT: readonly (readonly [string, string])[] = [
  ["운영 시간", orBlank(SITE_INFO.supportHours)],
  ["점심 시간", SITE_INFO_BLANK],
  ["전화", orBlank(SITE_INFO.supportPhone)],
  ["이메일", orBlank(SITE_INFO.supportEmail)],
];

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 7.5 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MyInquiries({ inquiries }: { inquiries: readonly MyInquiry[] }) {
  return (
    <section aria-labelledby="mine-title">
      <h3 id="mine-title">내 문의</h3>
      {inquiries.length === 0 ? (
        <p className="t-meta">아직 남긴 문의가 없어요.</p>
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
                  <p className="t-meta">답변을 준비하고 있어요. 남겨 주신 순서대로 답변드려요.</p>
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
                    <p>{f.a}</p>
                  </div>
                </details>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className={s.sec} aria-labelledby="inquiry-title">
        <div className="pub-inner">
          <div className="sec-head">
            <h2 id="inquiry-title">1:1 문의</h2>
            <p className="t-lead t-desc">1:1 문의는 접수된 순서대로 답변해 드려요. 답변은 「내 문의」에서 확인할 수 있어요.</p>
          </div>
          <div className={`stack ${s.col}`}>
            <div className={`card ${s.ask}`}>
              <InquiryForm signedIn={signedIn} restricted={inquiryRestricted} />
            </div>
            {signedIn && <MyInquiries inquiries={myInquiries} />}
          </div>
        </div>
      </section>

      <section className={s.sec} aria-labelledby="contact-title">
        <div className="pub-inner">
          <div className="sec-head">
            <h2 id="contact-title">운영 시간 및 연락처</h2>
          </div>
          <dl className={s.hours}>
            {CONTACT.map(([k, v]) => (
              <div key={k} className="card">
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
