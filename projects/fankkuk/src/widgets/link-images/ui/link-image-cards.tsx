// 공개 화면 이미지 (creator-link INV-E10).
// - 미리보기(1200×630, 시안 docs/design/mockups/addendum/og-image.html): 고른 사진(프로필 사진 원형 또는 팬덤 심볼 둥근 네모, 가장 크게)·공개 이름·
//   「승인한 선물만 받습니다」·팬꾹 로고. 배경은 옅은 코랄 단색.
// - 공지(홍보 카드 — 정사각 1080×1080·스토리 세로 1080×1920·가로 1200×675, 시안 docs/design/mockups/addendum/customize/story-card.html, 디자인 기준 10절):
//   배경사진(없으면 단색)·프로필 사진(배경 아래 가장자리에 걸침)·공개 이름·한 줄 소개, 하단에 작은 「팬꾹으로 선물 보내기」와 링크 주소.
//   「선물은 팬꾹으로 받아요」 같은 부탁 문구·로고·심볼은 넣지 않는다. 스토리 세로판은 위·아래 250px 에 글자가 없다(자리는 notice-layout).
// 그리는 값은 previewImageInput·noticeImageInput 의 결과와 정해진 문구뿐이다.
// next/og 는 CSS 변수를 읽지 못해 색을 값으로 적는다 — 미리보기는 design-rules 9절의 토큰 값, 공지 이미지는 승인된 시안 값
// (bg = 시안 카드 몸통 · cover = --surface-selected 단색 · ink · sub · accent = --brand-ink · photo = --face-6, 사진이 없을 때 원 바탕).

import { nameInitial, type NoticeImageInput, type NoticeSize, type PreviewPick } from "@/entities/creator/model/link-images";
import { NOTICE_LAYOUT, noticeNameSize } from "../model/notice-layout";

const COLOR = { bg: "#FCECE8", card: "#FFF5F1", cover: "#FCECE8", ink: "#343039", sub: "#665D65", accent: "#A4433D", white: "#FFFFFF", photo: "#F7C8D4" } as const;
const FONT = "Pretendard";

/** 시안 규칙: 5자까지 112px, 6~10자 80px, 11~20자 56px. */
function nameSize(name: string): number {
  const n = [...name].length;
  return n <= 5 ? 112 : n <= 10 ? 80 : 56;
}

function Photo({ src, initial, size, ring, square = false }: { src: string | null; initial: string; size: number; ring: number; square?: boolean }) {
  // 팬덤 심볼은 캐릭터·마크라 원으로 자르지 않고 둥근 네모로 둔다
  const box = { width: size, height: size, borderRadius: square ? size * 0.12 : size / 2, boxShadow: `0 0 0 ${ring}px ${COLOR.white}` } as const;
  if (src) return <img src={src} width={size} height={size} style={{ ...box, objectFit: "cover" }} alt="" />;
  // 사진이 없으면 기본 이미지 — 단색 원 + 이름 첫 글자
  return (
    <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", background: COLOR.photo, color: COLOR.ink, fontSize: size * 0.42, fontWeight: 800 }}>
      {initial}
    </div>
  );
}

export function PreviewImageCard({ name, image, pick, logo }: { name: string; image: string | null; pick: PreviewPick; logo: string }) {
  const size = nameSize(name);
  return (
    <div style={{ width: 1200, height: 630, display: "flex", position: "relative", background: COLOR.bg, fontFamily: FONT }}>
      <div style={{ position: "absolute", left: 96, top: 125, display: "flex" }}>
        <Photo src={image} initial={nameInitial(name)} size={380} ring={14} square={pick === "symbol" && image !== null} />
      </div>
      <div style={{ position: "absolute", left: 568, right: 72, top: 0, bottom: 120, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start" }}>
        <div style={{ display: "flex", fontSize: size, fontWeight: 800, letterSpacing: size <= 56 ? -1.4 : size <= 80 ? -2 : -3, lineHeight: 1.15, color: COLOR.ink }}>{name}</div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 32, height: 84, padding: "0 36px", borderRadius: 20, background: COLOR.white, color: COLOR.accent, fontSize: 40, fontWeight: 800 }}>
          승인한 선물만 받습니다
        </div>
      </div>
      <div style={{ position: "absolute", right: 72, bottom: 52, display: "flex", alignItems: "center", fontSize: 44, fontWeight: 800, color: COLOR.ink }}>
        <img src={logo} width={64} height={64} style={{ marginRight: 16 }} alt="" />
        팬꾹
      </div>
    </div>
  );
}

export function NoticeImageCard({ size, input, photo, background }: { size: NoticeSize; input: NoticeImageInput; photo: string | null; background: string | null }) {
  const l = NOTICE_LAYOUT[size];
  const name = noticeNameSize(l, input.name);
  return (
    <div style={{ width: l.width, height: l.height, display: "flex", position: "relative", background: COLOR.card, fontFamily: FONT, color: COLOR.ink }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: l.width, height: l.bgHeight, display: "flex", background: COLOR.cover }}>
        {background ? <img src={background} width={l.width} height={l.bgHeight} style={{ width: l.width, height: l.bgHeight, objectFit: "cover" }} alt="" /> : null}
      </div>
      <div style={{ position: "absolute", left: (l.width - l.photoSize) / 2, top: l.photoTop, display: "flex" }}>
        <Photo src={photo} initial={input.initial} size={l.photoSize} ring={l.ring} />
      </div>
      <div
        style={{
          position: "absolute",
          left: l.padX,
          right: l.padX,
          top: l.textTop,
          height: l.textBottom - l.textTop,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", fontSize: name, fontWeight: 800, letterSpacing: -2, lineHeight: 1.15 }}>{input.name}</div>
        {input.intro ? (
          <div style={{ display: "flex", marginTop: Math.round(l.introSize * 0.5), fontSize: l.introSize, fontWeight: 800, lineHeight: 1.45, color: COLOR.sub }}>{input.intro}</div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "auto", fontSize: l.footSize, fontWeight: 800, lineHeight: 1.3 }}>
          <div style={{ display: "flex", color: COLOR.accent }}>팬꾹으로 선물 보내기</div>
          <div style={{ display: "flex", marginTop: 6, color: COLOR.sub }}>{input.linkText}</div>
        </div>
      </div>
    </div>
  );
}
