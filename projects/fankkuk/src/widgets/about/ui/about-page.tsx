import Link from "next/link";
import { PROMISE } from "@/shared/config/site-copy";
import { AboutIcon } from "./about-icons";
import s from "./about.module.css";

// 팬꾹 소개. 시안: docs/design/mockups/site/part7-2026-10-22/about.html(값은 part7-pages.css 「소개」) · design-rules 28절 「팬꾹 소개」.
// 첫 화면·마무리는 크림 띠 위 가운데, 나머지는 880 선 왼쪽 정렬. 이야기·하지 않는 것은 680 한 기둥, 카드 격자 없음.
// 강조 판은 「주소는 송장을 출력할 때만」 하나. 문구는 10-24 다듬은 코드 쪽이 정본, 약속 문장은 shared/config/site-copy 를 그대로 읽는다.

const FLOW: readonly { title: string; body: string; once?: true }[] = [
  { title: "입력 즉시 암호화", body: "주소는 입력한 기기에서 암호화한 뒤 팬꾹으로 전송합니다." },
  { title: "암호화 상태로 보관", body: "승인 전에는 주소를 열람할 수 없습니다." },
  { title: "선물별 직접 승인", body: "크리에이터가 선물마다 카카오톡 인증으로 승인합니다." },
  { title: "송장 출력 시 열람", body: "주소를 열람할 때마다 기록을 남깁니다.", once: true },
  { title: "팬꾹 송장으로 출고", body: "승인과 검수가 완료된 선물을 출고합니다." },
];

/** 검수 네 칸 — 넷째(개봉 검수)만 위 줄 굵게 */
const INSPECT: readonly { title: string; body: string; open?: true }[] = [
  { title: "송장 제거", body: "상자에 붙어 있던 송장은 떼어 따로 보관합니다. 상자를 돌려보내거나 크리에이터에게 보낼 때, 상자를 처분하거나 경찰에 넘길 때 파쇄합니다." },
  { title: "겉면 검사", body: "상자 겉면에 숨겨진 연락처나 의심스러운 부착물이 있는지 확인합니다." },
  { title: "추적 장치 탐지", body: "팬이 보낸 모든 상자를 탐지기로 검사합니다." },
  { title: "탐지기 반응 시 개봉 검수", body: PROMISE.inspectionOpen, open: true },
];

/** 열람 기록 표 예시 — 지어낸 값. 실제 기록은 크리에이터 화면(/creator/log)에 있다. */
const LOG_EXAMPLE = [
  ["10.28 14:32", "FC-7K3M9"],
  ["10.27 11:05", "FC-5D1H6"],
  ["10.25 16:48", "FC-2P8QW"],
] as const;

const NOTS = [
  { title: "승인 전 주소 열람 제한", body: `승인 후에도 ${PROMISE.addressFan}` },
  { title: "일괄 승인 없음", body: "선물마다 카카오톡 인증으로 승인합니다." },
  { title: "거절 사유 비공개", body: "크리에이터가 거절한 선물은 배송하지 않습니다." },
  { title: "탐지기 반응 시 개봉 검수", body: "검사 결과에 따라 상자를 개봉해 확인합니다." },
  { title: "크리에이터 배송 송장번호 비공개", body: "팬에게는 선물을 보낼 팬꾹 주소만 안내합니다." },
  { title: "팬 선물 요금에 검수 포함", body: "팬이 보내는 모든 선물은 검수 후 배송합니다." },
] as const;

export function AboutPage() {
  return (
    <main id="main" className={s.root}>
      {/* 1. 첫 화면 — 크림 띠 위 가운데, 글 칸 바깥 양옆 장식 둘(1100 이하 숨김) */}
      <section className={`${s.blk} ${s.hero}`} aria-labelledby="about-title">
        <div className={`pub-inner ${s.decoWrap}`}>
          <img className={`${s.deco} ${s.decoL}`} src="/img/icon-inspect.png" width={128} height={128} alt="" aria-hidden="true" />
          <img className={`${s.deco} ${s.decoR}`} src="/img/icon-log.png" width={128} height={128} alt="" aria-hidden="true" />
          <h1 className="t-hero" id="about-title">
            선물에 담긴 마음은 그대로,
            <br />
            주소는 비공개로
          </h1>
          <p className={`t-lead ${s.heroLead}`}>
            팬꾹은 팬이 보낸 선물을 검수한 뒤 크리에이터에게 배송하는 서비스입니다. {PROMISE.addressFan}
          </p>
        </div>
      </section>

      {/* 2. 왜 만들었나 — 680 한 기둥 글 세 문단, 셋째 문단만 굵게 */}
      <section className={`${s.blk} ${s.sec}`} aria-labelledby="why-title">
        <div className="pub-inner">
          <div className={s.col}>
            <h2 id="why-title">&ldquo;선물은 받고 싶지만, 주소가 알려질까 걱정돼요&rdquo;</h2>
            <div className={s.story}>
              <p>
                선물을 직접 받으면 상자의 송장에 이름과 주소가 남습니다. 배송 중이나 상자를 버린 뒤에도 이 정보가 다른 사람에게 보일 수 있습니다.
              </p>
              <p>
                크리에이터에게는 주소 공개가 부담이 되고, 팬에게는 선물을 보낼 곳을 알기 어렵다는 문제가 있습니다.
              </p>
              <p>
                팬은 팬꾹 주소로 선물을 보내고, 팬꾹이 검수 후 크리에이터에게 전달합니다. 크리에이터는 팬에게 주소를 공개하지 않고 선물을 받을 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. 주소는 송장 출력 때만 — 이 화면의 강조 판 하나. 장면 그림(잠김 → 열림) → 다섯 단계 줄(넷째 줄만 하늘 면) */}
      <section className={`${s.blk} ${s.sec}`} aria-labelledby="once-title">
        <div className="pub-inner">
          <div className={s.key}>
            <h2 id="once-title">
              송장 출력에만 사용하는 <span className={s.hl}>주소</span>
            </h2>
            <p className={s.lead}>주소는 암호화해 보관하며, 승인과 검수가 완료된 상자의 송장 출력에만 사용합니다.</p>
            <div className={s.scene} role="group" aria-label="주소가 잠겨 있다가 송장 출력 때만 열리는 예시 그림">
              <img className={s.mascot} src="/img/icon-address-lock.png" width={96} height={96} alt="" aria-hidden="true" />
              <div className={s.sceneCard} aria-hidden="true">
                <div className={s.sceneRow}>
                  <span className="tag">잠김</span>
                  <AboutIcon name="lock" />
                </div>
                <div className={s.mask}>
                  <i />
                  <i />
                </div>
              </div>
              <span className={s.sceneArrow} aria-hidden="true">
                <AboutIcon name="arrow" />
              </span>
              <div className={s.sceneCard} aria-hidden="true">
                <div className={s.sceneRow}>
                  <span className="tag tag--brand">열림</span>
                  <AboutIcon name="unlock" />
                </div>
                <p className={s.sceneAddr}>서울시 ○○구 ○○로 ●●</p>
                <p className={s.sceneLog}>10월 14일 14:02 · 주문 FC-4T2N8 · 송장 출력으로 열림</p>
              </div>
            </div>
            <ol className={s.steps} aria-label="주소가 열리기까지의 흐름">
              {FLOW.map((f, i) => (
                <li key={f.title} className={f.once ? s.on : undefined}>
                  <span className={s.n} aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                  {f.once && <span className={`tag tag--brand ${s.stepTag}`}>출력할 때만</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* 4. 검수 — 그림 → 제목 → 설명 → 네 칸 한 줄(920 이하 한 줄씩) */}
      <section className={`${s.blk} ${s.sec}`} aria-labelledby="inspect-title">
        <div className="pub-inner">
          <img className={s.art} src="/img/icon-inspect.png" width={64} height={64} alt="" aria-hidden="true" />
          <h2 id="inspect-title">선물 검수 절차</h2>
          <p className={s.lead}>{PROMISE.inspection}</p>
          <ol className={s.ins}>
            {INSPECT.map((it, i) => (
              <li key={it.title} className={it.open ? s.on : undefined}>
                <span className={s.n} aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{it.title}</h3>
                <p>{it.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 5. 열람 기록 — 그림 → 제목 → 설명 → 표(880) → 버튼 */}
      <section className={`${s.blk} ${s.sec}`} aria-labelledby="log-title">
        <div className="pub-inner">
          <img className={s.art} src="/img/icon-log.png" width={64} height={64} alt="" aria-hidden="true" />
          <h2 id="log-title">직접 확인하는 주소 열람 기록</h2>
          <p className={`${s.lead} ${s.col}`}>
            크리에이터는 자신의 선물에 대한 주소 열람 시각·주문번호·송장 출력 차수를 확인할 수 있습니다.
          </p>
          <div className={`table-wrap ${s.table}`} tabIndex={0} role="region" aria-label="주소 열람 기록 예시 표">
            <table className="table">
              <caption className="sr-only">주소 열람 기록 예시</caption>
              <thead>
                <tr>
                  <th scope="col">열람 시각</th>
                  <th scope="col">주문번호</th>
                  <th scope="col">비고</th>
                </tr>
              </thead>
              <tbody>
                {LOG_EXAMPLE.map(([at, orderNo]) => (
                  <tr key={orderNo}>
                    <td>{at}</td>
                    <td>{orderNo}</td>
                    <td>최초 출력</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`t-meta ${s.tableNote}`}>이해를 돕기 위한 예시입니다. 실제 기록은 크리에이터 화면의 ‘열람 기록’에서 확인해 주세요.</p>
          <div className={s.foot}>
            <Link className="btn" href="/signup">
              크리에이터 가입
            </Link>
          </div>
        </div>
      </section>

      {/* 6. 하지 않는 것 — 680 줄 목록(× 표시 · 제목 16/600 · 설명 14) */}
      <section className={`${s.blk} ${s.sec}`} aria-labelledby="not-title">
        <div className="pub-inner">
          <div className={s.col}>
            <h2 id="not-title">팬꾹이 지키는 기준</h2>
            <p className={s.lead}>주소 보호와 선물 전달을 위해 지키는 기준입니다.</p>
            <ul className={s.nots}>
              {NOTS.map((n) => (
                <li key={n.title}>
                  <span className={s.x} aria-hidden="true">
                    <AboutIcon name="x" />
                  </span>
                  <h3>{n.title}</h3>
                  <p>{n.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 7. 마무리 — 크림 띠 위 가운데(판·장식 그림 없음) */}
      <section className={`${s.blk} ${s.end}`} aria-labelledby="cta-title">
        <div className="pub-inner">
          <h2 id="cta-title">마음을 담아, 꾹.</h2>
          <div className={s.acts}>
            <Link className="btn" href="/gifts/new">
              선물 보내기
            </Link>
            <Link className="btn btn--line" href="/creators">
              크리에이터 찾기
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
