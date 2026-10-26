import type { PreviewPick } from "@/entities/creator/model/link-images";
import s from "./creator-customize.module.css";

// 링크 공유 카드 — 「링크를 공유하면 이렇게 보여요」(design-rules 27절, 시안 pilot-2026-10-22/customize.html .cz-share).
// 이 화면에서 바꿀 수 있는 것은 미리보기 이미지 고르기뿐이라 미리보기도 그것이 바로 바뀌어 보이는 이 카드 하나만 둔다.
// 2026-10-22: 프로필 카드 미리보기(공개 이름·소개·심볼·감사 문장)와 「접기」는 뺐다 — 이 화면에서 고칠 수 없는 카드라서(사용자 「카드 미리보기가 너무 많다」 → 추천대로).
// 그림은 장식이라 읽지 않는다 — 고른 결과는 라디오와 결과 줄이 알린다.

export type ShareCardValues = {
  name: string;
  initial: string;
  photoUrl: string | null;
  symbolUrl: string | null;
  pick: PreviewPick;
};

export function ShareCard({ v }: { v: ShareCardValues }) {
  return (
    <div className={s.share}>
      <p className={s.cap}>링크 공유 미리보기</p>
      <div className={s.shCard} data-share-card="">
        <div className={s.shImg} aria-hidden="true">
          {v.pick === "symbol" && v.symbolUrl ? (
            <img className={s.shSym} src={v.symbolUrl} alt="" width={512} height={512} />
          ) : (
            <span className={s.shAvatar}>{v.photoUrl ? <img src={v.photoUrl} alt="" width={512} height={512} /> : v.initial}</span>
          )}
        </div>
        <p className={s.shTitle}>{(v.name || "이름") + " · 팬꾹"}</p>
      </div>
    </div>
  );
}
