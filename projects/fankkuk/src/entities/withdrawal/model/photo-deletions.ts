// 탈퇴한 계정의 사진 지우기 (my-account INV-A15). 탈퇴 처리(DB)가 지울 사진을 「지울 사진」 표에 같은 처리로 넣어 두고,
// 서버는 저장소에서 지운 뒤에만 그 줄을 지운다 — 저장소 지우기가 실패하면 줄이 남아 매일 도는 작업이 다시 지운다.
// 대표용 탈퇴·본인 탈퇴(INV-A17)·매일 작업이 같이 쓴다.

export type PhotoBucket = "fan-photos" | "creator-photos";
export type PhotoBatch = { bucket: PhotoBucket; paths: string[] };

export type PhotoStore = {
  /** 저장소에서 지운다. 실패하면 false */
  remove(bucket: PhotoBucket, paths: string[]): Promise<boolean>;
  /** 「지울 사진」 표에서 그 줄을 지운다. 실패하면 false(다음 날 다시 지운다 — 이미 없는 파일 지우기는 성공으로 끝난다) */
  forget(bucket: PhotoBucket, paths: string[]): Promise<boolean>;
};

/** 묶음마다 저장소에서 지우고, 지운 묶음만 표에서 지운다. 모두 지웠으면 true */
export async function removeAndForget(store: PhotoStore, batches: PhotoBatch[]): Promise<boolean> {
  let allDone = true;
  for (const { bucket, paths } of batches) {
    if (paths.length === 0) continue;
    const removed = await store.remove(bucket, paths).catch(() => false);
    if (!removed) {
      allDone = false;
      continue;
    }
    if (!(await store.forget(bucket, paths).catch(() => false))) allDone = false;
  }
  return allDone;
}

/** 탈퇴 처리가 돌려준 경로(팬 사진·크리에이터 사진)를 저장소 묶음으로 */
export function batchesOf(paths: { fan: string[]; creator: string[] }): PhotoBatch[] {
  return [
    { bucket: "fan-photos", paths: paths.fan },
    { bucket: "creator-photos", paths: paths.creator },
  ];
}

/** 표에 남은 줄(저장소·경로)을 저장소 묶음으로 */
export function groupRows(rows: { bucket: string; path: string }[]): PhotoBatch[] {
  const byBucket = new Map<PhotoBucket, string[]>();
  for (const r of rows) {
    if (r.bucket !== "fan-photos" && r.bucket !== "creator-photos") continue;
    byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), r.path]);
  }
  return [...byBucket].map(([bucket, paths]) => ({ bucket, paths }));
}
