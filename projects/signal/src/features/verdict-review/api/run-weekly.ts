import { isoWeekKst, summarize } from "@/entities/verdict-review";
import { SAMPLE_WINDOW_MS, closeStatus, drawSample, excludeSampled, seededRandom, toCandidate, type Candidate } from "../lib/draw-sample";
import type { ReviewStore } from "./review-store";

/**
 * 판정 검토 주간 실행 (INV-VR1·VR2·VR5·VR8). 매일 수집 실행의 첫 바퀴가 부른다 — 할 일이 없는 날은
 * 조회 한 번으로 끝난다. 월요일 실행이 실패하면 화요일 실행이 다시 해 본다.
 *
 * **던지지 않는다.** 실패는 실행 기록에 남기고 결과로 돌려준다 — 판정 검토 때문에 수집이 실패로
 * 보이면 수집 쪽 경보가 엉뚱한 원인을 가리킨다(INV-VR8).
 */
export async function runWeeklyReview(params: {
  store: ReviewStore;
  now: Date;
  /** 시드. 테스트가 고정한다 */
  seed?: number;
}): Promise<{ ok: boolean; message: string }> {
  const { store, now } = params;
  const nowMs = now.getTime();
  const done: string[] = [];
  const failed: string[] = [];
  const current = isoWeekKst(nowMs);
  let weeks: Awaited<ReturnType<ReviewStore["listWeeks"]>> = [];
  try {
    weeks = await store.listWeeks();
  } catch (e) {
    return finish(store, done, [`주 목록: ${errText(e)}`]);
  }

  // 1. 닫힐 주를 닫는다 — 표지 먼저, 그다음 다시 읽어 집계(INV-VR5).
  //    닫기가 실패해도 2(이번 주 뽑기)는 한다 — 닫기가 며칠 실패하면 뽑기까지 며칠 막히게 된다.
  try {
    for (const w of weeks) {
      if (w.status !== null) continue;
      const items = await store.weekItems(w.week);
      if (closeStatus(w, items, nowMs, current) === null) continue;
      await store.markClosing(w.week);
      // 표지가 커밋된 뒤의 표본과 주 — 표지보다 먼저 끝난 답과 그 시각까지 들어 있다
      const fresh = await store.weekItems(w.week);
      const freshWeek = (await store.week(w.week)) ?? w;
      const status = fresh.length > 0 && fresh.every((i) => i.answer !== null) ? "reviewed" : "unreviewed";
      const s = summarize(fresh, { firstAnswerAt: freshWeek.firstAnswerAt, completedAt: freshWeek.completedAt });
      // 검토 안 한 주의 정확도는 값 없음 — 답한 것만으로 낸 숫자는 그 주의 정확도가 아니다(INV-VR6)
      await store.closeWeek(w.week, status, status === "reviewed" ? s : { ...s, accuracy: null }, now.toISOString());
      done.push(`닫음 ${w.week} ${status === "reviewed" ? "검토됨" : "검토 안 함"} ${s.answered}/${s.total}`);
    }
  } catch (e) {
    failed.push(`닫기: ${errText(e)}`);
  }

  // 2. 이번 주 표본이 없으면 뽑는다(INV-VR1·VR2)
  try {
    if (!weeks.some((w) => w.week === current)) {
      const rows = await store.candidateRows(new Date(nowMs - SAMPLE_WINDOW_MS).toISOString(), now.toISOString());
      // 같은 글이 두 번 오면 한 번만 — 수집이 동시에 새 판정을 쓰면 끊어 읽는 쪽에서 한 행이 두 번 올 수 있다
      const byId = new Map<string, Candidate>();
      for (const r of rows) {
        const c = toCandidate(r, nowMs);
        if (c !== null) byId.set(c.itemId, c);
      }
      const all = [...byId.values()];
      const candidates = excludeSampled(all, await store.sampledItemIds(all.map((c) => c.itemId)));
      const seed = params.seed ?? Math.floor(Math.random() * 2 ** 31);
      const { items, shortfall } = drawSample(candidates, seededRandom(seed));
      const created = await store.createWeek({
        week: current,
        extractedAt: now.toISOString(),
        seed,
        poolSize: candidates.length,
        shortfall,
        items,
      });
      done.push(created ? `뽑음 ${current} ${items.length}건(후보 ${candidates.length})` : `${current} 표본이 이미 있다`);
    }
  } catch (e) {
    failed.push(`뽑기: ${errText(e)}`);
  }

  return finish(store, done, failed);
}

const errText = (e: unknown) => String(e instanceof Error ? e.message : e);

/** 한 일과 실패를 한 줄로 기록한다. 기록할 자리도 없으면(테이블이 아직 없는 등) 결과로만 돌려준다. */
async function finish(store: ReviewStore, done: string[], failed: string[]): Promise<{ ok: boolean; message: string }> {
  const ok = failed.length === 0;
  const head = done.length > 0 ? done.join(" · ") : ok ? "할 일 없음" : "";
  const message = (ok ? head : `${head ? `${head} · ` : ""}실패: ${failed.join(" · ")}`).slice(0, 300);
  try {
    await store.logRun(ok, message);
  } catch {
    // 위 이유
  }
  return { ok, message };
}
