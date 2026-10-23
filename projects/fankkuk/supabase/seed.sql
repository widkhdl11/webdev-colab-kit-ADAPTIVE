-- 로컬 개발용 시험 데이터 (결정 카드 d9: 시험 계정 + 간단 로그인).
-- `supabase db reset` 이 마이그레이션 뒤에 이 파일을 넣는다. 호스팅 DB 에는 넣지 않는다.
-- 닉네임·채널·주문은 화면 예시 데이터(src/entities/*/api/sample-*.ts)를 옮긴 지어낸 값이다.
--
-- 로그인할 수 있는 시험 계정 (비밀번호는 모두 fankkuk-local-1234 — 로컬 전용):
--   byeolbit_fan  팬 「별빛」     선물 다섯 건
--   daltokki_fan  팬 「달토끼」   하루에게 보낸 선물 한 건 — 다른 팬 선물이 안 보이는지 볼 때
--   haru_creator  크리에이터 「하루」  승인 요청을 받는다
--   momo_creator  크리에이터 「모모」  하루의 요청이 안 보이는지 볼 때
--   fankkuk_admin 운영자 · 대표(요금 수정·환불)
--   fankkuk_staff 운영자 · 직원(대표만 하는 일은 거부된다)

-- 승인 기록(approved_at)은 approve_request 로만 바뀐다(INV-S7). 시험 데이터를 넣는 동안만 그 막음을 끈다.
select set_config('fankkuk.approving', 'on', false);

-- ── 계정 ────────────────────────────────────────────────

create temporary table seed_accounts (id uuid, login_id text, nickname text, role public.user_role);
insert into seed_accounts values
  ('00000000-0000-4000-a000-000000000001', 'byeolbit_fan', '별빛', 'fan'),
  ('00000000-0000-4000-a000-000000000002', 'daltokki_fan', '달토끼', 'fan'),
  ('00000000-0000-4000-a000-000000000003', 'gureumppang_fan', '구름빵', 'fan'),
  ('00000000-0000-4000-a000-000000000004', 'somsatang_fan', '솜사탕', 'fan'),
  ('00000000-0000-4000-a000-000000000005', 'haneul_fan', '하늘', 'fan'),
  ('00000000-0000-4000-a000-000000000011', 'haru_creator', '하루', 'creator'),
  ('00000000-0000-4000-a000-000000000012', 'momo_creator', '모모', 'creator'),
  ('00000000-0000-4000-a000-000000000021', 'fankkuk_admin', '팬꾹 운영', 'operator'),
  ('00000000-0000-4000-a000-000000000022', 'fankkuk_staff', '팬꾹 직원', 'operator');

-- 아이디 로그인은 Supabase Auth 의 이메일 로그인 위에 얹는다: 아이디 → <아이디>@fankkuk.test
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', a.id, 'authenticated', 'authenticated',
       a.login_id || '@fankkuk.test', extensions.crypt('fankkuk-local-1234', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from seed_accounts a;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select a.id::text, a.id,
       jsonb_build_object('sub', a.id::text, 'email', a.login_id || '@fankkuk.test', 'email_verified', true),
       'email', now(), now(), now()
from seed_accounts a;

insert into public.profiles (id, login_id, nickname, role)
select id, login_id, nickname, role from seed_accounts;

-- 대표 운영자(admin-console INV-K2). 운영 DB 에서는 사람이 직접 넣는다.
insert into public.owner_setting (owner_user_id) values ('00000000-0000-4000-a000-000000000021');

-- ── 크리에이터 ───────────────────────────────────────────

-- 확인된 크리에이터는 승인 함수로만 생긴다(creator-verification INV-V6). 시험 데이터를 넣는 동안만 그 막음을 끈다.
select set_config('fankkuk.verifying', 'on', false);

insert into public.creators (id, profile_id, slug, name, channel, channel_title, intro, alias, avg_approval_hours, face_tone, identity_verified)
values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000011', 'haru', '하루', '치지직', '하루의 놀이터', '게임 방송을 해요.', 'haru', 2, 'var(--face-6)', true),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000012', 'momo', '모모', '유튜브', '모모네 거실', '노래 방송을 해요.', 'momo', 4, 'var(--face-3)', true),
  ('00000000-0000-4000-b000-000000000003', null, 'saebyeokdal', '새벽달', 'SOOP', '새벽달 라디오', '새벽에 이야기를 나눠요.', 'saebyeokdal', 1, 'var(--face-5)', true),
  ('00000000-0000-4000-b000-000000000004', null, 'byeol', '별이', '유튜브', '별이의 작업실', '그림 그리는 방송을 해요.', 'byeol', 3, 'var(--face-1)', true),
  ('00000000-0000-4000-b000-000000000005', null, 'somsatang', '솜사탕', '치지직', '솜사탕 식탁', '맛있는 걸 같이 먹어요.', 'somsatang', 6, 'var(--face-4)', true),
  ('00000000-0000-4000-b000-000000000006', null, 'dodam', '도담', '유튜브', '도담 홈트', '집에서 같이 운동해요.', 'dodam', 2, 'var(--face-2)', true),
  ('00000000-0000-4000-b000-000000000007', null, 'bori', '보리', 'SOOP', '보리의 지구본', '여행 이야기를 들려 드려요.', 'bori', 5, 'var(--face-1)', true),
  ('00000000-0000-4000-b000-000000000008', null, 'raon', '라온', '치지직', '라온 아케이드', '옛날 게임을 해요.', 'raon', 3, 'var(--face-2)', true),
  ('00000000-0000-4000-b000-000000000009', null, 'namu', '나무', '유튜브', '나무 스터디룸', '같이 공부해요.', 'namu', 1, 'var(--face-3)', true),
  ('00000000-0000-4000-b000-000000000010', null, 'siwol', '시월', 'SOOP', '시월 라이브', '직접 연주해요.', 'siwol', 8, 'var(--face-4)', true),
  ('00000000-0000-4000-b000-000000000011', null, 'gureum', '구름', '유튜브', '구름 브이로그', '하루하루를 기록해요.', 'gureum', 4, 'var(--face-5)', true),
  ('00000000-0000-4000-b000-000000000012', null, 'haedeun', '해든', '치지직', '해든 부엌', '집밥을 만들어요.', 'haedeun', 2, 'var(--face-6)', true);

-- 크리에이터 태그(creator-tags) — 각자 방송 플랫폼 + 몇 명은 다른 곳·버추얼. 틱톡은 아무도 고르지 않았다(찾기 칩에 안 나오는지 볼 때, S4b).
insert into public.creator_tags (creator_id, option_id)
select c.id, o.id
from (values
  ('haru', '치지직'), ('haru', '버추얼'),
  ('momo', '유튜브'), ('momo', '인스타그램'),
  ('saebyeokdal', 'SOOP'),
  ('byeol', '유튜브'), ('byeol', '버추얼'),
  ('somsatang', '치지직'), ('somsatang', 'X'),
  ('dodam', '유튜브'), ('dodam', '인스타그램'),
  ('bori', 'SOOP'), ('bori', '유튜브'),
  ('raon', '치지직'),
  ('namu', '유튜브'),
  ('siwol', 'SOOP'), ('siwol', '알플레이'),
  ('gureum', '유튜브'), ('gureum', '인스타그램'), ('gureum', '스레드'),
  ('haedeun', '치지직'), ('haedeun', '스레드')
) v(slug, tag)
join public.creators c on c.slug = v.slug
join public.creator_tag_options o on o.name = v.tag;

-- 확인된 크리에이터의 예시 채널 주소와 채널 점유(creator-verification INV-V8 — 점유 표의 「채널 키마다 한 줄」이 이들도 검사한다).
-- 유튜브·SOOP 은 slug 를 핸들·아이디로, 치지직은 slug 로 만든 32자리 16진수를 채널 ID 로 쓴다(지어낸 값).
update public.creators c
set platform = v.platform, channel_key = v.channel_key, channel_url = public.cv_channel_url(v.platform, v.channel_key)
from (
  select x.id, p.platform, case p.platform when 'chzzk' then md5('fankkuk-seed:' || x.slug) else x.slug end as channel_key
  from public.creators x
  cross join lateral (select case x.channel when '유튜브' then 'youtube' when '치지직' then 'chzzk' when 'SOOP' then 'soop' end as platform) p
  where x.identity_verified and x.platform is null
) v
where c.id = v.id;
insert into public.creator_channel_claims (platform, channel_key, kind, account_id, creator_id)
select c.platform, c.channel_key, 'verified', c.profile_id, c.id from public.creators c where c.identity_verified and c.platform is not null
on conflict do nothing;
select set_config('fankkuk.verifying', '', false);

-- 별빛이 팔로우한 크리에이터 여섯
insert into public.follows (fan_id, creator_id)
select '00000000-0000-4000-a000-000000000001', c.id from public.creators c
where c.slug in ('haru', 'momo', 'saebyeokdal', 'byeol', 'somsatang', 'dodam');

-- ── 주문 ────────────────────────────────────────────────
-- 결제가 끝난 주문만 있다. 상자는 모두 소형 신고, 결제는 소형 요금(6,900 = 기본 서비스료 1,400 + 검수비 1,500 + 배송비 칸 4,000).

create temporary table seed_orders (
  order_no text, fan_login text, creator_slug text, item_kind text, box_count int, em boolean,
  status public.order_status, registered_at timestamptz, approved_at timestamptz, received_at timestamptz,
  inspection_result text, inspected_at timestamptz, shipped_at timestamptz, expected_arrival_date date,
  delivery text, outbound_waybill_no text, fan_tracking_no text, request_status public.approval_request_status
);

insert into seed_orders values
  -- 별빛의 선물
  ('FC-7K3M9', 'byeolbit_fan', 'haru', '손뜨개 인형과 편지', 1, false, 'shipped', '2026-10-01T01:10:00Z', '2026-10-01T02:40:00Z', '2026-10-02T00:30:00Z', 'passed', '2026-10-02T01:20:00Z', '2026-10-02T06:00:00Z', '2026-10-04', 'in_transit', '612345678901', '584012376655', 'approved'),
  ('FC-R2D8Q', 'byeolbit_fan', 'momo', '생일 케이크 모양 쿠션', 1, false, 'registered', '2026-10-02T09:00:00Z', '2026-10-03T03:15:00Z', null, null, null, null, null, null, null, null, 'approved'),
  ('FC-P4X7N', 'byeolbit_fan', 'haru', '응원 슬로건', 1, false, 'registered', '2026-10-03T11:30:00Z', null, null, null, null, null, null, null, null, null, 'waiting'),
  ('FC-W5N3T', 'byeolbit_fan', 'momo', '손편지와 머리끈', 1, false, 'inspected', '2026-10-02T02:00:00Z', null, '2026-10-03T01:10:00Z', 'passed', '2026-10-03T02:00:00Z', null, null, null, null, '584012379911', 'waiting'),
  ('FC-H8J2W', 'byeolbit_fan', 'saebyeokdal', '향초', 1, false, 'rejected', '2026-09-28T05:00:00Z', null, null, null, null, null, null, null, null, null, 'declined'),
  -- 하루에게 온 다른 팬의 승인 요청
  ('FC-L5T6B', 'daltokki_fan', 'haru', '게임 패드와 간식', 2, true, 'received', '2026-10-02T13:00:00Z', null, '2026-10-03T00:40:00Z', null, null, null, null, null, null, '441209875533', 'waiting'),
  ('FC-Z9C3V', 'gureumppang_fan', 'haru', '꽃다발 모양 비누', 1, false, 'registered', '2026-10-03T14:20:00Z', null, null, null, null, null, null, null, null, null, 'waiting'),
  -- 평균 승인 시간 계산용 지난 기록
  ('FC-A1B2C', 'somsatang_fan', 'haru', '엽서', 1, false, 'shipped', '2026-09-25T02:00:00Z', '2026-09-25T04:30:00Z', '2026-09-26T01:00:00Z', 'passed', '2026-09-26T02:00:00Z', '2026-09-26T06:00:00Z', '2026-09-28', 'delivered', '612345678000', null, 'approved'),
  ('FC-M3N4P', 'haneul_fan', 'momo', '머그컵', 1, false, 'shipped', '2026-09-24T08:00:00Z', '2026-09-25T10:00:00Z', '2026-09-26T01:00:00Z', 'passed', '2026-09-26T02:00:00Z', '2026-09-26T06:00:00Z', '2026-09-28', 'delivered', '612345678111', null, 'approved');

insert into public.orders (
  order_no, fan_id, creator_id, item_kind, has_electronics_or_metal, status, created_at, registered_at, approved_at,
  received_at, inspection_result, inspected_at, shipped_at, expected_arrival_date, delivery, outbound_waybill_no, fan_tracking_no
)
select s.order_no, p.id, c.id, s.item_kind, s.em, s.status, s.registered_at, s.registered_at, s.approved_at,
       s.received_at, s.inspection_result, s.inspected_at, s.shipped_at, s.expected_arrival_date, s.delivery,
       s.outbound_waybill_no, s.fan_tracking_no
from seed_orders s
join public.profiles p on p.login_id = s.fan_login
join public.creators c on c.slug = s.creator_slug;

insert into public.boxes (order_id, seq, declared_tier, measured_tier)
select o.id, g.seq::smallint, 'small', case when o.received_at is not null then 'small'::public.parcel_tier end
from seed_orders s
join public.orders o on o.order_no = s.order_no
cross join lateral generate_series(1, s.box_count) as g(seq);

insert into public.payments (order_id, kind, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, status, payment_key, created_at, settled_at)
select o.id, 'initial', 'pay_seed_' || replace(lower(s.order_no), '-', ''),
       6900 * s.box_count, 0, 1400 * s.box_count, 1500 * s.box_count, 4000 * s.box_count,
       'done', 'seed_payment_key_' || replace(lower(s.order_no), '-', ''), s.registered_at, s.registered_at
from seed_orders s
join public.orders o on o.order_no = s.order_no;

-- 승인 요청 — 서명 원문은 앱의 buildSigningPayload 와 같은 꼴(요청 ID·주문번호·요청 시각·팬 닉네임 해시)
insert into public.approval_requests (request_id, order_id, payload, created_at, status, decided_at)
select 'apr_' || replace(s.order_no, '-', ''), o.id,
       'fankkuk-approval:v1|req=apr_' || replace(s.order_no, '-', '')
         || '|order=' || s.order_no
         || '|at=' || to_char(s.registered_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         || '|fan=' || encode(extensions.digest(p.nickname, 'sha256'), 'hex'),
       s.registered_at, s.request_status,
       case s.request_status
         when 'waiting' then null
         when 'approved' then s.approved_at
         else s.registered_at + interval '1 day'
       end
from seed_orders s
join public.orders o on o.order_no = s.order_no
join public.profiles p on p.login_id = s.fan_login;

-- ── 공지 ────────────────────────────────────────────────

insert into public.notices (slug, title, published_at, pinned, body) values
  ('n-open', '팬꾹 서비스 시작 안내', '2026-10-01T00:00:00+09:00', true, '[
    {"type":"heading","text":"안녕하세요, 팬꾹이에요"},
    {"type":"text","parts":["팬이 보낸 선물을 크리에이터가 안전하게 받을 수 있도록, 팬꾹이 문을 열어요."]},
    {"type":"text","parts":["크리에이터가 승인한 선물만 배송합니다. 승인 전까지 주소는 노출되지 않습니다. 사무실에 도착한 상자는 송장을 떼고 겉면과 보낼 수 없는 물품이 있는지 확인해요. 팬이 보낸 상자는 크기·무게를 재고 추적 장치도 검사하며, 탐지기 반응이 있으면 열어서 확인해요."]},
    {"type":"text","parts":["서비스 이용 중 궁금한 점은 ",{"label":"고객센터","href":"/support"},"에서 확인해 주세요. 많이 사랑해 주세요."]},
    {"type":"signature","text":"팬꾹 운영팀"}]'),
  ('n-size', '선물 보내기 전에 크기·무게 기준을 확인해 주세요', '2026-10-01T00:00:00+09:00', true, '[
    {"type":"text","parts":["소형(세 변 합 100cm · 5kg 이하), 중형(세 변 합 100cm · 10kg 이하), 대형(세 변 합 160cm · 20kg 이하)까지 받아요. 크기와 무게 중 큰 쪽 기준으로 정해지고, 대형을 넘는 상자는 받지 않아요."]},
    {"type":"text","parts":["사무실에 도착해 실측한 크기가 등록하신 것보다 크면 차액을 따로 결제하셔야 해요."]}]'),
  ('n-price', '요금 안내: 상자마다 택배비가 포함돼 있어요', '2026-09-30T00:00:00+09:00', false, '[
    {"type":"list","items":["소형 6,900원 — 세 변 합 100cm · 5kg 이하","중형 8,900원 — 세 변 합 100cm · 10kg 이하","대형 10,900원 — 세 변 합 160cm · 20kg 이하","팬 선물 요금에는 추적 장치 검사가 포함돼 있어요."]}]'),
  ('n-holiday', '개천절·한글날 배송 일정 안내', '2026-09-29T00:00:00+09:00', false, '[
    {"type":"text","parts":["10월 3일 개천절과 9일 한글날에는 사무실 입고와 출고가 쉬어요. 쉬는 날 전에 도착하게 하려면 여유를 두고 보내 주세요."]},
    {"type":"text","parts":["휴무 기간: (출시 전 기재)"]}]'),
  ('n-channel', '크리에이터 채널 소유 확인 방법 안내', '2026-09-28T00:00:00+09:00', false, '[
    {"type":"text","parts":["크리에이터로 가입하신 뒤에는 활동 채널의 채널 소유 확인을 해 주세요. 유튜브·치지직은 그 계정으로 로그인하면 바로 확인돼요. 인증 코드로 확인할 때는 코드를 채널 소개란에 잠깐 붙여 주세요. 확인이 끝나면 「크리에이터 찾기」에 나타나고, 팬이 선물을 보낼 수 있어요."]}]'),
  ('n-inspect', '검수는 이렇게 진행돼요: 탐지기 반응이 있으면 개봉 검수합니다', '2026-09-26T00:00:00+09:00', false, '[
    {"type":"text","parts":["사무실에 도착한 모든 상자는 송장을 떼고 겉면과 보낼 수 없는 물품이 있는지 확인해요. 팬이 보낸 상자는 크기·무게를 재고 추적 장치도 검사하며, 탐지기 반응이 있으면 열어서 확인해요. 역조공 상자는 추적 장치 검사를 하지 않아요."]}]'),
  ('n-kakao', '카카오톡 인증 점검 안내', '2026-09-24T00:00:00+09:00', false, '[
    {"type":"text","parts":["점검 시간에는 가입과 선물 승인이 잠시 어려울 수 있어요. 점검이 끝나면 바로 이용하실 수 있어요."]},
    {"type":"text","parts":["점검 일시: (출시 전 기재)"]}]'),
  ('n-privacy', '개인정보 보관 방식 안내', '2026-09-22T00:00:00+09:00', false, '[
    {"type":"text","parts":["휴대폰 번호는 카카오톡 알림을 보내는 데 쓰고, 실명·주소와 따로 나눠 보관해요. 자세한 내용은 개인정보처리방침에서 확인하실 수 있어요."]}]'),
  ('n-early-fan', '서비스 시작 알림 신청 안내', '2026-09-18T00:00:00+09:00', false, '[
    {"type":"text","parts":["서비스가 열리면 알림톡으로 알려 드려요. 알림 신청은 회원가입 화면에서 할 수 있어요."]}]'),
  ('n-early-creator', '크리에이터 먼저 가입 안내', '2026-09-15T00:00:00+09:00', false, '[
    {"type":"text","parts":["서비스 시작 전에 크리에이터로 먼저 가입해 두시면, 문을 여는 날부터 선물 요청을 받을 수 있어요."]}]'),
  ('n-hello', '팬꾹을 소개합니다', '2026-09-12T00:00:00+09:00', false, '[
    {"type":"text","parts":["팬꾹은 팬이 보내는 선물을 사무실에서 받아 검수하고, 크리에이터가 승인한 선물만 대신 보내 드리는 서비스예요."]},
    {"type":"text","parts":["자세한 이야기는 ",{"label":"팬꾹 소개","href":"/about"},"에서 읽어 보실 수 있어요."]}]');

drop table seed_orders;
drop table seed_accounts;
select set_config('fankkuk.approving', '', false);

-- 가짜 서명 허용 (approval-signature INV-S11, 마이그레이션 20261005000016). 이 파일은 로컬 db reset 에서만 돈다 —
-- 운영 DB 에는 이 줄이 없어 가짜 서명 승인이 거부된다.
insert into public.local_dev_flags (flag) values ('allow_fake_signatures') on conflict do nothing;

-- 가짜 발송 허용 (notifications INV-N11, 마이그레이션 20261006000009). 로컬에서 알림을 가짜 창구로 「보냄」 표시할 때만 쓴다 —
-- 운영 DB 에는 이 줄이 없어 가짜 표시가 거부된다.
insert into public.local_dev_flags (flag) values ('allow_fake_notifications') on conflict do nothing;

-- 예약 작업 끄기 (office-workflow INV-W11 · notifications INV-N16, 마이그레이션 20261008000012). 로컬에서는 5분마다 도는 자동 처리가
-- 시드 주문(시험이 기대는 미승인 주문)을 7일 뒤 반려하고, 통합 시험 도중에 끼어든다. 운영 DB 는 시드를 돌리지 않아 켜진 채로 남는다.
-- 시험은 작업 명령을 직접 돌려 확인한다(tests/integration/schedule-db).
select cron.alter_job(j.jobid, active := false) from cron.job j where j.jobname in ('fankkuk-expiry', 'fankkuk-notify');
