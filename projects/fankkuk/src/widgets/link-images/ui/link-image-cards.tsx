// 공개 화면 이미지 두 장 (creator-link INV-E10). 시안: docs/design/mockups/addendum/og-image.html (1200×630).
// - 미리보기: 프로필 사진(원형, 가장 크게)·공개 이름·「승인한 선물만 받습니다」·팬꾹 로고. 배경은 옅은 코랄 단색.
// - 공지(1080×1080, 시안 없음 — 미리보기와 같은 색·글자 언어): 프로필 사진·「선물은 팬꾹으로 받아요 · 승인한 선물만 받습니다」·링크 주소. 로고는 넣지 않는다(스펙의 칸 목록에 없다).
// 그리는 값은 previewImageInput·noticeImageInput 의 결과(이름·사진·링크 주소)와 정해진 문구뿐이다.
// next/og 는 CSS 변수를 읽지 못해 색을 값으로 적는다 — design-rules 토큰과 같은 값이다(--surface-selected · --ink · --brand-ink · --white).

const COLOR = { bg: "#FCECE8", ink: "#343039", accent: "#A4433D", white: "#FFFFFF", photo: "#F7C8D4" } as const;
const FONT = "Pretendard";

/** 시안 규칙: 5자까지 112px, 6~10자 80px, 11~20자 56px. */
function nameSize(name: string): number {
  const n = [...name].length;
  return n <= 5 ? 112 : n <= 10 ? 80 : 56;
}

function Photo({ src, name, size, ring }: { src: string | null; name: string; size: number; ring: number }) {
  const box = { width: size, height: size, borderRadius: size / 2, boxShadow: `0 0 0 ${ring}px ${COLOR.white}` } as const;
  if (src) return <img src={src} width={size} height={size} style={{ ...box, objectFit: "cover" }} alt="" />;
  // 사진이 없으면 기본 이미지 — 단색 원 + 이름 첫 글자
  return (
    <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", background: COLOR.photo, color: COLOR.ink, fontSize: size * 0.42, fontWeight: 800 }}>
      {[...name][0] ?? ""}
    </div>
  );
}

export function PreviewImageCard({ name, photo, logo }: { name: string; photo: string | null; logo: string }) {
  const size = nameSize(name);
  return (
    <div style={{ width: 1200, height: 630, display: "flex", position: "relative", background: COLOR.bg, fontFamily: FONT }}>
      <div style={{ position: "absolute", left: 96, top: 125, display: "flex" }}>
        <Photo src={photo} name={name} size={380} ring={14} />
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

export function NoticeImageCard({ photo, linkText }: { photo: string | null; linkText: string }) {
  return (
    <div style={{ width: 1080, height: 1080, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: COLOR.bg, fontFamily: FONT, color: COLOR.ink }}>
      <Photo src={photo} name="" size={360} ring={14} />
      <div style={{ display: "flex", marginTop: 72, fontSize: 72, fontWeight: 800, letterSpacing: -2 }}>선물은 팬꾹으로 받아요</div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 32, height: 84, padding: "0 36px", borderRadius: 20, background: COLOR.white, color: COLOR.accent, fontSize: 40, fontWeight: 800 }}>
        승인한 선물만 받습니다
      </div>
      <div style={{ display: "flex", marginTop: 64, fontSize: 48, fontWeight: 800, letterSpacing: -1 }}>{linkText}</div>
    </div>
  );
}
