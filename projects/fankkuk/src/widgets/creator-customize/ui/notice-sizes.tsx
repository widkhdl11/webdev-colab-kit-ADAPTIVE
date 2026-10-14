import { NOTICE_SIZES, noticeImagePath, type NoticeSize } from "@/entities/creator/model/link-images";
import { CopyButton } from "@/shared/ui/copy-button";
import s from "./creator-customize.module.css";

// 공지 이미지 받기 — 정사각·스토리 세로·가로 세 크기(creator-link INV-E10, 디자인 기준 10절). 크기마다 내려받기와 이미지 주소 복사.
// 공지 이미지는 링크용 아이디가 있고 본인 확인을 마쳤을 때만 만든다 — 아니면 까닭만 보인다(INV-E5·E10).

const ROWS: readonly { size: NoticeSize; title: string }[] = [
  { size: "square", title: "정사각" },
  { size: "story", title: "세로 (스토리용)" },
  { size: "wide", title: "가로" },
];

/** 썸네일 칸(80) 안에 비율대로 그린 작은 판 — 배경 띠·사진·글줄 자리만 */
function Thumb({ size }: { size: NoticeSize }) {
  const { width, height } = NOTICE_SIZES[size];
  const k = 80 / Math.max(width, height);
  return (
    <span className={s.szThumb} aria-hidden="true">
      <i className={s.mini} style={{ width: Math.round(width * k), height: Math.round(height * k) }}>
        <b className={s.mBg} />
        <b className={s.mAv} />
        <b className={s.mL1} />
        <b className={s.mL2} />
        <b className={s.mFt} />
      </i>
    </span>
  );
}

export function NoticeSizes({ creatorId, ready, siteOrigin }: { creatorId: string; ready: boolean; siteOrigin: string }) {
  if (!ready) return <p className="t-meta">본인 확인을 마치고 「설정」에서 링크 주소를 정하면 받을 수 있어요.</p>;
  return (
    <ul className={s.sizes}>
      {ROWS.map(({ size, title }) => {
        const path = noticeImagePath(creatorId, size);
        const { width, height } = NOTICE_SIZES[size];
        return (
          <li key={size}>
            <Thumb size={size} />
            <span className={s.szText}>
              <b>{title}</b>
              <span className="t-meta">
                {width} × {height}
              </span>
            </span>
            <div className={`btn-stack ${s.szBtns}`}>
              <a className="btn btn--line btn--sm" href={noticeImagePath(creatorId, size, { download: true })} download={`fankkuk-notice-${size}.png`} aria-label={`${title} 공지 이미지 내려받기`}>
                내려받기
              </a>
              <CopyButton
                className="btn btn--line btn--sm"
                text={`${siteOrigin}${path}`}
                label="링크 복사"
                ariaLabel={`${title} 공지 이미지 링크 복사`}
                copiedMessage={`「${title}」 이미지 링크를 복사했어요.`}
                failedMessage="복사가 막혀 있어요. 내려받기로 받아 주세요."
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
