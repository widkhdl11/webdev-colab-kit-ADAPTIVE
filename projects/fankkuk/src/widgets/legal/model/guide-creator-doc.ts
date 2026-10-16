import { HANDLE_LOCK_DAYS, HANDLE_MAX, HANDLE_MIN, HANDLE_RETIRE_DAYS } from "@/entities/creator/model/creator-handle";
import { VERIFICATION_CODE_DAYS, VERIFICATION_TRIES } from "@/entities/creator/model/creator-verification";
import { ANNIVERSARY_MARK_DAYS, DDAY_WINDOW_DAYS, MONTHLY_LIMIT_MAX } from "@/entities/creator/model/receiving";
import { REPLY_LINE_MAX, REPLY_PHRASE_TEXT, REPLY_PHRASES } from "@/entities/gift-reply/model/reply";
import { HARD_ACTION_LABEL, HARD_PERIOD_LABEL, HARD_PERIODS, HARD_REASON_LABEL, HARD_REASONS } from "@/entities/gift-item/model/hard-items";
import { MAX_DECRYPTS_PER_BOX } from "@/entities/address/model/access-log";
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import { CREATOR_CHECK_DAYS } from "@/entities/parcel/model/creator-check";
import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { PRICED_TIERS, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { MAX_REVGIFT_SHARES } from "@/features/revgift-send/model/register-revgift";
import { NO_ADDRESS_ASK, OPERATOR_NAME, PROMISE } from "@/shared/config/site-copy";
import { type LegalDoc } from "./legal-doc";

// 크리에이터 이용 안내(/guide/creator). 사실의 근거: terms-doc·privacy-doc(검토된 문장) · 화면 글자(creator-settings·creator-account·
// creator-customize·approval-window·creator-action-center·access-log·revgift-send·revgift-sent·gift-reply) ·
// specs(creator-verification·approval-signature·creator-receiving·hard-items·gift-reply·creator-link·reverse-gift·decline-block).
// 넣지 않은 것(지금 결정): 예비 승인 수단·답장 스탬프·역조공 합포장(카드 d58)·광고 표시 안내.

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const quoteList = (xs: readonly string[]) => xs.map((x) => `「${x}」`).join(" · ");

export function guideCreatorDoc(prices: PublicPriceTable): LegalDoc {
  return {
    title: "크리에이터 이용 안내",
    lead: "크리에이터로 가입한 뒤 선물을 받고, 답장하고, 팬에게 역조공을 보내기까지의 순서를 화면 이름 그대로 적었어요.",
    summary: [
      "가입한 뒤 채널 소유 확인을 마쳐야 크리에이터 찾기에 나오고 선물을 받을 수 있어요.",
      `선물은 한 건씩 카카오톡 인증서로 서명해서 승인해요. ${PROMISE.approval}`,
      PROMISE.address,
    ],
    facts: [["운영", OPERATOR_NAME]],
    sections: [
      {
        id: "signup",
        title: "가입하기",
        blocks: [
          {
            kind: "steps",
            items: [
              "회원가입 첫 단계 「유형 선택」에서 「크리에이터예요」를 골라요.",
              "「정보 입력」에서 아이디·이메일·비밀번호·휴대폰 번호와 공개 이름·채널 이름을 적어요. 팬덤 이름은 넣지 않아도 돼요.",
              "「본인 확인」에서 카카오톡으로 휴대폰 번호의 주인이 맞는지 확인하면 가입이 끝나요.",
              "가입만으로는 크리에이터 찾기에 나오지 않아요. 아래 채널 소유 확인을 마쳐야 나와요.",
            ],
          },
        ],
      },
      {
        id: "channel-check",
        title: "채널 소유 확인",
        blocks: [
          { kind: "text", text: "활동 채널의 주인이 맞는지 확인하는 단계예요. 확인되면 크리에이터 찾기에 나오고 팬의 선물을 받을 수 있어요." },
          {
            kind: "steps",
            items: [
              "아래 이름 메뉴의 「계정 설정」을 열고, 보안 구간의 채널 칸에서 「확인하기」를 눌러요.",
              "「채널 주소」에 내 채널의 주소를 붙여 넣어요.",
              "채널에 따라 로그인으로 확인하는 버튼이 보여요. 그 버튼을 눌러 채널 계정으로 로그인하면 바로 확인돼요.",
              "로그인이 어렵다면 「코드로 확인하기」를 눌러 인증 코드를 받아요. 「코드 복사」로 복사해 채널 소개란에 잠깐 붙인 뒤 「확인」을 눌러요.",
              "확인됐다는 문구가 보이면 소개란의 인증 코드는 지워도 돼요.",
            ],
          },
          { kind: "text", text: "로그인 확인이 없는 채널이거나 자동으로 확인되지 않을 때는 운영자가 확인해요." },
          {
            kind: "steps",
            items: [
              "「코드 받기」를 눌러 인증 코드를 받아요.",
              "인증 코드를 채널 소개란에 붙이거나 팬꾹 계정에 DM 으로 보내요.",
              "「확인 요청」(또는 「운영자에게 확인 요청」)을 눌러요. 운영자가 채널을 열어 인증 코드를 확인하고, 결과는 같은 칸에 보여요.",
              "운영자가 확인하면 소개란의 인증 코드는 지워도 돼요.",
            ],
          },
          {
            kind: "list",
            items: [
              `인증 코드를 받은 날부터 ${VERIFICATION_CODE_DAYS}일 안에 확인을 마치거나 「확인 요청」을 눌러야 해요. 운영자 확인에는 기한이 없어요.`,
              `한 채널로 인증 코드를 받을 수 있는 횟수는 ${VERIFICATION_TRIES}번이에요. 다 쓰면 1:1 문의로 알려 주세요.`,
              "하나의 채널은 하나의 계정으로만 확인돼요. 이미 다른 계정으로 확인된 채널이면 1:1 문의로 알려 주세요.",
            ],
          },
        ],
      },
      {
        id: "page-link",
        title: "크리에이터 페이지와 링크 주소",
        blocks: [
          { kind: "text", text: "크리에이터 페이지는 팬이 선물을 보내러 오는 내 페이지예요. 링크 주소를 정하면 방송이나 SNS 에 붙일 수 있어요." },
          {
            kind: "steps",
            items: [
              "사이드바 「내 팬꾹」의 「프로필 수정」에서 프로필 사진·배경 사진·공개 이름·한 줄 소개를 정해요.",
              "사이드바 「내 팬꾹」의 「상세 설정」을 열고, 「선물 링크」 칸을 펼쳐요.",
              `「링크 주소」에 영문·숫자·밑줄(_)로 ${HANDLE_MIN}~${HANDLE_MAX}자를 적어요. 로그인 아이디와 다른 값으로 정해 주세요.`,
              "「링크 주소 정하기」를 누르고, 철자를 다시 확인한 뒤 「정하기」를 눌러요.",
              "「복사」를 눌러 링크 주소를 복사하고 방송이나 SNS 에 붙여요.",
            ],
          },
          {
            kind: "list",
            items: [
              "링크 주소는 채널 소유 확인을 마쳐야 열려요.",
              `링크 주소를 정하거나 바꾸면 ${HANDLE_LOCK_DAYS}일 동안 다시 바꿀 수 없어요.`,
              `링크 주소를 바꾸면 예전 주소로 들어온 팬은 ${HANDLE_RETIRE_DAYS}일 동안 새 주소로 넘어가요.`,
            ],
          },
        ],
      },
      {
        id: "customize",
        title: "내 팬꾹 꾸미기와 공지 이미지",
        blocks: [
          { kind: "text", text: "사이드바 「내 팬꾹」의 「꾸미기」를 누르면 「내 팬꾹 꾸미기」 화면이 열려요. 바꾸는 즉시 미리보기에서 확인할 수 있어요." },
          {
            kind: "steps",
            items: [
              "「링크 미리보기 이미지」에서 메신저나 SNS 에 링크를 붙였을 때 보일 그림을 골라요. 프로필 사진과 팬덤 심볼 가운데 하나를 쓸 수 있어요.",
              "「공지 이미지 받기」에서 크기를 골라요. 정사각·세로(스토리용)·가로가 있어요.",
              "「내려받기」로 이미지를 저장하거나 「링크 복사」로 이미지 링크를 복사해요.",
              "내 채널에 공지 이미지를 올려 링크 주소를 알려요. 이미지에는 프로필 배경 사진·사진·이름·소개와 「팬꾹으로 선물 보내기」, 링크 주소가 들어가요.",
              "스토리에 올릴 때는 이미지 속 주소를 누를 수 없으니 링크 스티커를 따로 붙여 주세요.",
            ],
          },
          { kind: "text", text: "공지 이미지는 채널 소유 확인을 마치고 링크 주소를 정한 뒤에 받을 수 있어요." },
        ],
      },
      {
        id: "address",
        title: "받을 주소",
        blocks: [
          {
            kind: "steps",
            items: [
              "「상세 설정」의 「주소와 설정」에서 「받는 주소」 칸을 펼쳐요.",
              "「주소 등록하기」(이미 등록했다면 「주소 바꾸기」)를 눌러요.",
              "주소를 등록하거나 바꿀 때마다 카카오톡 인증서로 서명해요. 로그인만으로는 바꿀 수 없어요.",
              "주소는 이 브라우저에서 잠가서 보내고, 잠근 채로 보관해요. 등록한 뒤에는 이 화면에서도 주소가 보이지 않아요.",
            ],
          },
          {
            kind: "list",
            items: [
              PROMISE.address,
              PROMISE.addressFan,
              "주소를 바꾸면 아직 송장을 출력하지 않은 선물부터 새 주소로 나가요.",
              "주소를 미리 등록하지 않았다면 첫 선물을 승인할 때 입력해도 돼요.",
              NO_ADDRESS_ASK,
            ],
          },
        ],
      },
      {
        id: "approve",
        title: "선물 승인하기",
        blocks: [
          { kind: "text", text: "팬이 선물을 결제하면 승인 요청이 와요. 선물은 한 건씩 승인하고, 한꺼번에 승인하는 기능은 없어요." },
          {
            kind: "steps",
            items: [
              "사이드바 「처리할 일」에서 「○○님이 선물을 보내려고 해요」 줄의 「승인하기」를 눌러요.",
              "창에서 보낸 팬의 닉네임·선물 종류·상자 수·전자기기·금속 여부·기한을 확인해요.",
              "받으려면 「카카오톡으로 승인」을 눌러요.",
              "받을 주소가 없으면 이 단계에서 주소를 입력해요. 주소 서명을 마치면 이어서 승인 서명을 따로 받아요. 주소가 있으면 확인만 하고, 이사했다면 「주소 바꾸기」로 먼저 바꿔요.",
              "「카카오톡으로 승인하기」를 누르고 카카오톡 인증서로 서명하면 승인이 끝나요.",
              "승인한 선물과 받지 않은 선물은 사이드바 「받기」의 「승인 내역」에서 다시 볼 수 있어요.",
            ],
          },
          {
            kind: "list",
            items: [
              PROMISE.approval,
              `결제가 끝난 때부터 ${APPROVAL_DEADLINE_DAYS * 24}시간(${APPROVAL_DEADLINE_DAYS}일) 안에 승인하지 않으면 자동으로 받지 않음 처리돼요. 주말과 공휴일도 기간에 들어가요.`,
              "승인 요청 알림의 링크를 누르는 것만으로는 승인되지 않아요. 창에서 서명해야 승인돼요.",
              "선물을 받는 데 드는 돈은 크리에이터가 내지 않아요.",
            ],
          },
        ],
      },
      {
        id: "decline-block",
        title: "받지 않기와 차단",
        blocks: [
          {
            kind: "steps",
            items: [
              "승인 요청 창에서 「받지 않기」를 눌러요.",
              "이 팬의 선물을 앞으로 받지 않으려면 「이 팬의 선물을 앞으로 받지 않기(차단)」에 체크해요.",
              "「받지 않기」를 한 번 더 누르면 끝나요.",
            ],
          },
          {
            kind: "list",
            items: [
              "팬에게는 받지 않은 이유를 알리지 않아요. 받지 않기와 차단에 따른 받지 않음은 팬 화면에 같은 「거절」로 보이고, 기한이 지나 받지 않은 선물은 따로 보여요.",
              "차단하면 그 팬이 보낸 선물 중 아직 승인하지 않은 선물은 모두 받지 않음 처리돼요. 이미 승인한 선물은 그대로 보내 드려요.",
              "차단은 닉네임이 아니라 계정으로 해요. 차단해도 그 팬은 크리에이터 페이지를 보고 팔로우할 수 있어요.",
            ],
          },
          { kind: "text", text: "차단을 풀려면 이렇게 해요." },
          {
            kind: "steps",
            items: [
              "「상세 설정」의 「주소와 설정」에서 「차단한 팬」 칸을 펼쳐요.",
              "팬의 닉네임 아래 「차단 풀기」를 누르고, 창에서 「차단 풀기」를 한 번 더 눌러요.",
              "차단을 풀면 그 팬이 다시 선물을 보낼 수 있어요. 이미 받지 않은 지난 선물은 되살아나지 않아요.",
            ],
          },
        ],
      },
      {
        id: "detector-check",
        title: "받을지 정하기(탐지기 반응 상자)",
        blocks: [
          {
            kind: "text",
            text: `${PROMISE.inspectionOpen} 열어서 추적 장치가 아니라고 확인한 상자는 바로 보내지 않고 크리에이터에게 받을지 물어요.`,
          },
          {
            kind: "steps",
            items: [
              "사이드바 「처리할 일」에 상자 줄이 생겨요. 무엇이 발견됐는지와 「추적 장치 아님」이 함께 보여요.",
              "「받을지 정하기」를 눌러 창을 열어요. 보낸 팬·선물 종류·상자 번호·사무실 도착일·검수 결과·기한을 확인할 수 있어요.",
              "「받기」 또는 「받지 않기」를 눌러요.",
              "고른 뒤에도 팬꾹이 처리하기 전까지는 「취소」로 되돌릴 수 있어요.",
            ],
          },
          {
            kind: "list",
            items: [
              "「받기」를 고르면 다른 상자와 함께 보내 드려요.",
              `「받지 않기」를 고르거나 물은 때부터 ${CREATOR_CHECK_DAYS}일 안에 정하지 않으면 그 상자는 팬에게 돌려보내요.`,
            ],
          },
        ],
      },
      {
        id: "receiving",
        title: "쉬는 중과 팬당 한 달 한도",
        blocks: [
          { kind: "text", text: "「상세 설정」의 「주소와 설정」에서 「받기 설정」 칸을 펼치면 「선물 받기」가 있어요." },
          {
            kind: "steps",
            items: [
              "「받는 상태」에서 「쉬는 중」을 고르면 「다시 받는 날」을 꼭 골라야 해요. 내일부터 1년 안에서 고를 수 있어요.",
              "「팬 한 명이 한 달에 보낼 수 있는 선물」에서 개수를 고르거나 「정하지 않음」을 그대로 둬요.",
              "「선물 받기 저장」을 눌러요.",
            ],
          },
          {
            kind: "list",
            items: [
              "쉬는 동안에는 새 선물을 받지 않아요. 크리에이터 페이지에는 쉬는 중이라는 안내가 보여요.",
              "다시 받는 날 0시부터는 따로 바꾸지 않아도 다시 받아요.",
              "쉬는 동안에도 이미 받은 선물의 승인과 받지 않기는 그대로 할 수 있어요.",
              `한 달 한도는 1개부터 ${MONTHLY_LIMIT_MAX}개까지 고를 수 있어요. 바꾸면 그다음 선물부터 새 한도로 세요.`,
              "이번 달에 한도만큼 보낸 팬은 다음 달 1일부터 다시 보낼 수 있어요.",
              "한도 숫자는 크리에이터 페이지에 보이지 않아요. 한도에 닿은 팬 본인에게만 안내가 보여요.",
            ],
          },
          { kind: "text", text: "같은 칸 아래 「생일과 기념일」도 적을 수 있어요." },
          {
            kind: "list",
            items: [
              `적어 두면 크리에이터 페이지에 ${DDAY_WINDOW_DAYS}일 전부터 D-day 가 보여요. 연도는 받지 않아요.`,
              `기념일 ${ANNIVERSARY_MARK_DAYS}일 전부터는 팬이 「기념일 선물」 표시를 붙여 보낼 수 있어요.`,
            ],
          },
        ],
      },
      {
        id: "hard-items",
        title: "받기 어려운 선물",
        blocks: [
          { kind: "text", text: "당분간 받기 어려운 선물 종류를 크리에이터 페이지에 한 줄로 알릴 수 있어요. 문장은 직접 쓰지 않고 정해진 문장으로 보여요." },
          {
            kind: "steps",
            items: [
              "「상세 설정」의 「받기 설정」 칸 아래쪽에서 받기 어려운 선물 종류를 하나 이상 골라요.",
              `「이유」를 골라요. ${quoteList(HARD_REASONS.map((r) => HARD_REASON_LABEL[r]))} 가운데 하나예요.`,
              `「기간」을 골라요. ${quoteList(HARD_PERIODS.map((p) => HARD_PERIOD_LABEL[p]))} 가운데 하나예요.`,
              `「팬이 이 품목을 고르면」에서 「${HARD_ACTION_LABEL.notice}」이나 「${HARD_ACTION_LABEL.block}」를 골라요.`,
              "미리보기에서 문장을 확인하고 저장해요. 그만 알리려면 「해제」를 눌러요.",
            ],
          },
          {
            kind: "list",
            items: [
              `「${HARD_ACTION_LABEL.notice}」을 고르면 팬이 결제 전에 안내를 보고 그대로 보낼 수도 있어요. 「${HARD_ACTION_LABEL.block}」를 고르면 그 종류로는 선물을 보낼 수 없어요.`,
              "기간은 저장한 날부터 세요. 다시 저장하면 그날부터 다시 세고, 기간이 끝나면 문장이 저절로 사라져요.",
              "남은 기간은 크리에이터 본인에게만 보여요.",
              `어느 쪽을 골라도 ${PROMISE.approval}`,
            ],
          },
        ],
      },
      {
        id: "reply",
        title: "답장",
        blocks: [
          { kind: "text", text: "사무실에서 보낸 선물에는 상자마다 답장을 남길 수 있어요. 답장은 꼭 남기지 않아도 돼요." },
          {
            kind: "steps",
            items: [
              "사이드바 「받기」의 「받은 선물」에서 상자 줄의 「답장 남기기」를 눌러요.",
              `「짧은 답장 고르기」에서 정해진 문구 하나를 골라요. ${quoteList(REPLY_PHRASES.map((p) => REPLY_PHRASE_TEXT[p]))} 가운데 하나예요.`,
              `더 하고 싶은 말이 있으면 「한 줄 더 쓰기」에 ${REPLY_LINE_MAX}자까지 적어요. 전화번호·이메일·인터넷 주소는 쓸 수 없어요.`,
              "「답장 보내기」를 눌러요. 답장 없이 받았다는 것만 알리려면 「답장 없이 확인만」을 눌러요.",
            ],
          },
          {
            kind: "list",
            items: [
              "답장은 그 선물을 보낸 팬 한 명에게만 가요.",
              "보낸 답장은 고칠 수 없고 지울 수만 있어요. 지우면 그 상자에는 다시 답장할 수 없어요.",
              "「상세 설정」의 「감사 답장」에서 「답장 모음 보이기」를 켜면, 팬이 공개를 허락한 답장이 받았어요 3일 뒤부터 크리에이터 페이지에 보여요.",
            ],
          },
        ],
      },
      {
        id: "access-log",
        title: "주소 열람 기록 보기",
        blocks: [
          {
            kind: "steps",
            items: [
              "사이드바 「받기」의 「열람 기록」을 누르면 「주소 열람 기록」 화면이 열려요.",
              "위쪽에서 이번 달 승인 건수·주소가 열린 횟수·재출력 횟수를 볼 수 있어요.",
              "아래 표에서 주소가 열린 시각·주문번호·비고(재출력 여부)를 최근 순으로 확인해요.",
            ],
          },
          {
            kind: "list",
            items: [
              "주소는 승인과 검수가 모두 끝난 상자의 송장을 출력할 때만 열려요.",
              `상자 하나에 첫 출력과 재출력을 합쳐 최대 ${MAX_DECRYPTS_PER_BOX}번까지 열려요. 택배사와 연결된 뒤에는 택배 기사가 상자를 가져가면 남은 횟수가 있어도 더 열리지 않아요.`,
              "사이트 서버는 주소가 열린 기록을 고치거나 지울 수 없어요.",
            ],
          },
        ],
      },
      {
        id: "revgift",
        title: "역조공 보내기",
        blocks: [
          { kind: "text", text: "역조공은 나를 팔로우한 팬에게 크리에이터가 보내는 선물이에요." },
          {
            kind: "steps",
            items: [
              "사이드바 「보내기」의 「팬에게 보내기」를 눌러요.",
              `「받을 팬 고르기」에서 받을 팬을 체크해요. 한 번에 ${MAX_REVGIFT_SHARES}명까지 고를 수 있어요.`,
              "팬마다 보낼 상자 크기를 골라요. 크기와 무게 중 큰 쪽으로 정해요.",
              "결제 금액을 확인하고 「결제하기」를 눌러요. 결제는 한 번이에요.",
              "결제하면 팬마다 받는 주소가 안내돼요. 팬마다 상자를 따로 포장하고, 그 팬의 받는 주소를 끝 6자리까지 그대로 써서 팬꾹 사무실로 보내요.",
              "팬이 「받기」를 누를 때까지 기다리지 않고 보내도 돼요. 송장번호는 배송 조회를 보고 싶을 때만 적어요.",
              "사이드바 「보내기」의 「보낸 내역」에서 팬마다 「수락 대기」「수락」「받지 않음」을 확인해요.",
            ],
          },
          {
            kind: "rows",
            rows: PRICED_TIERS.map((t) => ({
              title: PARCEL_TIER_GUIDE[t].name,
              fields: [
                ["기준", PARCEL_TIER_GUIDE[t].rule],
                ["역조공 요금", won(prices[t].revgiftPriceKrw)],
              ],
            })),
          },
          {
            kind: "list",
            items: [
              "역조공 요금은 팬 선물 요금에서 검수비를 뺀 금액이에요. 역조공 상자는 추적 장치 검사 없이 겉면·크기·무게와 보낼 수 없는 물품만 확인해요.",
              "팬 목록에는 팬의 닉네임만 보여요. 팬의 주소·실명·연락처는 보이지 않아요.",
              "팬은 「받기」를 누를 때 받을 주소를 직접 입력해요.",
              `결제가 끝난 때부터 ${APPROVAL_DEADLINE_DAYS}일 안에 팬이 받지 않으면 「받지 않음」이 돼요. 「받지 않음」은 팬이 받지 않기를 누른 경우와 기한이 지난 경우를 구분하지 않아요.`,
              "받지 않은 팬의 상자는 크리에이터에게 돌려보내고, 그 팬의 선물만 이용약관의 환불 기준에 따라 환불해요. 한 팬이 받지 않아도 다른 팬의 선물은 그대로 가요.",
              `「받지 않음」이 된 팬의 상자가 ${APPROVAL_DEADLINE_DAYS}일 안에 사무실에 도착하지 않으면, 그 팬의 선물 금액을 전부 환불해요.`,
            ],
          },
        ],
      },
    ],
  };
}
