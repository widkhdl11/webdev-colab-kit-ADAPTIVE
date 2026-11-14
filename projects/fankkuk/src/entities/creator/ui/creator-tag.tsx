import { tagBrandOf, type TagIcon } from "../model/tag-brand";
import s from "./creator-tag.module.css";

// 크리에이터 태그의 아이콘 배지·태그·칩 안쪽 (design-rules 5절 「크리에이터 태그 아이콘·플랫폼 색」, 시안 v9-pages/tags-b.html).
// 아이콘·색은 tagBrandOf 표에서만 읽는다. 표에 없는 이름은 아이콘 없이 기본 모양.
// 2026-11-14 사용자 지시 「차분하고 일관된 스타일」: 플랫폼 색은 로고에만 쓴다 — 칩·뱃지의 면·글자·테두리는 플랫폼마다 같다.
// 활동 유형(버추얼)은 플랫폼이 아니라 로고를 그리지 않는다.

function VirtualGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5C3 8.4 3.9 7.5 5 7.5h14c1.1 0 2 .9 2 2v5c0 1.1-.9 2-2 2h-3.2c-.7 0-1.3-.4-1.7-1l-.7-1.2c-.5-.8-1.7-.8-2.2 0l-.7 1.2c-.4.6-1 1-1.7 1H5c-1.1 0-2-.9-2-2z" />
    </svg>
  );
}

function Badge({ icon }: { icon: TagIcon }) {
  if (icon.kind === "virtual") {
    return (
      <span className={`${s.badge} ${s.virtual}`} aria-hidden="true">
        <VirtualGlyph />
      </span>
    );
  }
  if (icon.kind === "app") {
    return (
      <span className={`${s.badge} ${s.app}`} aria-hidden="true">
        <img src={icon.src} alt="" width={20} height={20} />
      </span>
    );
  }
  return (
    <span className={`${s.badge} ${s.glyph}`} style={{ background: icon.background }} aria-hidden="true">
      <img src={icon.src} alt="" width={12} height={12} />
    </span>
  );
}

/** 20px 아이콘 배지. 표에 없는 이름이면 그리지 않는다. */
export function TagIconBadge({ name }: { name: string }) {
  const brand = tagBrandOf(name);
  return brand ? <Badge icon={brand.icon} /> : null;
}

function CheckMark() {
  return (
    <svg className={s.check} width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 칩(버튼) 안쪽 — 로고 + 이름, 고른 칩은 체크(색만으로 고른 것을 알리지 않는다). 활동 유형은 로고 없이 이름만. */
export function TagChipBody({ name, pressed = false, check = true }: { name: string; pressed?: boolean; check?: boolean }) {
  const brand = tagBrandOf(name);
  return (
    <>
      {brand && brand.icon.kind !== "virtual" ? <Badge icon={brand.icon} /> : null}
      <span>{name}</span>
      {pressed && check ? <CheckMark /> : null}
    </>
  );
}

/** 플랫폼 뱃지 안의 18px 동그란 로고(공통 .ctag 의 .bd · 버추얼은 선 그림 svg). 모양·색은 tagBrandOf 표 그대로. */
function CtagLogo({ icon }: { icon: TagIcon }) {
  if (icon.kind === "virtual") return <VirtualGlyph />;
  if (icon.kind === "app") {
    return (
      <span className="bd" aria-hidden="true">
        <img src={icon.src} alt="" width={24} height={24} />
      </span>
    );
  }
  return (
    <span className={`bd glyph ${s.white}`} style={{ background: icon.background }} aria-hidden="true">
      <img src={icon.src} alt="" width={12} height={12} />
    </span>
  );
}

/** 활동 유형 태그인가(버추얼처럼 플랫폼이 아닌 것) — 로고·테두리 없는 연한 회색 태그로 그린다. */
function isActivityTag(name: string): boolean {
  return tagBrandOf(name)?.icon.kind === "virtual";
}

/** 화면에 놓을 순서 — 플랫폼 뱃지를 먼저, 활동 유형 태그를 뒤에(원래 순서는 각 묶음 안에서 지킨다). */
export function platformFirst(tags: readonly string[]): string[] {
  return [...tags.filter((t) => !isActivityTag(t)), ...tags.filter(isActivityTag)];
}

/**
 * 카드·목록·페이지의 태그 하나(2026-11-14 사용자 지시 「차분하고 일관된 플랫폼 뱃지」).
 * 플랫폼 = 아주 옅은 회색 면 + 얇은 연회색 테두리 + 짙은 회색 글자, 플랫폼 색은 로고에만.
 * 활동 유형(버추얼) = 로고·테두리 없는 연한 회색 태그. 표에 없는 이름은 로고 없는 플랫폼 모양.
 * 자리·한 줄 규칙은 공통 클래스 .ctag, 모양은 creator-tag.module.css 의 .e3 · .activity.
 */
export function CreatorTag({ name }: { name: string }) {
  const brand = tagBrandOf(name);
  if (brand?.icon.kind === "virtual")
    return (
      <span className={`ctag ${s.e3} ${s.activity}`} data-plain="" data-kind="activity">
        <span className={s.label}>{name}</span>
      </span>
    );
  if (!brand)
    return (
      <span className={`ctag ${s.e3} ${s.plain}`} data-plain="">
        <span className={s.label}>{name}</span>
      </span>
    );
  return (
    <span className={`ctag ${s.e3}`}>
      <CtagLogo icon={brand.icon} />
      <span className={s.label}>{name}</span>
    </span>
  );
}

/** 칩 줄에 다 못 들어간 칩 수 「+N」 — 로고 없는 플랫폼 모양. */
export function CreatorTagMore({ count }: { count: number }) {
  return (
    <span className={`ctag ${s.e3} ${s.plain}`} data-plain="">
      +{count}
    </span>
  );
}

/** 아이콘이 붙는 태그인지 — 칩에 data-icon 으로 달아 화면 CSS 가 왼쪽 여백을 줄인다(시안 padding 0 16 0 10). */
export function hasTagIcon(name: string): boolean {
  const brand = tagBrandOf(name);
  return brand !== null && brand.icon.kind !== "virtual";
}
