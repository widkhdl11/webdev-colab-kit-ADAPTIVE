import { revalidatePath } from "next/cache";
import { canonicalUuid } from "./uuid";

/**
 * 폼에서 온 id 로 그 화면의 캐시를 지운다. **한 자리에 모은 이유는 실패가 안 보이던 것이다.**
 *
 * 전에는 세 서버 액션이 `if (result.ok && isUuid(id)) revalidatePath(...)` 를 각각 적고
 * 있었다. `isUuid` 가 거짓이면 아무 일도 안 일어나는데 로그도 오류도 없어서, **쓰기는 됐고
 * 화면만 낡은** 상태가 조용히 만들어졌다. 그 조건이 실제로 갈리는 표기가 있다는 것도
 * 실측으로 확인했다(`uuid.ts` 의 표 — 데이터베이스는 하이픈 없는 32글자도 받는다).
 *
 * 그래서 여기서 둘을 한다: 데이터베이스와 같은 규칙으로 **정규 표기로 맞추고**, 그래도
 * uuid 가 아니면 **경고를 남긴다.** 값은 안 찍는다 — 사용자가 보낸 문자열이다.
 *
 * @returns 실제로 지웠으면 true. 부르는 쪽이 무시해도 되지만, 무시한다는 것이 보이게 둔다.
 */
export function revalidateEntityPath(prefix: string, id: unknown): boolean {
  const canonical = canonicalUuid(id);
  if (canonical === null) {
    console.warn(`캐시를 못 지웠다: ${prefix} 아래에 쓸 id 가 uuid 표기가 아니다`);
    return false;
  }
  revalidatePath(`${prefix}/${canonical}`);
  return true;
}
