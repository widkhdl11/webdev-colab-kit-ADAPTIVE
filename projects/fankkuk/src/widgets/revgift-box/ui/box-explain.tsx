import { useId } from "react";
import type { PriceTable } from "@/entities/revgift-box/api/box-reads";
import { CHOSEN_TIERS, TIER_NAME, TIER_RULE } from "@/entities/revgift-box/model/box-tiers";
import s from "./revgift-box.module.css";

// 팬에게 보내기 설명 (UX 명세 creator-revgifts-new 「2026-11-09 바꿀 것 — 설명 내용」 · design-rules 43절 「설명」 · 시안 §8·§9).
// 큰 흐름 그림 한 장(큰 상자 → 팬꾹 → 팬 세 갈래) — 장점 셋은 그림 캡션에 녹이고 「장점」「진행 순서」「비용」 같은 이름표 제목은 두지 않는다.
// 그 아래 흰 카드 한 장에 단계 글 목록(그림 없음, 13-1)과 비용(사실 3줄 + 상자 크기별 택배비 — 설정표 값, 읽지 못하면 표를 그리지 않는다).
// 근거: 큰 상자 INV-GB10·GB11 · 실측·한 번 결제 INV-GB12·GB13·GB18 · 닉네임만 INV-GB20 · 단계 INV-GB3·GB4·GB8·GB10·GB12·GB18·GB19.

const STEPS = [
  { who: "크리에이터", title: "선물함 만들기", text: "이름 · 받을 인원(1~100명) · 공개 범위를 정합니다." },
  { who: "팬", title: "신청", text: "나를 팔로우한 팬이 받을 주소를 입력해 신청합니다." },
  { who: "크리에이터", title: "마감하고 상자 크기 고르기", text: "팬마다 상자 크기를 고르면 예상 금액을 확인합니다." },
  { who: "크리에이터", title: "큰 상자로 팬꾹에 보내기", text: "번호 라벨을 붙여 팬꾹 주소(선물함 번호 6자리)로 보냅니다." },
  { who: "팬꾹 → 크리에이터", title: "실측 뒤 명세서 · 결제", text: "72시간 안에 결제합니다. 168시간까지 결제가 없으면 착불로 돌려보냅니다." },
  { who: "팬꾹 → 팬", title: "팬마다 발송", text: "크리에이터와 팬이 배송 단계를 봅니다." },
] as const;

const FANS = ["별빛", "하늘", "보라"] as const;

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function ArrowMarker({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M1 1.5 8.5 5 1 8.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </marker>
    </defs>
  );
}

/** 큰 흐름 그림 — 넓은 칸(900 이상)은 가로, 좁으면 세로(캡션은 그림 아래 12, 2-14) */
export function BoxStory() {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const h = `bs-h-${uid}`;
  const v = `bs-v-${uid}`;
  return (
    <div className={s.storyBox}>
      <div className={s.story}>
        <div className={`${s.sPic} ${s.sA}`}>
          <span className={`chip ${s.chipA}`}>택배 접수 1번</span>
          <img src="/images/home/revgift-pack.png" alt="" width={112} height={112} />
        </div>
        <span className={`${s.arr} ${s.arrAb}`} aria-hidden="true">
          <svg viewBox="0 0 16 16">
            <path d="M1 8h13M9 3l5 5-5 5" />
          </svg>
        </span>
        <div className={`${s.sPic} ${s.sB}`}>
          <img src="/images/home/icon-inspect.webp" alt="" width={112} height={112} />
        </div>
        <svg className={s.fanH} viewBox="0 0 96 192" width="96" height="192" aria-hidden="true">
          <ArrowMarker id={h} />
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none">
            <line x1="16" y1="96" x2="80" y2="32" markerEnd={`url(#${h})`} />
            <line x1="16" y1="96" x2="80" y2="96" markerEnd={`url(#${h})`} />
            <line x1="16" y1="96" x2="80" y2="160" markerEnd={`url(#${h})`} />
          </g>
        </svg>
        <svg className={s.fanV} width="100%" height="96" aria-hidden="true">
          <ArrowMarker id={v} />
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none">
            <line x1="50%" y1="16" x2="16.67%" y2="80" markerEnd={`url(#${v})`} />
            <line x1="50%" y1="16" x2="50%" y2="80" markerEnd={`url(#${v})`} />
            <line x1="50%" y1="16" x2="83.33%" y2="80" markerEnd={`url(#${v})`} />
          </g>
        </svg>
        <ul className={`${s.fans} ${s.sC}`} aria-label="팬 여러 명 예시">
          {FANS.map((f) => (
            <li key={f} className={s.fan}>
              <img src="/images/home/gift-box-small.png" alt="" width={32} height={32} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <div className={`${s.sCap} ${s.capA}`}>
          <h3>큰 상자 하나, 택배 접수 한 번</h3>
          <p>선물마다 닉네임을 적거나 번호 라벨을 붙여 큰 상자에 함께 담아 팬꾹으로 보냅니다.</p>
        </div>
        <div className={`${s.sCap} ${s.capB}`}>
          <h3>팬꾹이 열어 실제 크기를 잽니다</h3>
          <p>도착한 선물을 하나씩 재서 명세서를 만들고, 그 금액을 한 번 결제합니다. 미리 결제하지 않습니다.</p>
        </div>
        <div className={`${s.sCap} ${s.capC}`}>
          <h3>팬마다 따로 발송합니다</h3>
          <p>팬이 신청할 때 받을 주소를 팬꾹에 입력합니다. 크리에이터에게는 닉네임만 보입니다.</p>
        </div>
      </div>
    </div>
  );
}

/** 단계 글 목록 + 비용 — 흰 카드 한 장, 한 단계 낮은 비중 */
export function BoxDetail({ price }: { price: PriceTable | null }) {
  return (
    <section className={s.detail} aria-label="진행 단계와 비용">
      <ol className={s.dsteps}>
        {STEPS.map((st, i) => (
          <li key={st.title}>
            <p className={s.who}>
              <span className={s.num} aria-hidden="true">
                {i + 1}
              </span>
              {st.who}
            </p>
            <h3 className={s.stH}>{st.title}</h3>
            <p className={s.stP}>{st.text}</p>
          </li>
        ))}
      </ol>
      <div className={s.cost}>
        <dl className={s.costL}>
          <div>
            <dt>팬마다</dt>
            <dd>상자 크기별 택배비 + 서비스료</dd>
          </div>
          <div>
            <dt>큰 상자를 팬꾹으로 보낼 때</dt>
            <dd>택배비는 크리에이터가 부담합니다(착불 가능).</dd>
          </div>
          <div>
            <dt>대형을 넘는 선물</dt>
            <dd>우체국 실비로 개인접수합니다.</dd>
          </div>
        </dl>
        {price ? (
          <table className={s.costT}>
            <caption>상자 크기별 택배비</caption>
            <tbody>
              {CHOSEN_TIERS.map((t) => (
                <tr key={t}>
                  <th scope="row">
                    {TIER_NAME[t]} <small>{`${TIER_RULE[t].sizeCm}cm · ${TIER_RULE[t].weightKg}kg`}</small>
                  </th>
                  <td>{won(price.fees[t])}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">
                  서비스료 <small>팬마다</small>
                </th>
                <td>{won(price.serviceFeeKrw)}</td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}
