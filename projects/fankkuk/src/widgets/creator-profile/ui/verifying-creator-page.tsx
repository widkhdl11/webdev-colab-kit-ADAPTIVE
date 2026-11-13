import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { ProfileCover } from "./profile-cover";
import s from "./creator-profile.module.css";

// 「채널 확인 중」 크리에이터 페이지 (creator-verification INV-V22, 시안 channel-link-verify-20261102 #profile-verifying · design-rules 42절).
// 확인 대기 요청이 있는 확인 전 크리에이터의 팬꾹 링크로 오면 「없는 페이지」 대신 이 화면이다. 크리에이터 상세(시안 e판)의 머리 틀을 그대로 쓰고
// 공개 이름·프로필 사진·한 줄 소개만 그린다. 버튼 자리에 하늘 안내 상자 한 줄 — 선물 보내기·팔로우·채널 아이콘·평균 승인 시간은 없고,
// 선물함·상세 내용·추천 크리에이터도 없다(handle.md verifying). 배경은 사진 없는 기본 면(옅은 하늘 그라데이션).

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
    <main id="main" className={signedIn ? s.app : s.pub} data-wide-pub="">
      <ProfileCover imageUrl={null} />
      <div className={s.col}>
        <section className={`${s.head} ${s.headOnly}`} aria-labelledby="creator-name">
          <div className={s.id}>
            <CreatorPhoto photoUrl={creator.photoUrl} tone={creator.faceTone} className={`face ${s.photo}`} />
            <div className={s.idText}>
              <div className={s.nameLine}>
                <h1 className={s.name} id="creator-name">
                  {creator.name}
                </h1>
              </div>
              {creator.intro ? <p className={s.intro}>{creator.intro}</p> : null}
            </div>
          </div>
          <div className={s.actions}>
            <p className={s.verifying}>
              <ClockIcon />
              채널 확인이 끝나면 선물을 보낼 수 있어요
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
