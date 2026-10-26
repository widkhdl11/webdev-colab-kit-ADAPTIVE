import { HANDLE_LOCK_DAYS, HANDLE_MAX, HANDLE_MIN, HANDLE_RETIRE_DAYS } from "@/entities/creator/model/creator-handle";
import { VERIFICATION_CODE_DAYS, VERIFICATION_TRIES } from "@/entities/creator/model/creator-verification";
import { ANNIVERSARY_MARK_DAYS, DDAY_WINDOW_DAYS, MONTHLY_LIMIT_MAX } from "@/entities/creator/model/receiving";
import { REPLY_LINE_MAX, REPLY_PHRASE_TEXT, REPLY_PHRASES } from "@/entities/gift-reply/model/reply";
import { HARD_ACTION_LABEL, HARD_PERIOD_LABEL, HARD_PERIODS, HARD_REASON_OPTION_LABEL, HARD_REASONS } from "@/entities/gift-item/model/hard-items";
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
    lead: "크리에이터로 가입한 뒤 선물을 받고, 답장하고, 팬에게 역조공을 보내는 방법을 안내해 드려요.",
    summary: [
      "가입한 뒤 채널 본인 확인을 마쳐야 크리에이터 찾기에 표시되고 선물을 받을 수 있어요.",
      `선물은 한 건씩 카카오톡 인증서로 서명해 승인해요. ${PROMISE.approval}`,
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
              "회원가입 첫 단계 「유형 선택」에서 「크리에이터예요」를 골라 주세요.",
              "「정보 입력」에서 아이디·이메일·비밀번호·휴대폰 번호와 공개 이름·채널 이름을 적어 주세요. 팬덤 이름은 넣지 않아도 돼요.",
              "「본인 확인」에서 카카오톡으로 휴대폰 번호의 명의자를 확인하면 가입이 끝나요.",
              "가입만으로는 크리에이터 찾기에 표시되지 않아요. 아래의 채널 본인 확인을 마쳐 주세요.",
            ],
          },
        ],
      },
      {
        id: "channel-check",
        title: "채널 본인 확인",
        blocks: [
          { kind: "text", text: "활동 채널을 소유한 본인이 맞는지 확인하는 단계예요. 확인을 마치면 크리에이터 찾기에 표시되고 팬의 선물을 받을 수 있어요." },
          {
            kind: "steps",
            items: [
              "아래쪽 이름 메뉴에서 「계정 설정」을 열고, 「보안」의 「채널 본인 확인」 항목에서 「확인하기」를 눌러요.",
              "「채널 주소」에 내 채널의 주소를 붙여 넣어 주세요.",
              "채널에 따라 로그인으로 확인하는 버튼이 보여요. 해당 버튼을 눌러 채널 계정으로 로그인하면 바로 확인할 수 있어요.",
              "로그인이 어렵다면 「코드로 확인하기」를 눌러 인증 코드를 받아요. 「코드 복사」로 복사해 채널 소개란에 잠깐 붙인 뒤 「확인」을 눌러요.",
              "확인이 끝났다는 문구가 보이면 소개란의 인증 코드는 지워도 돼요.",
            ],
          },
          { kind: "text", text: "로그인 확인을 지원하지 않거나 자동으로 확인되지 않는 채널은 팬꾹에서 직접 확인해요." },
          {
            kind: "steps",
            items: [
              "「코드 받기」를 눌러 인증 코드를 받아요.",
              "인증 코드를 채널 소개란에 붙이거나 팬꾹 계정에 DM으로 보내요.",
              "「확인 요청」(또는 「운영자에게 확인 요청」)을 눌러요. 팬꾹에서 채널의 인증 코드를 확인하며, 결과는 같은 항목에서 볼 수 있어요.",
              "팬꾹이 확인하면 소개란의 인증 코드는 지워도 돼요.",
            ],
          },
          {
            kind: "list",
            items: [
              `인증 코드를 받은 날부터 ${VERIFICATION_CODE_DAYS}일 안에 확인을 마치거나 「확인 요청」을 눌러야 해요. 팬꾹이 직접 확인하는 데 걸리는 기간은 정해져 있지 않아요.`,
              `한 채널의 인증 코드는 최대 ${VERIFICATION_TRIES}번까지 신청할 수 있어요. 횟수를 모두 사용했다면 1:1 문의로 알려 주세요.`,
              "하나의 채널은 하나의 계정에서만 확인받을 수 있어요. 이미 다른 계정에서 확인받은 채널이라면 1:1 문의로 알려 주세요.",
            ],
          },
        ],
      },
      {
        id: "page-link",
        title: "크리에이터 페이지와 링크 주소",
        blocks: [
          { kind: "text", text: "크리에이터 페이지는 팬이 선물을 보낼 수 있는 내 페이지예요. 링크 주소를 정하면 방송이나 SNS에서 공유할 수 있어요." },
          {
            kind: "steps",
            items: [
              "사이드바 「내 팬꾹」의 「프로필 수정」에서 프로필 사진·배경 사진·공개 이름·한 줄 소개를 정해요.",
              "사이드바 「내 팬꾹」의 「상세 설정」을 열고, 「선물 링크」 칸을 펼쳐요.",
              `「링크 주소」에 영문·숫자·밑줄(_)로 ${HANDLE_MIN}~${HANDLE_MAX}자를 적어요. 로그인 아이디와 다른 값으로 정해 주세요.`,
              "「링크 주소 정하기」를 누르고, 철자를 다시 확인한 뒤 「정하기」를 눌러요.",
              "「복사」를 눌러 링크 주소를 복사하고 방송이나 SNS에 붙여요.",
            ],
          },
          {
            kind: "list",
            items: [
              "선물 링크는 채널 본인 확인을 마친 뒤에 이용할 수 있어요.",
              `링크 주소를 정하거나 바꾸면 ${HANDLE_LOCK_DAYS}일 동안 다시 바꿀 수 없어요.`,
              `링크 주소를 바꾸면 ${HANDLE_RETIRE_DAYS}일 동안은 이전 주소로 접속해도 새 주소로 연결돼요.`,
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
              "「링크 미리보기 이미지」에서 메신저나 SNS에 링크를 붙였을 때 보일 그림을 골라요. 프로필 사진과 팬덤 심볼 가운데 하나를 쓸 수 있어요.",
              "「공지 이미지 받기」에서 크기를 골라요. 정사각형·세로형(스토리용)·가로형이 있어요.",
              "「내려받기」로 이미지를 저장하거나 「링크 복사」로 이미지 링크를 복사해요.",
              "내 채널에 공지 이미지를 올려 선물 링크를 알려요. 이미지에는 프로필 배경 사진·프로필 사진·이름·소개와 「팬꾹으로 선물 보내기」 문구, 링크 주소가 들어가요.",
              "스토리에서는 이미지 속 주소를 누를 수 없으니 링크 스티커를 따로 붙여 주세요.",
            ],
          },
          { kind: "text", text: "공지 이미지는 채널 본인 확인을 마치고 링크 주소를 정한 뒤에 받을 수 있어요." },
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
              "주소는 입력한 브라우저에서 암호화한 뒤 전송하고, 암호화된 상태로 보관해요. 등록한 뒤에는 이 화면에서도 주소를 볼 수 없어요.",
            ],
          },
          {
            kind: "list",
            items: [
              PROMISE.address,
              PROMISE.addressFan,
              "주소를 바꾸면 아직 송장을 출력하지 않은 선물부터 새 주소로 보내요.",
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
          { kind: "text", text: "팬이 선물 결제를 마치면 승인 요청이 와요. 선물은 한 건씩 승인하며, 한꺼번에 승인하는 기능은 없어요." },
          {
            kind: "steps",
            items: [
              "사이드바 「지금 할 일」에서 「○○님이 선물을 보내려고 해요」 줄의 「승인하기」를 눌러요.",
              "창에서 보낸 팬의 닉네임·선물 종류·상자 수·전자기기·금속 여부·기한을 확인해요.",
              "받으려면 「카카오톡으로 승인」을 눌러요.",
              "받을 주소가 없으면 이 단계에서 입력해요. 주소 등록 서명을 마친 뒤 선물 승인 서명을 따로 진행해요. 이미 주소가 등록되어 있다면 확인만 하고, 이사했다면 「주소 바꾸기」에서 먼저 변경해 주세요.",
              "「카카오톡으로 승인하기」를 누르고 카카오톡 인증서로 서명하면 승인이 끝나요.",
              "승인한 선물과 받지 않은 선물은 사이드바 「받기」의 「승인 내역」에서 다시 볼 수 있어요.",
            ],
          },
          {
            kind: "list",
            items: [
              PROMISE.approval,
              `결제가 끝난 때부터 ${APPROVAL_DEADLINE_DAYS * 24}시간(${APPROVAL_DEADLINE_DAYS}일) 안에 승인하지 않으면 자동으로 받지 않음 처리돼요. 주말과 공휴일도 포함돼요.`,
              "승인 요청 알림의 링크를 누르는 것만으로는 승인되지 않아요. 창에서 서명까지 마쳐야 승인돼요.",
              "선물을 받는 크리에이터는 비용을 부담하지 않아요.",
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
              "팬에게는 거절한 이유를 알리지 않아요. 직접 받지 않기를 선택한 경우와 차단으로 받지 않게 된 경우는 팬 화면에 모두 「거절」로 표시돼요. 승인 기한이 지난 선물은 별도로 표시돼요.",
              "차단하면 그 팬이 보낸 선물 중 아직 승인하지 않은 선물은 모두 받지 않음 처리돼요. 이미 승인한 선물은 그대로 보내 드려요.",
              "차단은 닉네임이 아닌 계정을 기준으로 해요. 차단된 팬도 크리에이터 페이지를 보거나 팔로우할 수 있어요.",
            ],
          },
          { kind: "text", text: "차단은 다음 순서로 해제할 수 있어요." },
          {
            kind: "steps",
            items: [
              "「상세 설정」의 「주소와 설정」에서 「차단한 팬」 칸을 펼쳐요.",
              "팬의 닉네임 아래 「차단 풀기」를 누르고, 창에서 「차단 풀기」를 한 번 더 눌러요.",
              "차단을 풀면 해당 팬이 다시 선물을 보낼 수 있어요. 이미 거절한 선물은 복구되지 않아요.",
            ],
          },
        ],
      },
      {
        id: "detector-check",
        title: "탐지기에 반응한 상자의 수령 여부 정하기",
        blocks: [
          {
            kind: "text",
            text: `${PROMISE.inspectionOpen} 블루투스·RF 반응이 있었지만 추적 장치가 아닌 것으로 확인된 상자는 바로 보내지 않고 크리에이터에게 받을지 물어요.`,
          },
          {
            kind: "steps",
            items: [
              "사이드바 「지금 할 일」에 해당 상자가 표시돼요. 발견된 물품과 「추적 장치 아님」 안내를 확인할 수 있어요.",
              "「받을지 정하기」를 눌러 창을 열어요. 보낸 팬·선물 종류·상자 번호·사무실 도착일·검수 결과·기한을 확인할 수 있어요.",
              "「받기」 또는 「받지 않기」를 눌러요.",
              "선택한 뒤에도 팬꾹이 처리하기 전까지는 「취소」를 눌러 선택을 되돌릴 수 있어요.",
            ],
          },
          {
            kind: "list",
            items: [
              "「받기」를 고르면 다른 상자와 함께 보내 드려요.",
              `「받지 않기」를 고르거나 수령 여부를 물은 때부터 ${CREATOR_CHECK_DAYS}일 안에 답하지 않으면 해당 상자를 팬에게 돌려보내요.`,
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
              "다시 받는 날 0시부터는 자동으로 선물을 다시 받아요.",
              "쉬는 동안에도 이미 등록된 선물은 승인하거나 받지 않기를 선택할 수 있어요.",
              `한 달 한도는 1개부터 ${MONTHLY_LIMIT_MAX}개까지 정할 수 있어요. 변경한 한도는 다음 선물부터 적용돼요.`,
              "이번 달에 한도만큼 보낸 팬은 다음 달 1일부터 다시 보낼 수 있어요.",
              "설정한 한도는 크리에이터 페이지에 표시되지 않아요. 한도에 도달한 팬 본인에게만 안내가 보여요.",
            ],
          },
          { kind: "text", text: "같은 항목 아래에서 「생일과 기념일」도 등록할 수 있어요." },
          {
            kind: "list",
            items: [
              `등록하면 크리에이터 페이지에 ${DDAY_WINDOW_DAYS}일 전부터 D-day가 표시돼요. 연도는 입력하지 않아요.`,
              `기념일 ${ANNIVERSARY_MARK_DAYS}일 전부터는 팬이 「기념일 선물」 표시를 붙여 보낼 수 있어요.`,
            ],
          },
        ],
      },
      {
        id: "hard-items",
        title: "받기 어려운 선물",
        blocks: [
          { kind: "text", text: "당분간 받기 어려운 선물 종류를 크리에이터 페이지에 한 줄로 안내할 수 있어요. 직접 문장을 작성하는 대신 선택한 내용에 맞는 안내 문구가 표시돼요." },
          {
            kind: "steps",
            items: [
              "「상세 설정」의 「받기 설정」 칸 아래쪽에서 받기 어려운 선물 종류를 하나 이상 골라요.",
              `「이유」를 골라요. ${quoteList(HARD_REASONS.map((r) => HARD_REASON_OPTION_LABEL[r]))} 가운데 하나예요.`,
              `「기간」을 골라요. ${quoteList(HARD_PERIODS.map((p) => HARD_PERIOD_LABEL[p]))} 가운데 하나예요.`,
              `「해당 선물 선택 시」에서 「${HARD_ACTION_LABEL.notice}」나 「${HARD_ACTION_LABEL.block}」을 골라요.`,
              "미리보기에서 문장을 확인하고 저장해요. 그만 알리려면 「해제」를 눌러요.",
            ],
          },
          {
            kind: "list",
            items: [
              `「${HARD_ACTION_LABEL.notice}」를 고르면 팬이 결제 전에 안내를 보고 그대로 보낼 수도 있어요. 「${HARD_ACTION_LABEL.block}」을 고르면 그 종류로는 선물을 보낼 수 없어요.`,
              "기간은 저장한 날부터 계산해요. 다시 저장하면 그날부터 새로 계산하며, 기간이 끝나면 안내 문구가 자동으로 사라져요.",
              "남은 기간은 크리에이터 본인에게만 보여요.",
              `어느 쪽을 선택하더라도 ${PROMISE.approval}`,
            ],
          },
        ],
      },
      {
        id: "reply",
        title: "답장",
        blocks: [
          { kind: "text", text: "사무실에서 발송한 선물에는 상자마다 답장을 남길 수 있어요. 답장은 선택 사항이에요." },
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
              "답장은 해당 선물을 보낸 팬에게만 전달돼요.",
              "보낸 답장은 수정할 수 없고 삭제만 할 수 있어요. 삭제하면 해당 상자에는 다시 답장할 수 없어요.",
              "「상세 설정」의 「감사 답장」에서 「답장 모음 보이기」를 켜면, 팬이 공개를 허락한 답장을 크리에이터 페이지에 보여 줄 수 있어요. 공개 시점은 「받았어요」 처리 후 3일이에요.",
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
              "화면 위쪽에서 이번 달 승인 건수·주소 열람 횟수·재출력 횟수를 확인할 수 있어요.",
              "아래 표에서는 주소를 열람한 시각·주문번호·비고(재출력 여부)를 최근 순으로 볼 수 있어요.",
            ],
          },
          {
            kind: "list",
            items: [
              "주소는 승인과 검수가 모두 끝난 상자의 송장을 출력할 때만 열려요.",
              `주소는 상자마다 첫 출력과 재출력을 합쳐 최대 ${MAX_DECRYPTS_PER_BOX}번까지 열 수 있어요. 택배사와 연동된 뒤에는 택배사가 상자를 가져가면 남은 횟수가 있어도 더 이상 열 수 없어요.`,
              "주소 열람 기록은 임의로 수정하거나 삭제할 수 없어요.",
            ],
          },
        ],
      },
      {
        id: "revgift",
        title: "역조공 보내기",
        blocks: [
          { kind: "text", text: "역조공은 크리에이터가 나를 팔로우한 팬에게 보내는 선물이에요." },
          {
            kind: "steps",
            items: [
              "사이드바 「보내기」의 「팬에게 보내기」를 눌러요.",
              `「받을 팬 고르기」에서 받을 팬을 체크해요. 한 번에 ${MAX_REVGIFT_SHARES}명까지 고를 수 있어요.`,
              "팬마다 보낼 상자의 요금 구간을 골라요. 크기와 무게를 각각 확인해 더 높은 구간을 선택해 주세요.",
              "결제 금액을 확인하고 「결제하기」를 눌러요. 선택한 팬들의 선물을 한 번에 결제해요.",
              "결제를 마치면 팬별로 상자를 보낼 팬꾹 주소가 안내돼요. 팬마다 상자를 따로 포장하고, 안내된 주소를 마지막 6자리까지 빠짐없이 적어 팬꾹 사무실로 보내 주세요.",
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
              "역조공 요금은 팬 선물 요금에서 검수비를 뺀 금액이에요. 역조공 상자는 추적 장치 검사를 하지 않으며, 겉면·크기·무게와 보낼 수 없는 물품이 있는지 확인해요.",
              "팬 목록에는 팬의 닉네임만 보여요. 팬의 주소·실명·연락처는 공개하지 않아요.",
              "팬은 「받기」를 누를 때 설정에 등록한 배송지를 확인해요. 등록한 주소가 없으면 해당 화면에서 등록할 수 있어요. 「받기」를 누른 뒤 기본 배송지를 바꾸거나 지워도 해당 선물은 수락할 때 따로 저장한 주소로 보내요.",
              `결제가 끝난 때부터 ${APPROVAL_DEADLINE_DAYS}일 안에 팬이 수락하지 않으면 「받지 않음」으로 처리돼요. 팬이 직접 받지 않기를 선택한 경우와 기한이 지난 경우는 구분하지 않고 모두 「받지 않음」으로 표시돼요.`,
              "팬이 받지 않은 상자는 크리에이터에게 돌려보내고, 해당 팬의 선물만 이용약관의 환불 기준에 따라 환불해요. 다른 팬의 선물은 그대로 진행해요.",
              "「받지 않음」으로 처리된 건은 결제가 끝난 때부터 30일이 될 때까지 환불을 보류해요. 그 안에 상자가 도착하면 돌려보낸 뒤 해당 건의 결제 금액에서 반송 택배비를 뺀 금액을 환불해 드려요. 30일이 지나도 도착하지 않으면 해당 건의 결제 금액 전액을 환불해 드려요.",
            ],
          },
        ],
      },
    ],
  };
}
