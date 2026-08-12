# 부장님! — Codex 구현 지시서

## 1. 문서 목적

`부장님!`은 사용자가 원하는 시각에 자신의 휴대전화로 “부장님”이라는 이름의 전화를 걸어 주는 예약형 전화 앱이다. 일반 전화는 사용자가 전화를 받지 않아도 일정 시간 울린 뒤 자동 종료하고, AI PRO 사용자는 전화를 받은 경우 최대 60초 동안 AI 음성 대화를 이용한다.

이 문서는 MVP를 바로 구현할 수 있도록 제품 요구사항, 기술 구조, API·DB 초안, 보안·운영 규칙 및 acceptance criteria를 정의한다.

## 2. 핵심 UX

### 온보딩

1. 사용자가 전화번호와 인증 방법을 등록한다.
2. 앱이 서비스 발신번호를 연락처에 `부장님`으로 저장하도록 안내한다.
3. iOS/Android 연락처 저장은 OS 권한과 사용자의 명시적 동의를 전제로 한다.
4. 저장이 불가능한 경우 발신번호와 저장 방법을 안내한다.

### 예약

- 빠른 예약: 1분, 3분, 5분 후
- 직접 예약: 날짜와 시각 선택
- 예약 생성 후 목록에서 대기·발신·완료·실패 상태를 확인
- 사용자는 발신 전까지 예약을 취소할 수 있다.

### 전화 동작

- 일반 호출: 서비스 번호에서 사용자 번호로 발신 → 설정된 ringing 시간 후 자동 종료
- 사용자가 먼저 받으면 일반 통화는 짧은 안내 후 종료하거나 MVP 정책에 따라 연결 유지
- AI PRO: 사용자가 실제로 수신한 경우 AI 음성 세션 시작, 최대 60초, 시간 초과 시 자동 종료
- 발신번호는 사용자가 신뢰할 수 있도록 동일한 서비스 번호를 사용

## 3. 요금제 및 제한

| 요금제 | 가격 | 일반 호출 | AI 음성 |
|---|---:|---|---|
| FREE | 0원 | 일 2회, 월 20회 | 없음 |
| PRO | 4,900원/월 | 일 30회, 월 300회 | 없음 |
| AI PRO | 9,900원/월 | PRO와 동일 | 월 30분, 1회 최대 60초 |

제한은 서버에서 최종 판정한다. 클라이언트의 표시값은 참고용이며 우회할 수 없어야 한다. 시간대는 기본 `Asia/Seoul`로 통일하고 계정별 사용량은 실제 예약 생성·통화 연결 기준을 명확히 기록한다.

## 4. 기술 스택

- 모바일: React Native + TypeScript
- 백엔드: Supabase Auth, Postgres, Edge Functions, Realtime(선택)
- 예약 실행: Supabase Scheduler/pg_cron → Edge Function 호출
- 전화: Voice API 또는 기업용 SIP/VoIP 사업자
- AI 음성: 서버 측 음성 스트림 브리지 + Realtime 음성 모델(공급자 교체 가능 구조)
- Apple Watch: SwiftUI 권장
- Wear OS: Kotlin + Jetpack Compose 권장
- 워치 앱은 가능하면 Supabase API를 직접 호출해 예약하고, 인증 토큰은 안전한 OS 저장소에 보관한다.

## 5. 전체 구조

```text
React Native / Apple Watch / Wear OS
                |
             Supabase
      Auth / DB / Edge Functions
                |
          Call Service
       (예약·제한·멱등성)
                |
       VoiceProviderAdapter
       /       |        \
 Voice API  SIP/VoIP   AI Bridge
                |
              PSTN
```

일반 유선회선을 서버에 물리적으로 연결하지 않는다. `Call Service`가 공급자별 API/SIP 차이를 숨기므로 MVP는 개발이 쉬운 Voice API로 시작하고, 상용화 시 국내 SIP 사업자로 교체할 수 있어야 한다.

## 6. 권장 디렉터리 구조

```text
apps/mobile/
  src/{screens,navigation,components,features,lib,types}
apps/watch-ios/
apps/watch-wear/
supabase/
  migrations/
  functions/
    create-reservation/
    cancel-reservation/
    dispatch-due-reservations/
    provider-webhook/
    ai-call-session/
  seed.sql
packages/shared/
  src/{api,validation,types}
```

## 7. 예약 상태머신

```text
scheduled → dispatching → dialing → ringing → connected → completed
     |           |             |          |
  cancelled   failed        failed     missed
```

허용 규칙:

- `scheduled → cancelled`: 발신 전만 허용
- `scheduled → dispatching`: Scheduler가 멱등적으로 전환
- `dispatching → dialing → ringing`: 공급자 발신 성공 단계
- `ringing → connected`: 공급자 webhook의 실제 연결 이벤트
- `ringing → missed`: ringing timeout
- 모든 실행 오류는 재시도 횟수와 함께 `failed`로 기록
- 동일 예약은 `idempotency_key` 및 DB unique 제약으로 한 번만 발신

## 8. DB 스키마 초안

### profiles

- `id uuid primary key references auth.users`
- `phone_e164 text not null unique`
- `timezone text not null default 'Asia/Seoul'`
- `plan_code text not null default 'free'`
- `created_at`, `updated_at timestamptz`

### subscriptions

- `id uuid primary key`
- `user_id uuid references profiles`
- `plan_code text not null`
- `status text not null` (`active`, `past_due`, `cancelled`)
- `period_start`, `period_end timestamptz`
- `provider_customer_id text`

### reservations

- `id uuid primary key`
- `user_id uuid references profiles not null`
- `scheduled_at timestamptz not null`
- `duration_seconds int not null check (duration_seconds in (60,180,300))`
- `mode text not null default 'normal'` (`normal`, `ai`)
- `status text not null default 'scheduled'`
- `idempotency_key text not null`
- `provider text`, `provider_call_id text`
- `attempt_count int not null default 0`
- `ringing_started_at`, `connected_at`, `ended_at timestamptz`
- `failure_code text`, `created_at`, `updated_at timestamptz`

Unique index: `(user_id, idempotency_key)`. 인덱스: `(status, scheduled_at)`, `(user_id, created_at desc)`.

### usage_events

- `id uuid primary key`
- `user_id uuid references profiles not null`
- `reservation_id uuid references reservations`
- `event_type text` (`reservation_created`, `call_connected`, `ai_seconds_used`)
- `quantity int not null default 1`
- `occurred_at timestamptz not null`

### provider_events

- `id uuid primary key`
- `provider text not null`
- `provider_event_id text not null`
- `reservation_id uuid references reservations`
- `payload jsonb not null`
- `received_at timestamptz not null`

Unique index: `(provider, provider_event_id)`.

RLS는 사용자가 자신의 profiles/reservations/usage_events만 읽도록 하고, 상태 변경과 provider_events 삽입은 Edge Function의 service role만 수행한다.

## 9. API 명세 초안

모든 API는 Supabase Auth JWT를 요구한다.

### `POST /functions/v1/create-reservation`

```json
{
  "scheduled_at": "2026-08-20T09:00:00+09:00",
  "duration_seconds": 60,
  "mode": "normal",
  "idempotency_key": "client-generated-uuid"
}
```

응답: `201 { reservation }`. 제한 초과는 `429`, 잘못된 입력은 `400`, 중복 멱등 요청은 기존 예약을 반환한다.

### `POST /functions/v1/cancel-reservation`

입력 `{ "reservation_id": "uuid" }`; 성공 시 `scheduled → cancelled`.

### `GET /functions/v1/reservations?from=&to=`

본인 예약만 반환한다.

### `POST /functions/v1/dispatch-due-reservations`

Scheduler 전용. 만료된 `scheduled` 예약을 잠금 처리하고 Call Service에 전달한다.

### `POST /functions/v1/provider-webhook`

공급자 서명 검증 후 이벤트를 저장하고 예약 상태를 전환한다. 중복 webhook은 무해해야 한다.

## 10. Voice provider adapter

```ts
export interface VoiceProvider {
  createOutboundCall(input: {
    to: string; from: string; reservationId: string;
    mode: 'normal' | 'ai'; maxSeconds: number;
  }): Promise<{ providerCallId: string }>;
  endCall(providerCallId: string): Promise<void>;
  verifyWebhook(headers: Record<string,string>, rawBody: string): boolean;
  parseWebhook(payload: unknown): ProviderEvent;
}
```

`TwilioVoiceProvider` 같은 초기 구현과 `KoreanSipProvider`를 같은 인터페이스에 연결한다. 공급자 비밀키·번호·리전·단가는 모바일 앱에 노출하지 않는다.

## 11. abuse 방지 및 멱등성

- 사용자·IP·전화번호별 생성 rate limit
- FREE 계정의 계정 생성 남용 방지 및 전화번호 인증 필수
- 과거 예약·너무 먼 미래 예약·동시 예약 수 제한
- `idempotency_key` 필수, DB unique 제약과 함수 재조회로 중복 발신 방지
- Scheduler 작업은 `select ... for update skip locked` 패턴 또는 equivalent lock 사용
- provider webhook은 서명 검증, event ID 중복 제거
- 실패 재시도는 지수 백오프와 최대 횟수 적용
- 전화번호는 E.164 정규화, 로그에서는 마스킹

## 12. 환경변수 및 보안

필요한 서버 환경변수 예:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
VOICE_PROVIDER
VOICE_ACCOUNT_ID
VOICE_AUTH_TOKEN
VOICE_FROM_NUMBER
VOICE_WEBHOOK_SECRET
AI_PROVIDER_API_KEY
APP_BASE_URL
```

`SERVICE_ROLE_KEY`, 음성 공급자 토큰, AI 키는 Edge Function secrets에만 저장한다. 클라이언트에는 publishable key와 사용자 JWT만 제공한다. webhook 원문·전화번호·AI 대화 내용은 최소 보관하고 보관기간과 삭제 정책을 구현한다. 결제 도입 시 스토어 결제 검증은 서버에서 수행한다.

## 13. MVP 개발 순서

1. Supabase 프로젝트, Auth, profiles, reservations, RLS, migration
2. React Native 온보딩·연락처 저장 안내·요금제 표시
3. 1/3/5분 및 직접 시간 예약, 목록, 취소
4. 제한 계산, rate limit, idempotency, 상태머신
5. Voice API adapter와 테스트 번호를 이용한 실제 발신
6. Scheduler dispatch 및 provider webhook
7. ringing timeout, 실패 재시도, 운영 로그
8. AI PRO의 60초 음성 세션과 월 30분 사용량 차감
9. Apple Watch SwiftUI 및 Wear OS Compose의 예약 기능
10. 결제·국내 SIP adapter·모니터링·고객지원 도구

## 14. 단계별 TODO 및 acceptance criteria

### Phase 1 — 예약 기반

- TODO: 인증, 프로필, 요금제, RLS, 예약 CRUD
- 검수: 사용자는 자신의 예약만 조회·취소할 수 있고, 다른 사용자의 ID로 접근할 수 없다.
- 검수: 1/3/5분 예약과 직접 예약이 모두 올바른 한국 시간으로 저장된다.

### Phase 2 — 실제 전화

- TODO: adapter, dispatch 함수, Scheduler, webhook
- 검수: 하나의 예약은 재시도나 webhook 중복에도 최대 한 번만 발신된다.
- 검수: 발신·ringing·수신·미수신·실패가 상태와 타임스탬프에 반영된다.
- 검수: 미수신 전화는 설정된 ringing 시간 후 자동 종료된다.

### Phase 3 — 요금제 및 안전장치

- TODO: 일/월 카운터, rate limit, abuse 차단, 관리자 로그
- 검수: 각 요금제 한도를 넘는 요청은 실제 공급자 호출 없이 거절된다.
- 검수: 전화번호와 비밀정보가 클라이언트 번들·일반 로그에 노출되지 않는다.

### Phase 4 — AI PRO

- TODO: 실제 연결 확인 후 AI 세션, 60초 timeout, 사용량 이벤트
- 검수: 받지 않은 전화에는 AI 비용이 발생하는 세션을 시작하지 않는다.
- 검수: 한 통화는 60초를 넘지 않으며, 월 30분 초과 시 새 AI 통화를 거절한다.

### Phase 5 — 워치 및 교체성

- TODO: 워치에서 예약 생성, API client 공유, provider 설정 외부화
- 검수: 워치에서 예약한 항목이 모바일과 동일한 계정의 예약 목록에 나타난다.
- 검수: provider 설정 변경만으로 Voice API adapter를 국내 SIP adapter로 교체할 수 있다.

## 15. 구현 원칙

- 비즈니스 규칙은 모바일이 아니라 Edge Functions/DB에서 집행한다.
- 예약 생성, 발신, webhook, 사용량 차감은 모두 재실행 가능하게 만든다.
- 전화 공급자 종속 코드는 adapter 안에 격리한다.
- 초기에는 실제 전화망 계약·번호 정책·통화 연결률을 PoC로 검증한 뒤 가격과 한도를 조정한다.
- MVP에서 개인정보·통신 관련 법규, 발신번호 표시 및 자동 발신 정책을 국내 출시 전에 별도 검토한다.
