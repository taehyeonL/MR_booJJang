# 부장님!

예약한 시각에 신뢰 가능한 서비스 번호로 사용자에게 전화를 거는 React Native + Supabase MVP입니다.

## 현재 구현 범위

- 모바일 온보딩, 빠른 예약(1/3/5분), 직접 예약, 목록 및 취소 UI
- Supabase migration: 프로필·예약·사용량·공급자 이벤트, RLS, 상태 전이, 한도 집행
- Edge Functions: 예약 생성·조회·취소·발신 dispatch·공급자 webhook
- `mock` 및 Twilio 호환 Voice Provider adapter

실제 전화 발신과 AI 음성은 계정·발신번호·Webhook 주소를 확인한 후에만 활성화됩니다. 기본값은 외부 통화를 만들지 않는 `mock` provider입니다.

## 시작하기

1. `apps/mobile/.env.example`을 `apps/mobile/.env`로 복사하고 공개 Supabase 값만 채웁니다.
2. `npm install`
3. `npm run typecheck`
4. `npm run mobile`

Supabase CLI와 Docker를 설치한 환경에서는 `supabase start`, `supabase db reset`, `supabase functions serve` 순서로 로컬 백엔드를 실행합니다. 서버 비밀값은 루트 [`.env.example`](.env.example)를 참고하되, `.env`가 아니라 `supabase secrets set KEY=value`로 설정합니다.

`dispatch-due-reservations`는 JWT 대신 `x-scheduler-secret` 헤더를 확인합니다. 이 값을 Supabase Vault 등에 보관하고, 1분 주기 Scheduler 호출에만 주입하세요. `VOICE_PROVIDER=mock`이면 외부 발신이나 공개 webhook을 만들지 않습니다.

## 배포 전 확인

- Supabase 프로젝트 URL, publishable key, service role key
- 음성 공급자 계약, 검증된 발신번호와 서명 webhook 설정
- AI 음성 공급자 키와 데이터 보관 정책
- 국내 발신번호 표시·자동발신·개인정보 관련 검토

## AI 음성 연결

AI 사용량·60초 상한·월 30분 상한은 서버에 구현되어 있습니다. 실제 양방향 음성 스트림은 선택한 음성 사업자의 Media Stream 프로토콜과 AI Realtime 공급자 계정을 연결해야 하므로, 계약 전에는 일반 전화 흐름만 활성화하세요. AI 모드는 연결되지 않은 통화에서 사용량을 기록하지 않습니다.
