import Link from "next/link";
import { OPERATOR_NAME, PROMISE } from "@/shared/config/site-copy";
import { withSubjectParticle } from "@/shared/lib/format/subject-particle";
import { AboutIcon, type AboutIconName } from "./about-icons";
import s from "./about.module.css";

// 팬꾹 소개. 시안: docs/design/mockups/site/v18/about.html — 본문은 로그인 전 880 선(.pub-inner). 화면 전용 모양은 about.module.css
// 약속 문장은 shared/config/site-copy 의 고정 문구를 그대로 읽는다(문구 v2). 소개 이야기는 해요체, 약속·하지 않는 것은 합니다체.

const FLOW: readonly { icon: AboutIconName; title: string; body: string; once?: true }[] = [
  { icon: "lock", title: "입력하자마자 잠가요", body: "크리에이터가 입력한 주소는 팬꾹으로 오기 전에 잠겨요." },
  { icon: "package", title: "잠긴 채 보관해요", body: PROMISE.address },
  { icon: "message", title: "크리에이터가 직접 승인해요", body: "선물마다 카카오톡으로 한 번 더 확인해요." },
  { icon: "printer", title: "송장 출력 때만 열려요", body: "주소가 열릴 때마다 기록을 남겨요.", once: true },
  { icon: "truck", title: "팬꾹 송장으로 출고해요", body: "크리에이터의 승인과 검수를 모두 마친 선물만 출고해요." },
];

const INSPECT = [
  { title: "송장 제거", body: "상자에 붙어 있던 송장은 떼어 따로 보관해요. 상자를 돌려보내거나 크리에이터에게 보낼 때, 상자를 처분하거나 경찰에 넘길 때 파쇄해요." },
  { title: "겉면 검사", body: "상자 겉면에 숨겨진 연락처나 의심스러운 부착물이 있는지 확인해요." },
  { title: "추적 장치 탐지", body: "팬이 보낸 모든 상자를 탐지기로 검사해요." },
] as const;

/** 열람 기록 표 예시 — 지어낸 값. 실제 기록은 크리에이터 화면(/creator/log)에 있다. */
const LOG_EXAMPLE = [
  ["10.28 14:32", "FC-7K3M9"],
  ["10.27 11:05", "FC-5D1H6"],
  ["10.25 16:48", "FC-2P8QW"],
] as const;

const NOTS = [
  { title: "승인 전에는 주소를 열지 않습니다", body: PROMISE.addressFan },
  { title: "한꺼번에 승인하지 않습니다", body: "선물마다 카카오톡으로 따로 확인해요." },
  { title: "받지 않은 이유를 팬에게 알리지 않습니다", body: "크리에이터가 받지 않은 선물은 배송하지 않아요." },
  { title: "필요 없이 상자를 열지 않습니다", body: "탐지기 반응이 있는 상자는 열어서 확인해요." },
  { title: "크리에이터에게 가는 송장번호는 공개하지 않습니다", body: "팬에게 보이는 주소는 팬꾹 주소뿐이에요." },
  { title: "검수를 뺀 요금제는 만들지 않습니다", body: "모든 요금에 검수가 포함돼요." },
] as const;

const CROSS = (
  <span className="card-icon" aria-hidden="true">
    <AboutIcon name="x" />
  </span>
);

export function AboutPage() {
  return (
    <main id="main" className={s.root}>
      {/* 1. 첫 화면 (가운데) — 글자 칸 바깥 좌우에 3D 장식 둘(920 이하 숨김) */}
      <section className={`hero ${s.hero}`} aria-labelledby="about-title">
        <div className={`pub-inner ${s.decoWrap}`}>
          <img className={`${s.deco} ${s.decoL}`} src="/img/icon-inspect.png" width={160} height={160} alt="" aria-hidden="true" />
          <img className={`${s.deco} ${s.decoR}`} src="/img/icon-log.png" width={160} height={160} alt="" aria-hidden="true" />
          <div className={s.heroText}>
            <h1 className="t-hero" id="about-title">
              선물에 담긴 마음은 그대로,
              <br />
              주소는 소중하게
            </h1>
            <p className="t-lead">
              팬꾹은 팬이 보낸 선물을 검수한 뒤 크리에이터에게 대신 보내는 서비스예요. {PROMISE.addressFan} {withSubjectParticle(OPERATOR_NAME)}{" "}
              만들고 운영해요.
            </p>
          </div>
        </div>
      </section>

      {/* 2. 왜 만들었나 — 제목 → 같은 크기 카드 셋 */}
      <section className={s.near} aria-labelledby="why-title">
        <div className="pub-inner">
          <div className="sec-head">
            <h2 id="why-title">&ldquo;선물은 받고 싶지만, 주소가 알려질까 걱정돼요&rdquo;</h2>
          </div>
          <div className={`${s.grid3} ${s.story}`}>
            <div className="card">
              <p>
                팬이 보내 주는 선물은 늘 고맙지만, 상자에 붙은 송장에는 크리에이터의 이름과 집 주소가 적혀 있어요. 배송 중에도,
                상자를 버린 뒤에도 다른 사람에게 보일 수 있어요.
              </p>
            </div>
            <div className="card">
              <p>
                그래서 선물 받기를 망설이거나 주소를 숨기려고 번거로운 방법을 쓰는 크리에이터가 있어요. 팬도 마음을 전하고 싶지만,
                어디로 보내야 할지 몰라 선물을 포기하기도 하고요.
              </p>
            </div>
            <div className="card card--soft">
              <p>
                그래서 팬꾹이 팬과 크리에이터 사이에 들어가기로 했어요. 팬은 크리에이터의 주소를 몰라도 선물을 보낼 수 있고,
                크리에이터는 팬에게 주소를 공개하지 않고 선물을 받을 수 있어요.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. 주소는 송장 출력 때만 — 제목 → 한 줄 설명 → 장면 그림(잠김 → 열림) → 번호 단계 카드 */}
      <section className={s.near} aria-labelledby="once-title">
        <div className="pub-inner">
          <div className="panel">
            <div className="sec-head">
              <h2 id="once-title">
                주소는 송장을 출력할 때만 <span className="accent">열립니다</span>
              </h2>
              <p className="t-lead t-desc">{PROMISE.address} 승인한 선물도 송장을 출력할 때만 열려요.</p>
            </div>
            <div className={s.scene} role="group" aria-label="주소가 잠겨 있다가 송장 출력 때만 열리는 예시 그림">
              <div className={s.mascot} aria-hidden="true">
                <img src="/img/icon-address-lock.png" width={112} height={112} alt="" />
              </div>
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
                <div className={`${s.sceneRow} ${s.sceneOpen}`}>
                  <span className="tag tag--brand">열림</span>
                  <AboutIcon name="unlock" />
                </div>
                <p className={s.sceneAddr}>서울시 ○○구 ○○로 ●●</p>
                <p className={s.sceneLog}>
                  <AboutIcon name="clock" />
                  <span>10월 14일 14:02 · 주문 FC-4T2N8 · 송장 출력으로 열림</span>
                </p>
              </div>
            </div>
            <ol className={s.flow} aria-label="주소가 열리기까지의 흐름">
              {FLOW.map((f, i) => (
                <li key={f.title} className={f.once ? s.on : undefined}>
                  <span className={s.n} aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <span className={s.stepIc} aria-hidden="true">
                      <AboutIcon name={f.icon} />
                    </span>
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                    {f.once && <span className="tag tag--brand">출력할 때만</span>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* 4. 검수 — 그림 → 제목 → 설명 → 카드 셋 → 개봉 검수 카드 */}
      <section className={s.far} aria-labelledby="inspect-title">
        <div className="pub-inner">
          <div className="sec-head">
            <img className={s.art} src="/img/icon-inspect.png" width={64} height={64} alt="" aria-hidden="true" />
            <h2 id="inspect-title">선물은 이렇게 검수해요</h2>
            <p className="t-lead t-desc">{PROMISE.inspection}</p>
          </div>
          <ol className={s.grid3}>
            {INSPECT.map((it, i) => (
              <li key={it.title} className="card">
                <span className="tag tag--brand">{i + 1}</span>
                <h3>{it.title}</h3>
                <p>{it.body}</p>
              </li>
            ))}
          </ol>
          <div className={`card card--soft center ${s.opened}`}>
            <h3>탐지기 반응 시 개봉 검수</h3>
            <p>{PROMISE.inspectionOpen}</p>
          </div>
        </div>
      </section>

      {/* 5. 열람 기록 — 그림 → 제목 → 설명 → 표 → 버튼 */}
      <section className={s.near} aria-labelledby="log-title">
        <div className="pub-inner">
          <div className="sec-head">
            <img className={s.art} src="/img/icon-log.png" width={64} height={64} alt="" aria-hidden="true" />
            <h2 id="log-title">주소 열람 기록을 직접 확인할 수 있어요</h2>
            <p className="t-lead t-desc">
              크리에이터는 언제, 어느 주문의 주소가 열렸는지, 송장을 몇 번째 출력했는지 확인할 수 있어요. 승인하지 않은 주문의 열람
              기록이 있는지도 살펴볼 수 있어요.
            </p>
          </div>
          <div>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="주소 열람 기록 예시 표">
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
            <p className={`t-meta ${s.tableNote}`}>이해를 돕기 위한 예시예요. 실제 기록은 크리에이터 화면에서 확인할 수 있어요.</p>
          </div>
          <div className={s.foot}>
            <Link className="btn" href="/signup">
              크리에이터로 가입하기
            </Link>
          </div>
        </div>
      </section>

      {/* 6. 하지 않는 것 — 같은 크기 카드 격자 */}
      <section className={s.near} aria-labelledby="not-title">
        <div className="pub-inner">
          <div className="sec-head">
            <h2 id="not-title">팬꾹이 하지 않는 것</h2>
            <p className="t-lead t-desc">약속만큼 중요한 건 하지 않는 일이에요.</p>
          </div>
          <ul className={s.grid3}>
            {NOTS.map((n) => (
              <li key={n.title} className="card">
                {CROSS}
                <h3>{n.title}</h3>
                <p>{n.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 7. 마무리 (가운데) — 옅은 빨강 판 + 모서리 장식 둘(1120 이하 숨김) */}
      <section className={`${s.far} ${s.last} center`} aria-labelledby="cta-title">
        <div className="pub-inner">
          <div className={`panel ${s.cta}`}>
            <img className={`${s.pdeco} ${s.pdecoL}`} src="/img/icon-gift.png" width={96} height={96} alt="" aria-hidden="true" />
            <img className={`${s.pdeco} ${s.pdecoR}`} src="/img/icon-truck.png" width={96} height={96} alt="" aria-hidden="true" />
            <h2 id="cta-title">마음을 담아, 꾹.</h2>
            <div className="hero-actions">
              <Link className="btn btn--wide" href="/gifts/new">
                선물 보내기
              </Link>
              <Link className="btn btn--line btn--wide" href="/creators">
                크리에이터 찾기
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
