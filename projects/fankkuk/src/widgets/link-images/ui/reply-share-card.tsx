// 답장 공유 카드 (gift-reply INV-G9). 시안: docs/design/mockups/addendum/share-card.html — 정사각형 1080×1080 · X 용 가로 1200×675.
// 그리는 값은 replyCardInput 의 결과(크리에이터 이름·사진·문구·한 줄·날짜, 팬이 고른 경우에만 팬 닉네임)와 로고·정해진 문구뿐이다.
// 답장 글자는 길이에 따라 줄인다(cardTextSizes, DECISIONS 2026-10-11). 크리에이터 이름도 길이에 따라 줄이고(cardNameSize — 20자도 가로 카드 왼쪽 열 296px 안),
// 칸보다 긴 낱말은 그 안에서 줄을 바꾼다(break-word). 답장 속 팬 닉네임은 그대로 둔다(사용자 결정).
// next/og 는 CSS 변수를 읽지 못해 색을 값으로 적는다 — design-rules 토큰과 같은 값이다
// (bg = --surface-brand · ink = --ink · sub = --sub · accent = --brand-ink · white = --white · photo = --face-3, 사진이 없을 때 원 바탕). 2026-10-15 하늘색으로 바꿈.

import { cardNameSize, cardTextSizes, type CardSize } from "@/entities/gift-reply/model/reply";
import type { ReplyCardInput } from "@/entities/gift-reply/model/reply-card";

const COLOR = { bg: "#F0F8FF", ink: "#1F2937", sub: "#4B5563", accent: "#1F2937", white: "#FFFFFF", photo: "#CFE3FA" } as const;
const FONT = "Pretendard";

function Photo({ src, initial, size, ring }: { src: string | null; initial: string; size: number; ring: number }) {
  const box = { width: size, height: size, borderRadius: size / 2, boxShadow: `0 0 0 ${ring}px ${COLOR.white}` } as const;
  if (src) return <img src={src} width={size} height={size} style={{ ...box, objectFit: "cover" }} alt="" />;
  return (
    <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", background: COLOR.photo, color: COLOR.ink, fontSize: size * 0.43, fontWeight: 800 }}>
      {initial}
    </div>
  );
}

function Panel({ card, size, style }: { card: ReplyCardInput; size: CardSize; style: Record<string, number | string> }) {
  const text = cardTextSizes(card.phraseText, card.line, size);
  const square = size === "square";
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", background: COLOR.white, borderRadius: square ? 48 : 40, ...style }}>
      {card.fanNickname ? (
        <div style={{ display: "flex", color: COLOR.accent, fontSize: square ? 44 : 36, fontWeight: 800, letterSpacing: -0.5, marginBottom: square ? 20 : 16 }}>
          {card.fanNickname}님께
        </div>
      ) : null}
      <div style={{ display: "flex", fontSize: text.phrase, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1.3, color: COLOR.ink, wordBreak: "keep-all" }}>{card.phraseText}</div>
      {card.line ? (
        <div style={{ display: "flex", marginTop: square ? 24 : 20, fontSize: text.line, lineHeight: 1.5, color: COLOR.ink, wordBreak: "keep-all" }}>{card.line}</div>
      ) : null}
    </div>
  );
}

function Who({ card, size }: { card: ReplyCardInput; size: CardSize }) {
  const square = size === "square";
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ display: "flex", fontSize: cardNameSize(card.creatorName, size), fontWeight: 800, letterSpacing: -1, lineHeight: 1.15, color: COLOR.ink, wordBreak: "break-word" }}>
        {card.creatorName}님이 남긴
      </div>
      <div style={{ display: "flex", marginTop: square ? 4 : 2, fontSize: square ? 40 : 32, color: COLOR.sub }}>감사 답장</div>
    </div>
  );
}

function Logo({ logo, size, fontSize }: { logo: string; size: number; fontSize: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", fontSize, fontWeight: 800, letterSpacing: -1, color: COLOR.ink }}>
      <img src={logo} width={size} height={size} style={{ marginRight: size / 4 }} alt="" />
      팬꾹
    </div>
  );
}

export function ReplyShareCard({ card, size, photo, logo }: { card: ReplyCardInput; size: CardSize; photo: string | null; logo: string }) {
  if (size === "square") {
    return (
      <div style={{ width: 1080, height: 1080, display: "flex", position: "relative", background: COLOR.bg, fontFamily: FONT }}>
        <div style={{ position: "absolute", left: 72, top: 72, right: 72, display: "flex", alignItems: "center" }}>
          <Photo src={photo} initial={card.initial} size={176} ring={10} />
          <div style={{ display: "flex", flex: 1, minWidth: 0, marginLeft: 36 }}>
            <Who card={card} size={size} />
          </div>
        </div>
        <Panel card={card} size={size} style={{ position: "absolute", left: 72, right: 72, top: 296, height: 584, padding: "56px 64px" }} />
        <div style={{ position: "absolute", left: 72, right: 72, bottom: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 40, color: COLOR.sub }}>{card.date}</div>
          <Logo logo={logo} size={72} fontSize={48} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ width: 1200, height: 675, display: "flex", position: "relative", background: COLOR.bg, fontFamily: FONT }}>
      <div style={{ position: "absolute", left: 72, top: 72, bottom: 60, width: 296, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <Photo src={photo} initial={card.initial} size={200} ring={10} />
        <div style={{ display: "flex", width: 296, marginTop: 28 }}>
          <Who card={card} size={size} />
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 32, color: COLOR.sub }}>{card.date}</div>
        <div style={{ display: "flex", marginTop: 16 }}>
          <Logo logo={logo} size={48} fontSize={36} />
        </div>
      </div>
      <Panel card={card} size={size} style={{ position: "absolute", left: 424, right: 72, top: 72, bottom: 72, padding: "48px 56px" }} />
    </div>
  );
}
