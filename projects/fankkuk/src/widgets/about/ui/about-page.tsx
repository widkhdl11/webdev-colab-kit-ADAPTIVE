import Link from "next/link";
import s from "./about.module.css";

// 팬꾹 소개. 시안: docs/design/mockups/site/v4/about.html
// 문구 한계(design-rules 6절): 주소 약속은 「승인 없이는 저희 시스템이 주소를 열지 않습니다」만. 검수는 「걸린 상자만 개봉」.

const FLOW = [
  { title: "브라우저에서 잠가요", body: "크리에이터가 주소를 적으면, 크리에이터의 브라우저에서 먼저 잠근 뒤 팬꾹으로 보내요." },
  { title: "잠긴 채로 보관해요", body: "승인 없이는 저희 시스템이 주소를 열지 않습니다." },
  { title: "크리에이터가 승인해요", body: "선물 한 건마다 카카오톡 인증서로 서명해요. 전체 승인 버튼은 없어요." },
  { title: "송장 출력 때 열려요", body: "승인된 건만, 송장을 출력하는 순간에 열려요. 이 순간은 기록으로 남아요.", once: true },
  { title: "팬꾹 송장으로 출고해요", body: "검수가 끝난 상자를 팬꾹이 대신 보내 드려요." },
] as const;

const INSPECT = [
  { title: "송장 제거", body: "상자에 붙어 온 원래 송장을 떼어 파쇄해요. 크리에이터행 송장은 팬꾹 송장 하나만 남아요." },
  { title: "겉면 검사", body: "상자 겉면에 주소나 연락처가 숨어 있지 않은지, 이상한 부착물이 없는지 살펴봐요." },
  { title: "추적 장치 검사", body: "위치 추적 장치가 들어 있는지 장비로 검사해요. 이 검수는 요금에 기본으로 포함돼 있어요." },
] as const;

/** 열람 기록 표 예시 — 지어낸 값. 실제 기록은 크리에이터 화면(/creator/log)에 있다. */
const LOG_EXAMPLE = [
  ["10.28 14:32", "FC-7K3M9"],
  ["10.27 11:05", "FC-5D1H6"],
  ["10.25 16:48", "FC-2P8QW"],
] as const;

const NOTS = [
  { title: "승인 없이 주소를 열지 않아요", body: "승인 없이는 저희 시스템이 주소를 열지 않습니다." },
  { title: "한꺼번에 승인하지 않아요", body: "전체 승인 버튼은 없어요. 건마다 따로 서명해요." },
  { title: "거절 이유를 팬에게 알리지 않아요", body: "거절된 선물은 배송되지 않고, 이유는 팬에게 전해지지 않아요." },
  { title: "모든 상자를 열어 보지 않아요", body: "송장 제거와 겉면 검사를 거치고, 걸린 상자만 열어요." },
  { title: "크리에이터행 운송장 번호를 팬에게 보여 주지 않아요", body: "팬이 볼 수 있는 주소는 승인 뒤에 열리는 사무실 주소뿐이에요." },
  { title: "검수를 뺀 요금제를 만들지 않아요", body: "추적 장치 검수는 모든 요금에 포함돼 있어요." },
] as const;

export function AboutPage() {
  return (
    <main id="main">
      <section className={s["about-hero"]} aria-labelledby="about-title">
        <div className="container">
          <h1 className="hero-title" id="about-title">
            선물은 따뜻하게,
            <br />
            주소는 조심스럽게
          </h1>
          <p className={`lead ${s["about-lead"]}`}>
            팬꾹은 팬이 보내는 마음이 크리에이터의 주소를 위험하게 만들지 않도록, 사이에서 선물을 받아 검수하고 대신 보내
            드리는 서비스예요. 네오코드가 만들고 운영합니다.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="why-title">
        <div className={`container ${s.split}`}>
          <h2 id="why-title">&ldquo;택배에 내 주소가 적히는 게 걱정이에요&rdquo;</h2>
          <div className={s.story}>
            <p>
              팬이 보내 주는 선물은 늘 고맙지만, 그 상자 겉면에는 크리에이터의 이름과 집 주소가 그대로 적혀요. 송장은 택배사
              직원, 이웃, 버려진 상자를 본 누구에게나 보일 수 있어요.
            </p>
            <p>
              그래서 많은 크리에이터가 선물 받기를 망설이거나, 주소를 숨기려고 번거로운 방법을 써요. 팬도 마음을 전하고 싶은데
              어디로 보내야 할지 몰라 포기하고요.
            </p>
            <p>
              팬꾹은 이 사이에 한 단계를 두기로 했어요. 팬은 주소를 알 필요가 없고, 크리에이터는 주소를 내놓지 않아도 선물을 받을
              수 있게요.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="once-title">
        <div className="container">
          <div className={`${s.panel} ${s["panel-grid"]}`}>
            <div>
              <h2 id="once-title">
                주소는 송장을 출력하는
                <br />순간에만 열려요
              </h2>
              <p className={`lead ${s["panel-lead"]}`}>
                주소는 잠긴 채로 보관되고, 크리에이터가 승인한 건만 송장을 출력하는 순간에 열려요.
              </p>
            </div>
            <ol className={s.flow} aria-label="주소가 열리기까지의 흐름">
              {FLOW.map((f, i) => (
                <li key={f.title} className={"once" in f ? s.once : undefined}>
                  <span className={s.n} aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3>
                      {f.title}
                      {"once" in f && <span className="tag tag--brand">출력할 때만</span>}
                    </h3>
                    <p>{f.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="inspect-title">
        <div className="container">
          <div className={s["sec-head"]}>
            <div className={`${s["tile-ico"]} ${s["sec-ico"]}`}>
              <img className="asset" src="/img/icon-inspect.png" width={72} height={72} alt="" aria-hidden="true" />
            </div>
            <h2 id="inspect-title">검수는 이렇게 해요</h2>
            <p>사무실에 도착한 모든 상자에 같은 순서를 적용해요.</p>
          </div>
          <ol className="grid cols-3">
            {INSPECT.map((it, i) => (
              <li key={it.title} className={s["inspect-col"]}>
                <p className={s.num}>{i + 1}</p>
                <h3>{it.title}</h3>
                <p>{it.body}</p>
              </li>
            ))}
          </ol>
          <div className={s.promise}>
            <h3>걸린 상자만 열어서 확인해요</h3>
            <p>검사에서 걸린 상자만 개봉해요. 걸리지 않은 상자는 열지 않고 그대로 출고해요.</p>
          </div>
        </div>
      </section>

      <section className={`section ${s["section-flush"]}`} aria-labelledby="log-title">
        <div className={`container ${s.split}`}>
          <div className={s.story}>
            <div className={`${s["tile-ico"]} ${s["sec-ico"]}`}>
              <img className="asset" src="/img/icon-log.png" width={72} height={72} alt="" aria-hidden="true" />
            </div>
            <h2 id="log-title">주소를 연 기록은 크리에이터에게 전부 공개해요</h2>
            <p>
              언제, 어느 주문의 주소를, 누가 열었는지 크리에이터가 언제든 확인할 수 있어요. 승인한 적 없는 주문이 기록에 보이면
              바로 알아챌 수 있어요.
            </p>
            <Link className={`btn ${s["log-cta"]}`} href="/signup">
              크리에이터로 가입하기
            </Link>
          </div>
          <div>
            <div className={s["log-wrap"]} tabIndex={0} role="region" aria-label="주소 열람 기록 예시 표">
              <table className={s.log}>
                <caption className="sr-only">주소 열람 기록 예시</caption>
                <thead>
                  <tr>
                    <th scope="col">열린 시각</th>
                    <th scope="col">주문번호</th>
                    <th scope="col">연 사람</th>
                    <th scope="col">사유</th>
                  </tr>
                </thead>
                <tbody>
                  {LOG_EXAMPLE.map(([at, orderNo]) => (
                    <tr key={orderNo}>
                      <td>{at}</td>
                      <td>{orderNo}</td>
                      <td>대표 계정</td>
                      <td>송장 출력</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">예시 화면이에요. 실제 기록은 크리에이터 화면에서 볼 수 있어요.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="not-title">
        <div className="container">
          <div className={s["sec-head"]}>
            <h2 id="not-title">팬꾹이 하지 않는 것</h2>
            <p>약속만큼 중요한 건 하지 않는 일이에요.</p>
          </div>
          <ul className={s.nots}>
            {NOTS.map((n) => (
              <li key={n.title}>
                <span className={s.x} aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 16 16">
                    <path d="m3 3 10 10M13 3 3 13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <h3>{n.title}</h3>
                  <p className="sub">{n.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={s.closing} aria-labelledby="cta-title">
        <div className="container">
          <h2 id="cta-title">마음을 담아, 꾹.</h2>
          <div className={s["hero-actions"]}>
            <Link className="btn btn--wide" href="/gifts/new">
              지금 바로 선물 보내러 가기
            </Link>
            <Link className="btn btn--line btn--wide" href="/creators">
              나의 크리에이터 찾으러 가기
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
