import { isProduction, type DeployEnv } from "@/shared/lib/env/is-production";

// 채널 소개란 읽기 창구 (creator-verification INV-V16). 플랫폼의 공식 API 연결은 외부 연결 때 붙인다 —
// 그때까지 로컬에서는 가짜 창구를 쓴다. 승인 서명의 가짜 서명 창구(approval-signer)와 같은 꼴이다.
// 창구는 서버에서만 쓴다. 고르는 곳은 이 함수 하나다 — 운영에서는 실제 창구가 붙기 전까지 창구가 없고, 자동 확인은 거부된다.
// 운영에서 가짜를 켜는 설정은 일부러 두지 않는다.

/**
 * 플랫폼 API 가 돌려주는 채널의 공개 정보. 본인 확인에 쓰는 것은 bio(채널 주인만 고칠 수 있는 소개란) 하나뿐이다 —
 * 링크·최근 글·댓글은 다른 사람이 쓸 수 있거나 확인 대상이 아니라서 읽지 않는다(INV-V16).
 */
export type ChannelProfile = { bio: string; links: readonly string[]; recentPosts: readonly string[] };

/** 가짜 창구에서 채널 키에 이 표시가 들어 있으면 코드 없는 소개란을 돌려준다 — 로컬 화면에서 「못 찾음」 길을 볼 수 있게. */
export const FAKE_NO_CODE_MARK = "nocode";

export type ChannelBioReader = {
  kind: "fake";
  /**
   * 그 채널의 공개 정보. 채널을 읽지 못하면 null.
   * codeForFake 는 가짜 창구만 쓴다(그 신청의 코드를 담은 소개란을 지어낸다). 진짜 창구는 이 값을 보지 않는다.
   */
  readProfile(input: { platform: string; channelKey: string; codeForFake: string }): Promise<ChannelProfile | null>;
};

const fakeReader: ChannelBioReader = {
  kind: "fake",
  async readProfile({ channelKey, codeForFake }) {
    const bio = channelKey.includes(FAKE_NO_CODE_MARK) ? "안녕하세요, 방송하는 크리에이터예요." : `안녕하세요, 방송하는 크리에이터예요.\n팬꾹 확인 ${codeForFake}`;
    return { bio, links: [], recentPosts: [] };
  },
};

export function chooseChannelBioReader(env: DeployEnv): ChannelBioReader | null {
  if (isProduction(env)) return null; // 실제 플랫폼 API 연결이 생기면 여기서 그 창구를 돌려준다
  return fakeReader;
}
