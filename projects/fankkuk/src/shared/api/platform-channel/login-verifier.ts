import { allowsFakeChannels, type TestSiteEnv } from "@/shared/lib/env/test-site";

// 플랫폼 로그인 창구 (creator-verification INV-V14). 플랫폼 계정 로그인 연결(OAuth)은 외부 연결 때 붙인다 —
// 그때까지 로컬에서는 가짜 창구를 쓴다. 승인 서명의 가짜 서명 창구(approval-signer)와 같은 꼴이다.
// 창구는 서버에서만 쓴다. 고르는 곳은 이 함수 하나다 — 운영에서는 실제 창구가 붙기 전까지 창구가 없고, 로그인 확인은 거부된다.
// 운영에서 가짜를 켜는 길은 시험 사이트 판정(test-site INV-TS1) 하나뿐이다 — 따로 켜는 설정은 두지 않는다.

export type OwnedChannel = { platform: string; channelKey: string };

export type ChannelLoginVerifier = {
  kind: "fake";
  /**
   * 플랫폼에 로그인한 사람이 주인인 채널. 없으면 null.
   * 진짜 창구는 플랫폼에 직접 물어 얻은 채널을 돌려주고 requestedChannelKey 는 쓰지 않는다.
   * 가짜 창구는 「그 계정이 요청한 채널의 주인」이라고 답한다 — 로컬에서 흐름을 끝까지 돌리기 위한 것이다.
   */
  ownedChannel(input: { accountId: string; platform: string; requestedChannelKey: string }): Promise<OwnedChannel | null>;
};

const fakeVerifier: ChannelLoginVerifier = {
  kind: "fake",
  async ownedChannel({ platform, requestedChannelKey }) {
    return { platform, channelKey: requestedChannelKey };
  },
};

export function chooseChannelLoginVerifier(env: TestSiteEnv): ChannelLoginVerifier | null {
  if (!allowsFakeChannels(env)) return null; // 실제 플랫폼 로그인 연결이 생기면 여기서 그 창구를 돌려준다
  return fakeVerifier;
}
