import { NOTICE_SIZES, noticeImagePath, type NoticeSize } from "@/entities/creator/model/link-images";
import { CREATOR_SETTINGS } from "@/entities/session/model/home-path";
import { CopyButton } from "@/shared/ui/copy-button";
import s from "./creator-customize.module.css";

// 공지 이미지 받기 — 정사각·스토리 세로·가로 세 크기(creator-link INV-E10, design-rules 27절 · 시안 pilot-2026-10-22/customize.html .cz-sizes).
// 크기마다 한 줄: 썸네일 · 이름과 크기 · 줄 오른쪽 끝 「내려받기」「링크 복사」(767 이하는 버튼이 줄 아래 꽉 차게).
// 공지 이미지는 링크용 아이디가 있고 본인 확인을 마쳤을 때만 만든다 — 아니면 안내 한 줄, 그 속 「설정」은 상세 설정의 선물 링크 칸(링크 주소를 정하는 곳)으로 간다(INV-E5·E10).

const ROWS: readonly { size: NoticeSize; title: string }[] = [
  { size: "square", title: "정사각" },
  { size: "story", title: "세로 (스토리용)" },
  { size: "wide", title: "가로" },
];

/** 상세 설정에서 링크 주소를 정하는 칸 — 접힌 「선물 링크」 안이고, 상세 설정이 주소 끝 #link 를 보고 펼친다 */
const LINK_SETTING = `${CREATOR_SETTINGS}#link`;

/** 썸네일 칸(48) 안에 비율대로 그린 작은 판 */
function Thumb({ size }: { size: NoticeSize }) {
  const { width, height } = NOTICE_SIZES[size];
  const k = 46 / Math.max(width, height);
  return (
    <span className={s.szThumb} aria-hidden="true">
      <i className={s.mini} style={{ width: Math.round(width * k), height: Math.round(height * k) }} />
    </span>
  );
}

export function NoticeSizes({ creatorId, ready, siteOrigin }: { creatorId: string; ready: boolean; siteOrigin: string }) {
  if (!ready)
    return (
      <p className={s.lock}>
        채널 소유자 확인 후 ‘<a href={LINK_SETTING}>상세 설정 &gt; 선물 링크</a>’에서 링크 주소를 등록하면 다운로드할 수 있습니다.
      </p>
    );
  return (
    <ul className={s.sizes}>
      {ROWS.map(({ size, title }) => {
        const path = noticeImagePath(creatorId, size);
        const { width, height } = NOTICE_SIZES[size];
        return (
          <li key={size}>
            <Thumb size={size} />
            <span className={s.szText}>
              <span className={s.k} data-size-title="">
                {title}
              </span>
              <span className={s.sub} data-size-px="">
                {width} × {height}
              </span>
            </span>
            <span className={s.szBtns}>
              <a className="btn btn--line btn--sm" href={noticeImagePath(creatorId, size, { download: true })} download={`fankkuk-notice-${size}.png`} aria-label={`${title} 공지 이미지 다운로드`}>
                다운로드
              </a>
              <CopyButton
                className="btn btn--line btn--sm"
                text={`${siteOrigin}${path}`}
                label="링크 복사"
                ariaLabel={`${title} 공지 이미지 링크 복사`}
                copiedMessage={`‘${title}’ 이미지 링크가 복사되었습니다.`}
                failedMessage="링크를 복사하지 못했습니다. 이미지를 다운로드해 주세요."
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
