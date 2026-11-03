import { CreatorCoverArt, coverPastelVar } from "@/entities/creator/ui/creator-cover-art";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import s from "./creator-profile.module.css";

// 「채널 확인 중」 크리에이터 페이지 (creator-verification INV-V22, 시안 channel-link-verify-20261102 #profile-verifying · design-rules 42절).
// 확인 대기 요청이 있는 확인 전 크리에이터의 팬꾹 링크로 오면 「없는 페이지」 대신 이 화면이다. 크리에이터 상세(35절)의 머리 틀을 그대로 쓰고
// 공개 이름·프로필 사진·한 줄 소개만 그린다. 선물 버튼 자리에 하늘 안내 상자 한 줄 — 선물 보내기·팔로우·채널 아이콘·평균 승인 시간은 없다.

export type VerifyingCreatorView = { creatorId: string; name: string; intro: string; photoUrl: string | null; faceTone: string };

function ClockIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VerifyingCreatorPage({ creator, signedIn }: { creator: VerifyingCreatorView; signedIn: boolean }) {
  return (
    <main id="main" className={signedIn ? `page-centered ${s.app}` : s.pub} data-wide-pub="">
      <div className={s.col}>
        <section className={s.pf} aria-labelledby="creator-name">
          <div className={s.cover} style={coverPastelVar(creator.creatorId)} aria-hidden="true">
            <CreatorCoverArt imageUrl={null} lazy={false} />
          </div>
          <CreatorPhoto photoUrl={creator.photoUrl} tone={creator.faceTone} className={`face ${s.photo}`} />
          <div className={s.pfMain}>
            <div className={s.nameLine}>
              <h1 className={s.name} id="creator-name">
                {creator.name}
              </h1>
            </div>
            {creator.intro ? <p className={s.intro}>{creator.intro}</p> : null}
            <p className={s.verifying} role="status">
              <ClockIcon />
              채널 확인이 끝나면 선물을 보낼 수 있어요
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
