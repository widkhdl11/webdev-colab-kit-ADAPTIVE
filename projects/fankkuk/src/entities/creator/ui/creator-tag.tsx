import type { CSSProperties } from "react";
import { tagBrandOf, type TagIcon } from "../model/tag-brand";
import s from "./creator-tag.module.css";

// 크리에이터 태그의 아이콘 배지·태그·칩 안쪽 (design-rules 5절 「크리에이터 태그 아이콘·플랫폼 색」, 시안 v9-pages/tags-b.html).
// 아이콘·색은 tagBrandOf 표에서만 읽는다. 표에 없는 이름은 아이콘 없이 기본 모양.
// 색은 CSS 변수로 넘긴다 — --pc 테두리(고른 칩) · --pf 옅은 면 · --pt 면 위 글자 · --pk 고른 칩 글자.
// 칩의 「골랐을 때」 모양은 칩 모양이 화면마다 달라 각 화면 CSS 가 이 변수로 그린다(변수가 없으면 그 화면의 기본 선택 모양).

/** 이 태그의 색 변수. 표에 없으면 빈 값 — 화면의 기본 칩·태그 모양이 그대로 쓰인다. */
export function tagStyle(name: string): CSSProperties | undefined {
  const brand = tagBrandOf(name);
  if (!brand) return undefined;
  const vars: Record<string, string> = { "--pc": brand.ring, "--pf": brand.fill, "--pt": brand.ink, "--pk": "var(--ink)" };
  return vars as CSSProperties;
}

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

/** 칩(버튼) 안쪽 — 아이콘 + 이름, 고른 칩은 체크(표에 있는 태그만 — 기본 칩은 면 색으로 고른 것을 보인다). */
export function TagChipBody({ name, pressed = false, check = true }: { name: string; pressed?: boolean; check?: boolean }) {
  const brand = tagBrandOf(name);
  return (
    <>
      {brand ? <Badge icon={brand.icon} /> : null}
      <span>{name}</span>
      {brand && pressed && check ? <CheckMark /> : null}
    </>
  );
}

/** 플랫폼 뱃지 안의 24px 동그란 로고(공통 .ctag 의 .bd · 버추얼은 선 그림 svg). 모양·색은 tagBrandOf 표 그대로. */
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

/**
 * 카드·목록·페이지의 태그 하나 = 플랫폼 뱃지(design-rules 0절 — 공통 클래스 .ctag: 흰 바탕 테두리 알약, 마우스를 올리면 옅은 면).
 * --f 옅은 면 · --k 글자·테두리 색. 표에 없는 이름은 로고 없이 중립 뱃지.
 */
export function CreatorTag({ name }: { name: string }) {
  const brand = tagBrandOf(name);
  if (!brand) return <span className={`ctag ${s.plain}`}>{name}</span>;
  const vars: Record<string, string> = { "--f": brand.fill, "--k": brand.ink };
  return (
    <span className="ctag" style={vars as CSSProperties}>
      <CtagLogo icon={brand.icon} />
      {name}
    </span>
  );
}

/** 아이콘이 붙는 태그인지 — 칩에 data-icon 으로 달아 화면 CSS 가 왼쪽 여백을 줄인다(시안 padding 0 16 0 10). */
export function hasTagIcon(name: string): boolean {
  return tagBrandOf(name) !== null;
}
