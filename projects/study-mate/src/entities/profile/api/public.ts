// 슬라이스 밖으로 나가는 시그니처 — 근거는 `entities/study/api/public.ts` 와 같다.

import { readProfile as readProfileImpl } from "./read-profile";
import type { ProfileCard } from "../model/profile";

export function readProfile(userId: string): Promise<ProfileCard | null> {
  return readProfileImpl(userId);
}
