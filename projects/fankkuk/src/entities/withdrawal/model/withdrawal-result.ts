import { z } from "zod";

// 탈퇴 처리(DB withdraw_account_core — 대표 입구·본인 입구 공통, my-account INV-A15·A17)가 돌려주는 값의 꼴과
// 그 뒤 저장소에서 사진을 지우는 일의 모양. 대표용 탈퇴·본인 탈퇴가 같이 쓴다.

export const withdrawalResultShape = z.object({
  pseudonym: z.string(),
  fan_photo_paths: z.array(z.string()),
  creator_photo_paths: z.array(z.string()),
});

/** 저장소에서 지울 사진 — 팬 사진과 크리에이터 사진은 저장소가 다르다. 실패하면 false(줄이 남아 매일 작업이 다시 지운다) */
export type RemoveWithdrawnPhotos = (paths: { fan: string[]; creator: string[] }) => Promise<boolean>;
