/**
 * 프로필 화면이 그리는 만큼의 한 사람.
 *
 * **이름이 「내 것」이 아닌 이유**: 이것을 읽는 함수는 누구의 프로필이든 읽을 수 있고
 * (볼 수 있는지는 접근 정책이 정한다, INV-Z13), 지금 부르는 자리가 내 id 를 넣을 뿐이다.
 * 타입이 「내 것」이라고 말하면 나중에 「내 것일 때만 맞는 필드」(편집 가능 여부 같은 것)를
 * 붙이는 사람이 잘못된 전제를 물려받는다.
 *
 * **사진은 주소로 온다.** 데이터베이스에 담긴 것은 버킷 안의 경로이고(`<id>/avatar.png`),
 * 주소는 읽는 쪽이 만든다 — 전체 주소를 담으면 프로젝트 주소가 데이터에 박혀 다른 환경에서
 * 깨진 그림이 된다. 아직 안 올린 사람은 null 이고, 그때 화면은 승인된 아바타(괘선 채움 +
 * 이니셜)를 그린다.
 */
export type ProfileCard = {
  readonly id: string;
  readonly username: string;
  readonly bio: string | null;
  /** 고정 목록(`regions`)의 한 값. 비어 있으면 아직 안 정했다는 뜻이다 */
  readonly regionCode: string | null;
  /** 코드에 해당하는 지역이 목록에 없으면 null — 코드를 대신 그리지 않는다 */
  readonly regionName: string | null;
  /** 공개 버킷의 전체 주소. 아직 안 올렸으면 null */
  readonly avatarUrl: string | null;
  readonly interestCategoryId: string | null;
  readonly interestCategoryName: string | null;
};
