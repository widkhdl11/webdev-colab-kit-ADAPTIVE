// 브라우저에서 팔로우를 저장한다(/api/follows). 화면 쪽 세 자리(팔로우 버튼·팔로우 목록의 「팔로우 끊기」·useFollowSave — 상세 화면 버튼 묶음과 FollowThenSend)가 같이 쓴다.
// login = 세션이 끝났다(로그인으로 보낸다) / failed = 그 밖의 실패(화면을 원래대로 돌린다).

export type SaveFollowOutcome = "ok" | "login" | "failed";

export async function saveFollow(
  creatorId: string,
  following: boolean,
): Promise<SaveFollowOutcome> {
  try {
    const res = await fetch("/api/follows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorId, following }),
    });
    if (res.ok) return "ok";
    return res.status === 401 ? "login" : "failed";
  } catch {
    return "failed";
  }
}
