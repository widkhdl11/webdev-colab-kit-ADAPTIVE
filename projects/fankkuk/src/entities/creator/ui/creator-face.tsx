import { FaceAvatar } from "@/shared/ui/face-avatar";

// 크리에이터 얼굴 자리표시. 프로필 사진이 붙으면 사진으로 바꾼다.
// tone 은 CSS 색 값(예시 데이터는 var(--face-N)). 크기는 전역 클래스 face(48) · face--lg(72) 또는 넘겨받은 className.
export function CreatorFace({ tone, className = "face" }: { tone: string; className?: string }) {
  return <FaceAvatar tone={tone} className={className} />;
}
