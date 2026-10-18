import Link from "next/link";
import type { CSSProperties } from "react";
import { bannerLinkKind, type BannerView } from "../model/banner";
import s from "./banner-slide.module.css";

// 광고 배너 한 장 (docs/specs/banners.md INV-Y3·Y6·Y7, 시안 v27-home-airy compose.js 의 slide). 배너를 그리는 자리는 모두 이 부품 하나다 —
// 첫 화면·팬 홈·크리에이터 홈·크리에이터 찾기(넘김 부품 안)와 운영자 화면 미리보기(compact).
// - INV-Y7: 「크리에이터 광고」로 표시한 배너는 제목 바로 앞에 「광고」 꼬리표. 표시 값만 따른다.
// - INV-Y6: 제목·설명은 글자로만 그린다(React 가 글자로 넣는다 — HTML 로 해석하지 않는다).
// - INV-Y3: 링크 갈래를 여기서 다시 가른다 — 팬꾹 안 주소는 같은 탭, https 바깥 주소만 새 탭 + noopener noreferrer, 규칙 밖이면 링크를 그리지 않는다.
// 왼쪽 글(꼬리표 → 제목 → 설명 → 「보러 가기 ›」 흰 알약) · 오른쪽 그림. 바탕은 부르는 쪽이 정한 파스텔 색(tone).

type Props = {
  banner: BannerView;
  tone: string;
  /** 운영자 화면 미리보기 — 작은 띠, 꼬리표는 제목 줄 안, 링크 없음 */
  compact?: boolean;
};

function GoLink({ banner, titleId }: { banner: BannerView; titleId: string }) {
  const kind = bannerLinkKind(banner.link);
  const body = (
    <>
      보러 가기 <span aria-hidden="true">›</span>
    </>
  );
  if (kind === "internal") {
    return (
      <Link className={s.go} href={banner.link} aria-describedby={titleId} data-banner-go="">
        {body}
      </Link>
    );
  }
  if (kind === "external") {
    return (
      <a className={s.go} href={banner.link} target="_blank" rel="noopener noreferrer" aria-describedby={titleId} data-banner-go="">
        {body}
        <span className="sr-only">(새 탭으로 열려요)</span>
      </a>
    );
  }
  return null;
}

export function BannerSlide({ banner, tone, compact = false }: Props) {
  const titleId = `banner-title-${banner.id}${compact ? "-preview" : ""}`;
  return (
    <div className={`${s.card} ${compact ? s.compact : ""}`} style={{ "--tone": tone } as CSSProperties} data-banner-card="">
      <div className={s.txt}>
        {banner.isAd ? (
          <span className={s.tag} data-banner-tag="">
            광고
          </span>
        ) : null}
        <p className={s.title} id={titleId} data-banner-title="">
          {banner.title}
        </p>
        {banner.description ? <p className={s.sub}>{banner.description}</p> : null}
        {compact ? null : <GoLink banner={banner} titleId={titleId} />}
      </div>
      {banner.imageUrl ? <img className={s.img} src={banner.imageUrl} alt="" width={180} height={180} /> : null}
    </div>
  );
}
