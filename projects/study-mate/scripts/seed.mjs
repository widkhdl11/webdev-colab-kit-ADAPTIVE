// 데모 시드 — 화면을 실제로 보려면 데이터가 있어야 한다.
//
// `supabase/seed.sql` 이 아니라 스크립트인 이유: 프로필이 `auth.users` 를 참조하므로
// 사용자를 먼저 만들어야 하는데, 그건 SQL 로 넣는 것보다 Auth 관리 API 로 만드는 편이
// 안전하다(비밀번호 해시 방식이 Supabase 쪽 사정이라 바뀔 수 있다).
//
// 사용: npm run db:seed   (`with-local-supabase.mjs` 가 키를 넣어 준다)
//
// **여기 있는 사람·스터디는 전부 예시다.** 제품 원칙 5「정직한 데모」에 따라 실적 수치나
// 후기는 만들지 않는다 — 만드는 것은 화면을 채우는 데 필요한 최소한의 내용물뿐이다.

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";

if (!SECRET) {
  console.error("로컬 Supabase 키가 없다. `npm run db:seed` 로 돌려라.");
  process.exit(1);
}

const admin = createClient(API_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** 데모 계정. 비밀번호는 로컬 전용이고 화면에 안내로 띄우지 않는다. */
const PEOPLE = [
  { key: "jiwon", username: "지원", region: "seoul", interest: "it" },
  { key: "minseo", username: "민서", region: "busan", interest: "language" },
  { key: "hyun", username: "현우", region: "seoul", interest: "cert" },
  { key: "sora", username: "소라", region: "gyeonggi", interest: "business" },
  { key: "taemin", username: "태민", region: "daegu", interest: "design" },
  { key: "yuna", username: "유나", region: "seoul", interest: "growth" },
];

/** weekday: 0=일 … 6=토 */
const STUDIES = [
  {
    host: "jiwon",
    title: "리액트 사이드프로젝트 팀원 모집",
    summary: "포트폴리오에 넣을 웹 서비스 하나를 8주 안에 배포까지 함께 끝냅니다.",
    description:
      "기획부터 배포까지 한 바퀴를 8주에 돌립니다. 매주 화·목 저녁에 모여 진행 상황을 공유하고, 주말에는 각자 맡은 부분을 만듭니다. 프론트엔드 2명, 백엔드 2명을 찾습니다.",
    category: "it",
    region: "seoul",
    detail: "강남 역삼역 스터디카페",
    mode: "hybrid",
    capacity: 5,
    until: 12,
    starts: 16,
    weeks: 8,
    slots: [
      [2, "20:00", "22:00"],
      [4, "20:00", "22:00"],
    ],
    members: ["minseo", "hyun"],
    views: 84,
    likes: ["minseo", "hyun", "sora"],
  },
  {
    host: "hyun",
    title: "정처기 실기 2주 완성",
    summary: "기출 한 세트씩 풀고 틀린 문제만 모아 매일 밤 10시에 정리합니다.",
    description:
      "정보처리기사 실기 시험을 2주 앞두고 만드는 단기 스터디입니다. 매일 밤 기출 한 세트를 각자 풀고, 10시에 모여 틀린 문제만 빠르게 훑습니다.",
    category: "cert",
    region: "seoul",
    detail: null,
    mode: "online",
    capacity: 6,
    until: 6,
    starts: 8,
    weeks: 2,
    slots: [
      [1, "21:00", "22:30"],
      [2, "21:00", "22:30"],
      [3, "21:00", "22:30"],
      [4, "21:00", "22:30"],
      [5, "21:00", "22:30"],
    ],
    members: ["jiwon", "yuna", "taemin"],
    views: 142,
    likes: ["jiwon", "yuna"],
  },
  {
    host: "minseo",
    title: "토익 900 목표 새벽반",
    summary: "매일 아침 6시 30분, 파트별 실전 세트를 같이 풀고 점수를 기록합니다.",
    description:
      "새벽에 시작하는 토익 스터디입니다. 월·수·금 아침 6시 30분에 모여 파트별 실전 세트를 풀고 서로 점수를 기록합니다. 3개월 안에 900점을 목표로 합니다.",
    category: "language",
    region: "busan",
    detail: "서면 카페거리",
    mode: "offline",
    capacity: 6,
    until: 20,
    starts: 22,
    weeks: 12,
    slots: [
      [1, "06:30", "08:00"],
      [3, "06:30", "08:00"],
      [5, "06:30", "08:00"],
    ],
    members: ["sora", "yuna", "hyun", "taemin"],
    views: 210,
    likes: ["sora", "yuna", "hyun"],
  },
  {
    host: "sora",
    title: "재무제표 읽기 8주 완주",
    summary: "매주 토요일 오전, 실제 기업 보고서를 한 건씩 뜯어봅니다.",
    description:
      "회계를 처음 보는 사람도 따라올 수 있게 기초부터 시작합니다. 매주 실제 상장사 보고서를 한 건씩 골라 같이 읽습니다.",
    category: "business",
    region: "gyeonggi",
    detail: "판교역 인근",
    mode: "offline",
    capacity: 8,
    until: 30,
    starts: 33,
    weeks: 8,
    slots: [[6, "10:00", "12:00"]],
    members: ["jiwon"],
    views: 51,
    likes: ["jiwon"],
  },
  {
    host: "taemin",
    title: "포트폴리오 리디자인 스터디",
    summary: "각자의 포트폴리오를 6주간 뜯어고치고 매주 서로 피드백합니다.",
    description:
      "이미 만들어 둔 포트폴리오가 있는 사람을 찾습니다. 매주 한 명씩 발표하고 나머지가 피드백합니다.",
    category: "design",
    region: "daegu",
    detail: null,
    mode: "online",
    capacity: 4,
    until: 9,
    starts: 11,
    weeks: 6,
    slots: [[3, "20:00", "22:00"]],
    members: ["yuna", "minseo", "sora"],
    views: 96,
    likes: ["yuna", "minseo"],
  },
  {
    host: "yuna",
    title: "아침 30분 독서 모임",
    summary: "출근 전 30분, 같은 책을 읽고 한 문장씩 남깁니다.",
    description:
      "한 달에 한 권을 정해 평일 아침마다 30분씩 읽습니다. 읽은 뒤 한 문장씩 남기는 것이 전부입니다.",
    category: "growth",
    region: "seoul",
    detail: null,
    mode: "online",
    capacity: 10,
    until: 45,
    starts: 47,
    weeks: 4,
    slots: [
      [1, "07:30", "08:00"],
      [2, "07:30", "08:00"],
      [3, "07:30", "08:00"],
      [4, "07:30", "08:00"],
      [5, "07:30", "08:00"],
    ],
    members: ["hyun"],
    views: 33,
    likes: [],
  },
];

const iso = (daysFromNow) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

const ago = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

async function main() {
  // 1) 이미 있는 데모 데이터를 지운다. 사용자를 지우면 나머지가 cascade 로 따라간다.
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const demo = (existing?.users ?? []).filter((u) => u.email?.endsWith("@demo.study-mate.test"));
  for (const u of demo) await admin.auth.admin.deleteUser(u.id);
  if (demo.length > 0) console.log(`옛 데모 계정 ${demo.length}개를 지웠다`);

  // 2) 사람
  const ids = {};
  for (const p of PEOPLE) {
    const { data, error } = await admin.auth.admin.createUser({
      email: `${p.key}@demo.study-mate.test`,
      password: "studymate-demo-1234",
      email_confirm: true,
    });
    if (error) throw new Error(`계정 생성 실패(${p.key}): ${error.message}`);
    ids[p.key] = data.user.id;

    const { error: pErr } = await admin.from("profiles").insert({
      id: data.user.id,
      username: p.username,
      region: p.region,
      interest_category: p.interest,
      bio: null,
    });
    if (pErr) throw new Error(`프로필 생성 실패(${p.key}): ${pErr.message}`);
  }
  console.log(`사람 ${PEOPLE.length}명`);

  // 3) 스터디 · 일정 · 참여자 · 모집글 · 좋아요
  let posts = 0;
  for (const [i, s] of STUDIES.entries()) {
    const { data: study, error } = await admin
      .from("studies")
      .insert({
        host_id: ids[s.host],
        title: s.title,
        summary: s.summary,
        description: s.description,
        category_id: s.category,
        region_code: s.region,
        location_detail: s.detail,
        meeting_mode: s.mode,
        max_participants: s.capacity,
        recruit_until: iso(s.until),
        starts_on: iso(s.starts),
        ends_on: iso(s.starts + s.weeks * 7),
      })
      .select("id")
      .single();
    if (error) throw new Error(`스터디 생성 실패(${s.title}): ${error.message}`);

    await admin.from("study_sessions").insert(
      s.slots.map(([weekday, startsAt, endsAt]) => ({
        study_id: study.id,
        weekday,
        starts_at: startsAt,
        ends_at: endsAt,
      })),
    );

    for (const key of s.members) {
      await admin.from("participants").insert({ study_id: study.id, user_id: ids[key] });
      await admin
        .from("participants")
        .update({ status: "accepted" })
        .eq("study_id", study.id)
        .eq("user_id", ids[key]);
    }

    const { data: post } = await admin
      .from("posts")
      .insert({
        author_id: ids[s.host],
        study_id: study.id,
        title: s.title,
        summary: s.summary,
        content: s.description,
        views_count: s.views,
        created_at: ago(i + 1),
      })
      .select("id")
      .single();
    posts += 1;

    if (s.likes.length > 0) {
      await admin
        .from("likes")
        .insert(s.likes.map((key) => ({ post_id: post.id, user_id: ids[key] })));
    }
  }
  console.log(`스터디 ${STUDIES.length}개 · 모집글 ${posts}개`);

  // 4) created_at 은 기본값이 now() 라 관리 API 로는 못 바꾼다. 목록 정렬이 한 덩어리로
  //    보이지 않게 직접 뒤로 민다.
  const pg = new Client({ connectionString: DB_URL });
  await pg.connect();
  try {
    const { rows } = await pg.query(
      `select id from public.posts order by id`,
    );
    for (const [i, r] of rows.entries()) {
      await pg.query(`update public.posts set created_at = now() - ($1 || ' days')::interval where id = $2`, [
        String(i + 1),
        r.id,
      ]);
    }
  } finally {
    await pg.end();
  }

  console.log("시드 완료");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
