import Link from "next/link";
import { OPERATOR_NAME, PROMISE } from "@/shared/config/site-copy";
import { withSubjectParticle } from "@/shared/lib/format/subject-particle";
import s from "./about.module.css";

// 팬꾹 소개. 시안: docs/design/mockups/site/v4/about.html
// 약속 문장은 shared/config/site-copy 의 고정 문구를 그대로 읽는다(문구 v2). 소개 이야기는 해요체, 약속·하지 않는 것은 합니다체.

const FLOW = [
  { title: "입력하자마자 잠가요", body: "크리에이터가 입력한 주소는 팬꾹으로 오기 전에 잠겨요." },
  { title: "잠긴 채 보관해요", body: PROMISE.address },
  { title: "크리에이터가 승인해요", body: "선물마다 카카오톡으로 한 번 더 확인해요." },
  { title: "송장 출력 때만 열려요", body: "열릴 때마다 기록이 남아요.", once: true },
  { title: "팬꾹 송장으로 출고해요", body: "승인과 검수를 모두 통과한 선물만 출고합니다." },
] as const;

const INSPECT = [
  { title: "송장 제거", body: "원래 송장은 떼어서 파쇄해요." },
  { title: "겉면 검사", body: "숨겨진 연락처나 이상한 부착물이 없는지 봐요." },
  { title: "추적 장치 탐지", body: "모든 상자를 탐지기로 검사해요." },
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
  { title: "필요 없이 상자를 열지 않습니다", body: "탐지기 반응이 있는 상자만 열어요." },
  { title: "크리에이터에게 가는 송장번호는 공개하지 않습니다", body: "팬에게 보이는 주소는 팬꾹 주소뿐이에요." },
  { title: "검수를 뺀 요금제는 만들지 않습니다", body: "모든 요금에 검수가 포함돼요." },
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
            팬꾹은 팬의 선물을 검수하고 크리에이터에게 대신 보내는 서비스예요. {PROMISE.addressFan} {withSubjectParticle(OPERATOR_NAME)} 만들고
            운영합니다.
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
              그래서 팬꾹이 팬과 크리에이터 사이에 들어가기로 했어요. 팬은 주소를 몰라도 선물을 보낼 수 있고, 크리에이터는 주소를
              드러내지 않고 받을 수 있어요.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="once-title">
        <div className="container">
          <div className={`${s.panel} ${s["panel-grid"]}`}>
            <div>
              <h2 id="once-title">
                주소는 송장을 출력할 때만
                <br />열립니다
              </h2>
              <p className={`lead ${s["panel-lead"]}`}>
                {PROMISE.address} 승인한 선물도 송장을 출력할 때만 열려요.
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
            <p>{PROMISE.inspection}</p>
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
            <h3>반응이 있으면 개봉 검수</h3>
            <p>{PROMISE.inspectionOpen}</p>
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
              언제, 어느 주문의 주소가 몇 번째로 열렸는지 크리에이터가 언제든 확인할 수 있어요. 승인한 적 없는 주문이 기록에 보이면
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
                    <th scope="col">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {LOG_EXAMPLE.map(([at, orderNo]) => (
                    <tr key={orderNo}>
                      <td>{at}</td>
                      <td>{orderNo}</td>
                      <td>첫 출력</td>
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
