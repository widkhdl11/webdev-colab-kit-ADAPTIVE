/**
 * 프로필 화면이 그리는 만큼의 한 사람.
 *
 * **이름이 「내 것」이 아닌 이유**: 이것을 읽는 함수는 누구의 프로필이든 읽을 수 있고
 * (볼 수 있는지는 접근 정책이 정한다, INV-Z13), 지금 부르는 자리가 내 id 를 넣을 뿐이다.
 * 타입이 「내 것」이라고 말하면 나중에 「내 것일 때만 맞는 필드」(편집 가능 여부 같은 것)를
 * 붙이는 사람이 잘못된 전제를 물려받는다.
 *
 * **`avatar_url` 은 없다.** 그 값을 채우는 길이 아직 없고(업로드는 `/profile/edit` 과 함께
 * 온다), 화면은 승인된 시각 기준의 아바타(괘선 채움 + 이니셜)를 쓴다. 안 쓰는 칸을 읽으면
 * 다음 사람은 그것이 그려진다고 믿는다.
 */
export type ProfileCard = {
  readonly id: string;
  readonly username: string;
  readonly bio: string | null;
  /** 고정 목록(`regions`)의 한 값. 비어 있으면 아직 안 정했다는 뜻이다 */
  readonly regionCode: string | null;
  /** 코드에 해당하는 지역이 목록에 없으면 null — 코드를 대신 그리지 않는다 */
  readonly regionName: string | null;
  readonly interestCategoryId: string | null;
  readonly interestCategoryName: string | null;
};
