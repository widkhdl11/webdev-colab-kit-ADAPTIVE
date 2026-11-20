import s from "./about.module.css";

// 팬꾹 소개. 시안: docs/design/mockups/about-20261114/index.html · style.css(design-rules 36절, 2026-11-20 사용자 「시안대로 수정」).
// 순서는 시안 그대로: 첫 화면 → 구역 바로가기(고정) → 선물 승인 → 주소 보호 → 팬에게 보내기(신청 관리 · 선물 배송) → 페이지 꾸미기 → 선물 기록.
// 시안 자체의 머리·바닥글·「본문으로 이동」은 옮기지 않는다 — 사이트 공통 SiteHeader·SiteFooter·layout 의 「본문 바로가기」가 맡는다.
// 「화면 예시」 카드 안의 받지 않기·선물 받기, 진행 막대, 색 견본은 누를 수 없는 장식이라 낭독기에서 뺀다(aria-hidden).

/** 구역 바로가기 — 시안 순서 그대로. href 는 아래 구역 id */
const SECTION_NAV = [
  { id: "receive", label: "선물 승인" },
  { id: "privacy", label: "주소 보호" },
  { id: "send", label: "팬에게 보내기" },
  { id: "channel", label: "페이지 꾸미기" },
  { id: "memories", label: "선물 기록" },
] as const;

/** 선물함 신청 과정 세 단계 */
const REQUEST_FLOW = [
  { title: "선물함 만들기", body: "크리에이터가 준비해요" },
  { title: "팬들이 신청", body: "받을 팬들이 모여요" },
  { title: "현황 확인 · 마감", body: "신청 내역을 보고 준비해요" },
] as const;

export function AboutPage() {
  return (
    <main id="main" className={s.root}>
      <section className={`${s.wrap} ${s.hero}`} aria-labelledby="about-title">
        <div>
          <h1 id="about-title" className={s.h1}>
            팬꾹의 소개
          </h1>
          <p className={s.heroLead}>
            팬과 크리에이터가
            <br />
            선물을 주고받는 방법.
          </p>
          <p>
            보내주신 선물을 팬꾹이 받아
            <br />
            받는 분에게 배송해요.
          </p>
          <a className={`btn ${s.heroBtn}`} href="#receive">
            팬꾹 알아보기 <span aria-hidden="true">↓</span>
          </a>
        </div>
        <figure className={s.heroArt}>
          <img src="/images/mascot-gift.png" alt="선물을 안고 있는 팬꾹 고양이" width={360} height={360} fetchPriority="high" />
          <figcaption>팬에서 크리에이터로, 크리에이터에서 팬으로.</figcaption>
        </figure>
      </section>

      <nav className={s.sectionNav} aria-label="소개 내용 바로가기">
        <div className={s.wrap}>
          {SECTION_NAV.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <section id="receive" className={`${s.section} ${s.wrap} ${s.split}`} aria-labelledby="receive-title">
        <div className={s.copy}>
          <span className={s.sectionLabel}>팬이 크리에이터에게</span>
          <h2 id="receive-title" className={s.h2}>
            승인한 선물만
            <br />
            받아보세요.
          </h2>
          <p>
            팬이 선물을 보낼 때 승인을 요청해요.
            <br />
            <strong>선물 내용을 먼저 확인</strong>하고 받아보세요.
          </p>
          <p>
            팬꾹에 도착한 선물은 검수를 거쳐
            <br />
            크리에이터에게 배송해요.
          </p>
        </div>
        <figure className={`${s.approval} ${s.scene}`}>
          <div className={s.sampleCard}>
            <div className={s.sampleHeading}>
              <img src="/images/home/icon-gift.webp" width={56} height={56} alt="" loading="lazy" />
              <div>
                <span className={s.sub}>별빛님이 보낸 선물</span>
                <strong>직접 만든 키링이에요</strong>
              </div>
            </div>
            <p>
              방송 늘 잘 보고 있어요.
              <br />
              좋아하시는 색으로 만들어 봤어요!
            </p>
            <div className={s.sampleActions} aria-hidden="true">
              <span>받지 않기</span>
              <span>선물 받기</span>
            </div>
          </div>
          <figcaption>
            어떤 선물인지 확인하고 직접 결정해요. <small>화면 예시</small>
          </figcaption>
        </figure>
      </section>

      <section id="privacy" className={s.securityBand} aria-labelledby="privacy-title">
        <div className={`${s.wrap} ${s.security}`}>
          <div>
            <span className={s.sectionLabel}>주소 보호</span>
            <h2 id="privacy-title" className={s.h2}>
              주소는 보호하고,
              <br />
              보관은 최소한으로.
            </h2>
            <p>
              평소에는 크리에이터의 주소를 <strong>암호화해 보관</strong>해요.
              <br />
              <strong>인증을 거쳐 사용할 때만</strong> 주소를 열어볼 수 있어요.
            </p>
            <p>
              팬이 입력한 주소는 배송에 <strong>사용한 뒤 폐기</strong>해요.
            </p>
            <p className={s.securityNote}>
              보관하는 정보와 열람 기회를 줄여,
              <br />
              혹시 모를 정보 유출에도 피해를 줄이도록 설계했어요.
            </p>
          </div>
          <figure>
            <img src="/images/home/promise-lock.webp" alt="주소를 잠가 보관하는 자물쇠" width={200} height={200} loading="lazy" />
            <figcaption>암호화 보관 · 인증 후 열람 · 사용 후 폐기</figcaption>
          </figure>
        </div>
      </section>

      <section id="send" className={`${s.section} ${s.wrap}`} aria-labelledby="send-title">
        <div className={s.sendHeading}>
          <span className={s.sectionLabel}>크리에이터가 팬에게</span>
          <h2 id="send-title" className={s.h2}>
            팬에게 선물을 보낼 땐,
            <br />
            팬꾹의 ‘팬에게 보내기’
          </h2>
          <p>
            선물 받을 팬들의 신청부터 배송까지.
            <br />
            팬꾹에서 한 번에 준비해 보세요.
          </p>
        </div>

        <div className={s.sendPart}>
          <p className={s.partLabel}>신청 관리</p>
          <div className={`${s.split} ${s.giftSection}`}>
            <div className={s.copy}>
              <h3 className={s.h3}>
                선물함으로 신청을
                <br />
                한눈에 관리하세요.
              </h3>
              <p>
                선물함은 크리에이터가
                <br />
                선물 받을 팬들의 신청을 모으는 공간이에요.
              </p>
              <p>
                선물함을 만들면 팬들이 신청할 수 있어요.
                <br />
                <strong>누가, 몇 명이나 신청했는지</strong> 확인하고 마감하세요.
              </p>
            </div>
            <figure className={s.scene}>
              <div className={s.giftCard}>
                <div className={s.lid}>
                  <span className={s.bow} aria-hidden="true" />
                </div>
                <div className={s.giftContent}>
                  <div className={s.giftHeading}>
                    <strong>겨울 시즌 굿즈</strong>
                    <span className={s.pill}>신청 받는 중</span>
                  </div>
                  <p>달력과 스티커를 준비했어요.</p>
                  <div className={s.counts}>
                    <span>신청 인원</span>
                    <b>
                      18 <span>/ 30명</span>
                    </b>
                  </div>
                  <div className={s.progress} aria-hidden="true">
                    <i />
                  </div>
                  <span className={s.sub}>공개 · 11월 14일</span>
                </div>
              </div>
              <figcaption>
                신청 현황을 한곳에서 확인해요. <small>화면 예시</small>
              </figcaption>
            </figure>
          </div>

          <ol className={s.requestFlow} aria-label="선물함 신청 과정">
            {REQUEST_FLOW.map((step, i) => (
              <li key={step.title}>
                <span>{i + 1}</span>
                <strong>{step.title}</strong>
                <small>{step.body}</small>
              </li>
            ))}
          </ol>
        </div>

        <div className={`${s.sendPart} ${s.shipping}`}>
          <p className={s.partLabel}>선물 배송</p>
          <h3 className={s.h3}>
            팬들에게 보낼 선물,
            <br />
            모아서 보내세요.
          </h3>
          <p>
            팬마다 플랫폼으로 선물을 보내면 이용료가 쌓이고,
            <br />
            직접 택배를 보내면 거주지역이 드러날 수 있어요.
          </p>
          <p>
            팬꾹에는 팬별로 준비한 선물을 큰 상자에 모아 보내세요.
            <br />
            팬꾹이 직접 나누어 <strong>팬들에게 각각 배송</strong>해요.
          </p>
          <ol className={s.deliveryFlow} aria-label="크리에이터에서 팬꾹을 거쳐 각 팬에게 배송하는 과정">
            <li>
              <span className={s.placeLabel}>크리에이터</span>
              <div className={s.deliveryArt}>
                <img
                  src="/images/home/revgift-pack.png"
                  alt="각 팬에게 줄 작은 선물 상자들을 큰 상자 하나에 담은 모습"
                  width={180}
                  height={160}
                  loading="lazy"
                />
              </div>
              <span className={s.routeLabel}>큰 상자 하나를 팬꾹으로 →</span>
              <strong>한 상자로 모아 보내요</strong>
              <p>
                팬별 선물에 닉네임을 적어
                <br />큰 상자에 담아 팬꾹으로 보내요.
              </p>
            </li>
            <li>
              <span className={`${s.placeLabel} ${s.hubLabel}`}>팬꾹 도착</span>
              <div className={s.deliveryArt}>
                <img
                  className={s.deliveryPhoto}
                  src="/images/about/company-arrival.png"
                  alt="팬꾹 회사 건물 입구로 큰 상자 하나가 도착하는 모습"
                  width={280}
                  height={192}
                  loading="lazy"
                />
              </div>
              <span className={s.routeLabel}>크리에이터 → 팬꾹</span>
              <strong>큰 상자가 팬꾹에 도착해요</strong>
              <p>
                팬별 선물을 모아 보낸
                <br />큰 상자를 팬꾹에서 받아요.
              </p>
            </li>
            <li>
              <span className={s.placeLabel}>팬별 개별 배송</span>
              <div className={s.deliveryArt}>
                <img
                  className={s.deliveryPhoto}
                  src="/images/about/fan-dispatch.png"
                  alt="큰 상자에서 A, B, C 팬별 작은 선물 상자를 꺼내 각 팬에게 개별 배송하는 모습"
                  width={280}
                  height={192}
                  loading="lazy"
                />
              </div>
              <span className={s.routeLabel}>큰 상자 개봉 → 팬별 선물 발송</span>
              <strong>꺼낸 선물을 각각 배송해요</strong>
              <p>
                큰 상자를 열고 닉네임을 확인해
                <br />
                팬별 선물을 각 팬에게 보내요.
              </p>
            </li>
          </ol>
          <p className={s.shippingBenefit}>
            합리적인 비용으로 보내고,
            <br className={s.mobileBreak} /> 집 주소와 거주지역도 보호하세요.
          </p>
        </div>
      </section>

      <section id="channel" className={s.channelBand} aria-labelledby="channel-title">
        <div className={`${s.wrap} ${s.split} ${s.section}`}>
          <div className={s.copy}>
            <span className={s.sectionLabel}>나만의 팬꾹</span>
            <h2 id="channel-title" className={s.h2}>
              내 채널의 특징을
              <br />
              담아보세요.
            </h2>
            <p>
              프로필 사진과 배경 사진,
              <br />
              대표색을 직접 설정할 수 있어요.
            </p>
            <p>
              팬덤 이름과 뱃지도 등록해
              <br />
              나만의 페이지를 만들어 보세요.
            </p>
          </div>
          <figure className={s.scene}>
            <div className={s.profile}>
              <div className={s.profileCover} />
              <img className={s.avatar} src="/images/mascot-cat.webp" alt="" width={72} height={72} loading="lazy" />
              <strong>하루</strong>
              <span className={s.pill}>별빛단</span>
              <p>게임도 일상도 함께 이야기해요.</p>
              <div className={s.swatches} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <figcaption>
              사진부터 색까지 내 취향대로. <small>화면 예시</small>
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="memories" className={`${s.section} ${s.wrap} ${s.split}`} aria-labelledby="memories-title">
        <div className={s.copy}>
          <span className={s.sectionLabel}>선물과 기록</span>
          <h2 id="memories-title" className={s.h2}>
            주고받은 선물과
            <br />
            감사 인사를 남겨보세요.
          </h2>
          <p>
            어떤 선물을 주고받았는지,
            <br />
            어떤 감사 인사를 나눴는지 다시 볼 수 있어요.
          </p>
          <p>
            짧은 메시지로 고마움을 전하고
            <br />
            기록으로 남겨보세요.
          </p>
        </div>
        <figure className={s.scene}>
          <div className={s.message}>
            <span className={s.sub}>하루님의 답장</span>
            <p>
              키링 잘 받았어요!
              <br />
              가방에 달고 다닐게요.
              <br />
              고마워요.
            </p>
            <img src="/images/home/promise-message.webp" alt="" width={88} height={88} loading="lazy" />
          </div>
          <figcaption>
            선물에 담긴 마음까지 기록해요. <small>화면 예시</small>
          </figcaption>
        </figure>
      </section>
    </main>
  );
}
