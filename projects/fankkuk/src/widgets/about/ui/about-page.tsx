import Link from "next/link";
import { PROMISE } from "@/shared/config/site-copy";
import { AboutIcon } from "./about-icons";
import { AboutThemeDemo } from "./about-theme-demo";
import s from "./about.module.css";

// 팬꾹 소개. 시안: docs/design/mockups/about-20261101/index.html(전체) + 03~06 은 about-features-alts-20261101 「안 A」(design-rules 36절).
// 순서는 시안 그대로: 첫 화면 → 왜 만들었나 → 01 주소(띠) → 02 팬에게 보내는 선물 → 03~06 기능 카드(2×2 같은 높이) → 지키는 기준 + 열람 기록 → 끝 행동.
// 문구는 코드가 정본이다 — 시안과 다른 문장(첫 화면 설명·검수 네 칸·검수 설명)은 원래 코드 문장을 그대로 쓰고, 약속 문장은 shared/config/site-copy 를 읽는다.
// 조용한 번호 01~06 은 메인 소개 띠(34절)와 같은 장식이라 낭독기에서 뺀다.

const FLOW: readonly { title: string; body: string; once?: true }[] = [
  { title: "입력 즉시 암호화", body: "주소는 입력한 기기에서 암호화한 뒤 팬꾹으로 전송합니다." },
  { title: "암호화 상태로 보관", body: "승인 전에는 주소를 열람할 수 없습니다." },
  { title: "선물별 직접 승인", body: "크리에이터가 선물마다 카카오톡 인증으로 승인합니다." },
  { title: "송장 출력 시 열람", body: "주소를 열람할 때마다 기록을 남깁니다.", once: true },
  { title: "팬꾹 송장으로 출고", body: "승인과 검수가 완료된 선물을 출고합니다." },
];

/** 검수 네 칸 — 넷째(개봉 검수)만 번호 칸 색이 다르다 */
const INSPECT: readonly { title: string; body: string; open?: true }[] = [
  { title: "송장 제거", body: "상자에 붙어 있던 송장은 떼어 따로 보관합니다. 상자를 돌려보내거나 크리에이터에게 보낼 때, 상자를 처분하거나 경찰에 넘길 때 파쇄합니다." },
  { title: "겉면 검사", body: "상자 겉면에 숨겨진 연락처나 의심스러운 부착물이 있는지 확인합니다." },
  { title: "추적 장치 탐지", body: "팬이 보낸 모든 상자를 탐지기로 검사합니다." },
  { title: "탐지기 반응 시 개봉 검수", body: PROMISE.inspectionOpen, open: true },
];

/** 02 팬에게 보내는 선물 — 세 장면 */
const REVERSE: readonly { title: string; body: string }[] = [
  { title: "받을 팬 고르기", body: "크리에이터가 선물을 받을 팬을 고르고 선물을 등록합니다." },
  { title: "팬이 받을지 선택", body: "팬은 ‘받기’ 또는 ‘받지 않기’를 고릅니다." },
  { title: "팬꾹이 확인 후 배송", body: "팬꾹이 상자 겉면과 보낼 수 없는 물품을 확인한 뒤, 받기를 고른 팬에게 배송합니다." },
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

/** 장식 번호 — 순서는 제목·목록이 전한다 */
function Num({ n }: { n: number }) {
  return (
    <span className={s.num} aria-hidden="true">
      {String(n).padStart(2, "0")}
    </span>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m5 12 5 5L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AboutPage() {
  return (
    <main id="main" className={s.root}>
      {/* 1. 첫 화면 — 문구 묶음과 그림의 세로 중심을 맞춘다(879 이하 그림이 위) */}
      <section className={s.hero} aria-labelledby="about-title">
        <div className={`${s.wrap} ${s.heroGrid}`}>
          <div className={s.heroCopy}>
            <p className={s.eyebrow}>팬꾹 소개</p>
            <h1 className="t-hero" id="about-title">
              선물에 담긴 마음은 그대로,
              <br />
              주소는 비공개로
            </h1>
            <p className={s.lede}>
              팬꾹은 팬이 보낸 선물을 <strong>검수한 뒤</strong> 크리에이터에게 배송하는 서비스입니다. {PROMISE.addressFan}
            </p>
            <div className={s.acts}>
              <Link className="btn" href="/gifts/new">
                선물 보내기
              </Link>
              <Link className="btn btn--line" href="/creators">
                크리에이터 찾기
              </Link>
            </div>
          </div>
          <img className={s.heroArt} src="/img/icon-address-lock.png" width={200} height={200} alt="" aria-hidden="true" fetchPriority="high" />
        </div>
      </section>

      {/* 2. 왜 만들었나 — 680 한 기둥, 셋째 문단만 본문색 굵게 */}
      <section className={`${s.wrap} ${s.sec}`} aria-labelledby="why-title">
        <div className={s.story}>
          <h2 id="why-title" className={s.h2}>
            &ldquo;선물은 받고 싶지만,
            <br />
            주소가 알려질까 걱정돼요&rdquo;
          </h2>
          <div className={s.storyBody}>
            <p>선물을 직접 받으면 상자의 송장에 이름과 주소가 남습니다. 배송 중이나 상자를 버린 뒤에도 이 정보가 다른 사람에게 보일 수 있습니다.</p>
            <p>크리에이터에게는 주소 공개가 부담이 되고, 팬에게는 선물을 보낼 곳을 알기 어렵다는 문제가 있습니다.</p>
            <p>팬은 팬꾹 주소로 선물을 보내고, 팬꾹이 검수 후 크리에이터에게 전달합니다. 크리에이터는 팬에게 주소를 공개하지 않고 선물을 받을 수 있습니다.</p>
          </div>
        </div>
      </section>

      {/* 3. 01 주소 — 화면 끝까지 칠한 띠. 왼쪽 설명 → 오른쪽 잠김·열림 장면 → 아래 다섯 단계(넷째만 흰 칸 + 「출력할 때만」) */}
      <section className={s.band} aria-labelledby="once-title">
        <div className={s.wrap}>
          <div className={s.addrGrid}>
            <div>
              <Num n={1} />
              <h2 id="once-title" className={s.h2}>
                송장 출력에만
                <br />
                사용하는 <span className={s.accent}>주소</span>
              </h2>
              <p className={s.lede}>
                주소는 <strong>암호화해 보관</strong>하며, 승인과 검수가 완료된 상자의 <strong>송장 출력에만</strong> 사용합니다.
              </p>
              <p className={s.privateNote}>
                <AboutIcon name="lock" />
                {PROMISE.addressFan}
              </p>
            </div>
            <div className={s.scene} role="img" aria-label="주소가 잠겨 있다가 송장을 출력할 때만 열리는 예시 그림">
              <div className={s.sceneCard} aria-hidden="true">
                <span className={`${s.badge} ${s.badgeGray}`}>
                  <AboutIcon name="lock" />
                  잠김
                </span>
                <div className={s.mask}>
                  <i />
                  <i />
                </div>
                <p className={s.sceneLog}>승인 전 · 열람 불가</p>
              </div>
              <span className={s.sceneArrow} aria-hidden="true">
                <AboutIcon name="arrow" />
              </span>
              <div className={s.sceneCard} aria-hidden="true">
                <span className={`${s.badge} ${s.badgeBrand}`}>
                  <AboutIcon name="unlock" />
                  열림
                </span>
                <p className={s.sceneAddr}>서울시 ○○구 ○○로 ●●</p>
                <p className={s.sceneLog}>10월 14일 14:02 · 주문 FC-4T2N8 · 송장 출력으로 열림</p>
              </div>
            </div>
          </div>
          <ol className={s.steps} aria-label="주소가 열리기까지의 흐름">
            {FLOW.map((f, i) => (
              <li key={f.title} className={f.once ? s.on : undefined}>
                <span className={s.stepNo} aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
                {f.once && <span className={`${s.badge} ${s.badgeBrand} ${s.stepTag}`}>출력할 때만</span>}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4. 02 팬에게 보내는 선물 — 가로 흐름 세 장면(그림 칸 공통 높이, 화살표는 그림 칸 세로 중심, 767 이하 세로) */}
      <section className={`${s.wrap} ${s.sec}`} aria-labelledby="revgift-title">
        <Num n={2} />
        <h2 id="revgift-title" className={s.h2}>
          팬에게 보내는 선물도
          <br />
          팬꾹으로
        </h2>
        <p className={s.lede}>
          크리에이터도 팬꾹으로 팬에게 선물을 보낼 수 있습니다. <strong>받을지는 팬이 직접</strong> 정합니다.
        </p>
        <ol className={s.flow}>
          {REVERSE.map((r, i) => (
            <li key={r.title}>
              <div className={s.art} aria-hidden="true">
                {i === 0 && (
                  <div className={s.pick}>
                    {["팬 A", "팬 B", "팬 C"].map((fan, j) => (
                      <span key={fan} className={j === 2 ? s.off : undefined}>
                        <img src="/images/mascot-cat.webp" width={20} height={20} alt="" loading="lazy" />
                        {fan}
                        <i />
                      </span>
                    ))}
                  </div>
                )}
                {i === 1 && (
                  <div className={s.choice}>
                    <b>선물이 도착했어요</b>
                    <span className={s.yes}>받기</span>
                    <span className={s.no}>받지 않기</span>
                  </div>
                )}
                {i === 2 && (
                  <div className={s.deliver}>
                    <img src="/images/home/icon-truck.webp" width={72} height={72} alt="" loading="lazy" />
                    <span className={`${s.badge} ${s.badgeOk}`}>
                      <CheckGlyph />
                      확인 후 배송
                    </span>
                  </div>
                )}
              </div>
              <div className={s.cap}>
                <span className={s.flowNo} aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 5. 03~06 기능 카드 — 2×2 같은 높이 격자, 예시 그림이 카드 아래쪽을 채운다(879 이하 한 열 03→06) */}
      <div className={`${s.wrap} ${s.sec}`}>
        <div className={s.features}>
          <section className={`card ${s.f}`} aria-labelledby="inspect-title">
            <Num n={3} />
            <div className={s.fHead}>
              <h2 id="inspect-title" className={s.h2Sub}>
                선물 검수 절차
              </h2>
              <p className={s.lede}>{PROMISE.inspection}</p>
            </div>
            <ol className={s.ins}>
              {INSPECT.map((it, i) => (
                <li key={it.title} className={it.open ? s.open : undefined}>
                  <span className={s.insNo} aria-hidden="true">
                    {i + 1}
                  </span>
                  <b>{it.title}</b>
                  <p>{it.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className={`card ${s.f}`} aria-labelledby="manage-title">
            <Num n={4} />
            <div className={s.fHead}>
              <h2 id="manage-title" className={s.h2Sub}>
                배송 현황과 지금 할 일
              </h2>
              <p className={s.lede}>
                선물이 어디쯤 왔는지 확인하고, 승인처럼 <strong>바로 처리할 일</strong>도 같은 화면에서 이어 갑니다.
              </p>
            </div>
            <div className={s.screen} role="img" aria-label="선물 현황 화면 예시: 검수 중 1건, 배송 중 1건, 도착 완료 1건, 승인할 선물 1건">
              <div className={s.screenBar} aria-hidden="true">
                선물 현황<small>화면 예시</small>
              </div>
              <div className={s.rows} aria-hidden="true">
                <div className={s.row}>
                  <img src="/images/home/icon-gift.webp" width={28} height={28} alt="" loading="lazy" />
                  <span>응원을 담은 선물</span>
                  <em className={`${s.badge} ${s.badgeWarn}`}>검수 중</em>
                </div>
                <div className={s.row}>
                  <img src="/images/home/icon-truck.webp" width={28} height={28} alt="" loading="lazy" />
                  <span>생일 축하 선물</span>
                  <em className={`${s.badge} ${s.badgeBrand}`}>배송 중</em>
                </div>
                <div className={s.row}>
                  <img src="/images/home/icon-gift.webp" width={28} height={28} alt="" loading="lazy" />
                  <span>100일 기념 선물</span>
                  <em className={`${s.badge} ${s.badgeOk}`}>도착 완료</em>
                </div>
              </div>
              <div className={s.todo} aria-hidden="true">
                <div>
                  <small>지금 할 일</small>
                  <b>승인할 선물 1건</b>
                </div>
                <span className={s.fakeBtn}>확인</span>
              </div>
            </div>
          </section>

          <section className={`card ${s.f}`} aria-labelledby="memory-title">
            <Num n={5} />
            <div className={s.fHead}>
              <h2 id="memory-title" className={s.h2Sub}>
                선물과 감사 답장을 함께
              </h2>
              <p className={s.lede}>
                주고받은 선물과 답장이 <strong>‘함께한 시간’</strong>에 모입니다. 팬 본인만 볼 수 있습니다.
              </p>
            </div>
            <div className={s.memory} role="img" aria-label="함께한 시간 예시: 응원을 담은 선물과 그 선물에 대한 꾹냥님의 감사 답장">
              <div className={s.mGift} aria-hidden="true">
                <img src="/images/home/icon-gift.webp" width={40} height={40} alt="" loading="lazy" />
                <div>
                  <b>응원을 담은 선물</b>
                  <small>10월 14일 도착</small>
                </div>
              </div>
              <svg className={s.mLink} viewBox="0 0 16 24" aria-hidden="true" focusable="false">
                <path d="M8 2v18M3 15l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className={s.letter} aria-hidden="true">
                <p className={s.letterHead}>
                  <img src="/images/mascot-cat.webp" width={28} height={28} alt="" loading="lazy" />
                  꾹냥님의 감사 답장
                </p>
                <p className={s.letterBody}>보내 준 선물 잘 받았어요. 마음 써 줘서 고마워요. 오래 간직할게요!</p>
              </div>
            </div>
          </section>

          <section className={`card ${s.f} ${s.fTheme}`} aria-labelledby="profile-title">
            <Num n={6} />
            <div className={s.fHead}>
              <h2 id="profile-title" className={s.h2Sub}>
                테마 색으로 꾸미는 페이지
              </h2>
              <p className={s.lede}>
                크리에이터는 <strong>팬덤 이름·팬마크·테마 색</strong>으로 자기 페이지를 꾸밉니다.
              </p>
            </div>
            <AboutThemeDemo />
          </section>
        </div>
      </div>

      {/* 6. 신뢰 — 지키는 기준(두 열, 여백으로만 나눈다) + 열람 기록 예시 */}
      <section className={`${s.wrap} ${s.sec}`} aria-labelledby="not-title">
        <h2 id="not-title" className={s.h2}>
          팬꾹이 지키는 기준
        </h2>
        <p className={s.lede}>주소 보호와 선물 전달을 위해 지키는 기준입니다.</p>
        <ul className={s.rules}>
          {NOTS.map((n) => (
            <li key={n.title}>
              <span className={s.ruleIc} aria-hidden="true">
                <AboutIcon name="shield" />
              </span>
              <h3>{n.title}</h3>
              <p>{n.body}</p>
            </li>
          ))}
        </ul>

        <div className={s.log}>
          <div>
            <h3 id="log-title" className={s.h2Sub}>
              직접 확인하는 주소 열람 기록
            </h3>
            <p className={s.lede}>크리에이터는 자신의 선물에 대한 주소 열람 시각·주문번호·송장 출력 차수를 확인할 수 있습니다.</p>
            <div className={s.logActs}>
              <Link className="btn btn--line" href="/signup">
                크리에이터 가입
              </Link>
            </div>
          </div>
          <div className={s.logSide}>
            <div className={s.screen} tabIndex={0} role="region" aria-label="주소 열람 기록 예시 표">
              <div className={s.screenBar}>
                주소 열람 기록<small>예시</small>
              </div>
              <table className={s.logTable}>
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
            <p className={s.logNote}>이해를 돕기 위한 예시입니다. 실제 기록은 크리에이터 화면의 ‘열람 기록’에서 확인해 주세요.</p>
          </div>
        </div>
      </section>

      {/* 7. 끝 행동 — 하늘 띠 */}
      <section className={s.end} aria-labelledby="cta-title">
        <div className={s.wrap}>
          <h2 id="cta-title" className={s.h2}>
            마음을 담아, 꾹.
          </h2>
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
