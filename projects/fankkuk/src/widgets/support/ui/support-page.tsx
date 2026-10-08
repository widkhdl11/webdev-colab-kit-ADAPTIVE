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
import s from "./support.module.css";

// 고객센터. 시안: docs/design/mockups/site/v4/support.html
// 1:1 문의: 로그인하지 않았으면 버튼이 로그인 화면으로 가고, 로그인했으면 실제로 접수한다(결정 d25).
// 그 아래 「내 문의」는 자주 묻는 질문과 같은 펼치는 줄로 보인다(쓴 사람 본인 것만 — DB 가 거른다).
// 요금 답변의 숫자는 결제와 같은 DB 요금표(서버 page 가 읽어 넘긴다)를, 구간 기준은 size-tier 를 읽는다.

type Faq = { q: string; a: string };

type Category = { id: string; label: string; faqs: readonly Faq[] };

function feeAnswer(prices: PublicPriceTable): string {
  return `상자마다 배송비가 포함된 금액이에요. ${PRICED_TIERS.map(
    (t) => `${PARCEL_TIER_GUIDE[t].name}(${PARCEL_TIER_GUIDE[t].rule}) ${prices[t].priceKrw.toLocaleString("ko-KR")}원`,
  ).join(", ")}이고, 추적 장치 검수가 포함돼 있어요.`;
}

const categoriesFor = (prices: PublicPriceTable): readonly Category[] => [
  {
    id: "gift",
    label: "선물 보내기",
    faqs: [
      {
        q: "선물은 어떻게 보내나요?",
        a: "크리에이터를 찾아 「선물 보내기」를 누르고, 상자 수와 크기를 등록한 뒤 결제하면 바로 팬꾹 사무실 주소를 알려 드려요. 승인을 기다리지 말고 그 주소로 보내 주세요. 크리에이터는 출고 전에 승인해요.",
      },
      {
        q: "크리에이터가 거절하면 어떻게 되나요?",
        a: `거절된 선물은 크리에이터에게 배송되지 않아요. 사무실에 도착하기 전이면 결제 금액을 모두 돌려드리고, 도착한 뒤면 보낸 주소로 돌려보내 드린 뒤 반송 택배비를 뺀 금액을 돌려드려요. ${APPROVAL_DEADLINE_DAYS}일 안에 승인하지 않은 선물도 같아요. 거절 이유는 팬에게 알리지 않습니다.`,
      },
      {
        q: "여러 상자를 한 번에 보낼 수 있나요?",
        a: "네, 한 선물에 상자를 여러 개 등록할 수 있어요. 상자마다 크기에 맞는 요금이 정해져요.",
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
        q: "도착해서 잰 크기가 등록한 것보다 크면요?",
        a: `사무실에서 실측한 크기가 더 크면 차액을 따로 결제해 주셔야 해요. ${OVERSIZE_RULE}는 받지 않아요.`,
      },
    ],
  },
  {
    id: "ship",
    label: "배송",
    faqs: [
      {
        q: "선물이 어디쯤 왔는지 어떻게 확인하나요?",
        a: "등록 → 입고 → 검수 → 출고 → 배송중 → 수령, 여섯 단계로 (크리에이터 승인은 검수와 출고 사이에 따로 표시돼요) 선물 상세 화면과 상단 선물 아이콘에서 볼 수 있어요.",
      },
      {
        q: "크리에이터행 운송장 번호를 볼 수 있나요?",
        a: "팬에게는 크리에이터행 운송장 번호를 보여 드리지 않아요. 팬이 입력하는 것은 사무실로 보내는 상자의 송장번호예요.",
      },
      { q: "검수는 어떻게 하나요?", a: "상자의 원래 송장을 제거하고, 겉면과 추적 장치를 검사해요. 검사에 걸린 상자만 열어서 확인해요. 추적 장치처럼 보낼 수 없는 물품이 나오면 돌려보내 드리고, 검수비와 반송 택배비를 빼서 돌려드리는 금액이 없어요." },
    ],
  },
  {
    id: "creator",
    label: "크리에이터",
    faqs: [
      {
        q: "크리에이터는 어떻게 가입하나요?",
        a: "가입할 때 「크리에이터」를 고르면 돼요. 가입한 뒤 「주소와 설정」에서 방송 채널 주인인지 확인을 마치면 「크리에이터 찾기」에 나타나요. 유튜브·치지직은 그 계정으로 로그인하면 바로 끝나요(인스타그램은 프로페셔널 계정만).",
      },
      { q: "선물 승인은 어떻게 하나요?", a: "요청이 오면 한 건씩 카카오톡 인증서로 서명해서 승인해요. 전체 승인 버튼은 없어요." },
      { q: "원치 않는 팬을 막을 수 있나요?", a: "네, 차단 목록에 추가하면 그 팬은 선물을 요청할 수 없어요." },
    ],
  },
  {
    id: "account",
    label: "계정",
    faqs: [
      {
        q: "비밀번호를 잊어버렸어요.",
        a: "로그인 화면의 「비밀번호를 잊으셨나요?」에서 가입 이메일을 입력하면 재설정 링크를 보내 드려요.",
      },
      { q: "아이디를 바꿀 수 있나요?", a: "아이디는 바꿀 수 없어요. 닉네임과 이메일은 내 팬꾹의 개인정보에서 고칠 수 있어요." },
      { q: "휴대폰 번호를 바꾸고 싶어요.", a: "내 팬꾹의 개인정보에서 바꿀 수 있고, 카카오톡 인증을 다시 받아야 해요." },
    ],
  },
];

const CONTACT: readonly (readonly [string, string])[] = [
  ["운영 시간", "(출시 전 기재)"],
  ["점심 시간", "(출시 전 기재)"],
  ["전화", "(출시 전 기재)"],
  ["이메일", "(출시 전 기재)"],
];

function Chevron({ className }: { className: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 7.5 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MyInquiries({ inquiries }: { inquiries: readonly MyInquiry[] }) {
  return (
    <section className={s.mine} aria-labelledby="mine-title">
      <h3 id="mine-title">내 문의</h3>
      {inquiries.length === 0 ? (
        <p className={s["mine-empty"]}>아직 남긴 문의가 없어요.</p>
      ) : (
        <div className={s.faq}>
          {inquiries.map((q) => (
            <details key={q.id}>
              <summary>
                <span className={s["mine-title"]}>
                  <span>{q.title}</span>
                  {q.status === "answered" ? <span className={statusTagClass("success")}>답변 완료</span> : <span className={statusTagClass("warn")}>답변 대기</span>}
                </span>
                <Chevron className={s.chev} />
              </summary>
              <div className={s.answer}>
                <p className={s["mine-meta"]}>
                  {INQUIRY_KIND_LABELS[q.kind]}
                  {q.orderNo && ` · 주문번호 ${q.orderNo}`} · {formatDateTime(q.createdAt)}
                </p>
                <p className={s["mine-text"]}>{q.body}</p>
                {q.status === "answered" && q.answer !== null ? (
                  <div className={s["mine-reply"]}>
                    <p className={s["mine-reply-h"]}>팬꾹의 답변{q.answeredAt && ` · ${formatDateTime(q.answeredAt)}`}</p>
                    <p className={s["mine-text"]}>{q.answer}</p>
                  </div>
                ) : (
                  <p className={s["mine-meta"]}>답변을 준비하고 있어요. 남겨 주신 순서대로 답변드려요.</p>
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
    <main id="main">
      <div className="container">
        <div className="page-top">
          <div>
            <h1 className="page-h">고객센터</h1>
            <p className={`lead ${s["page-lead"]}`}>궁금한 점을 먼저 찾아보시고, 없으면 1:1 문의를 남겨 주세요.</p>
          </div>
          <div className={s["tile-ico"]} aria-hidden="true">
            <img className="asset" src="/img/icon-help.png" width={72} height={72} alt="" />
          </div>
        </div>
      </div>

      <section aria-labelledby="faq-title">
        <div className="container">
          <h2 id="faq-title" className={s["faq-title"]}>
            자주 묻는 질문
          </h2>
          <div className={s.tabs} role="tablist" aria-label="질문 분류">
            {categories.map((c, i) => (
              <button
                key={c.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                className={s.tab}
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
              className={s.faq}
              role="tabpanel"
              id={`p-${c.id}`}
              aria-labelledby={`t-${c.id}`}
              hidden={i !== selected}
            >
              {c.faqs.map((f, j) => (
                <details key={f.q} open={j === 0}>
                  <summary>
                    <span>{f.q}</span>
                    <Chevron className={s.chev} />
                  </summary>
                  <p className={s.answer}>{f.a}</p>
                </details>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="block" aria-labelledby="inquiry-title">
        <div className={`container ${s.help}`}>
          <div className={s.ask}>
            <h2 id="inquiry-title">1:1 문의</h2>
            <InquiryForm signedIn={signedIn} restricted={inquiryRestricted} />
            {signedIn && <MyInquiries inquiries={myInquiries} />}
          </div>
          <aside className={s.contact} aria-labelledby="contact-title">
            <h2 id="contact-title">운영 시간·연락처</h2>
            <dl>
              {CONTACT.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className={s.note}>1:1 문의는 남겨 주신 순서대로 답변드려요. 답변이 달리면 「내 문의」에서 볼 수 있어요.</p>
          </aside>
        </div>
      </section>
      <div className="page-end" />
    </main>
  );
}
