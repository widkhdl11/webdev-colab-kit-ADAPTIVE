import { CreatorFace } from "./creator-face";

// 크리에이터 프로필 사진(creator-link INV-E9). 사진이 없으면 얼굴 자리표시.
// 사진은 서버가 512×512 정사각으로 만든 공개 저장소 파일이라 원형으로 자르기만 한다. 크기는 넘겨받은 className 이 정한다.
// 사진은 이름 옆에 함께 보이므로 alt 는 비운다(이름이 이미 읽힌다).
export function CreatorPhoto({ photoUrl, tone, className = "face" }: { photoUrl: string | null; tone: string; className?: string }) {
  if (!photoUrl) return <CreatorFace tone={tone} className={className} />;
  return <img className={className} src={photoUrl} alt="" width={512} height={512} />;
}
