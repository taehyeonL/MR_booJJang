# 배포 및 외부 서비스 연결

## Supabase

1. Supabase 프로젝트를 만들고 SMS Phone Auth를 활성화합니다.
2. `supabase db push`로 migration을 적용하고, 각 Edge Function을 배포합니다.
3. Edge Function secrets에는 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VOICE_*`, `AI_PROVIDER_API_KEY`, `APP_BASE_URL`, `SCHEDULER_SECRET`만 설정합니다. 값은 [`.env.example`](../.env.example)를 참고합니다.
4. 1분 주기 Scheduler가 `POST /functions/v1/dispatch-due-reservations`를 호출하도록 설정하고, `x-scheduler-secret`에 `SCHEDULER_SECRET`을 넣습니다.

## Voice provider

1. `VOICE_PROVIDER=mock`으로 예약·한도·상태 기능을 검증합니다. 이 모드는 실제 전화를 걸지 않습니다.
2. 실제 공급자 계약·검증된 발신 번호를 준비한 뒤 `VOICE_PROVIDER=twilio`과 `VOICE_ACCOUNT_ID`, `VOICE_AUTH_TOKEN`, `VOICE_FROM_NUMBER`, `APP_BASE_URL`을 설정합니다.
3. 공급자의 상태 callback URL을 `https://<project>.supabase.co/functions/v1/provider-webhook`으로 지정합니다. URL에는 `reservation_id`가 시스템이 생성한 call 생성 요청에서만 붙습니다.
4. 테스트 번호로 ringing, connected, no-answer, failed, 중복 callback을 각각 확인합니다.

## 출시 차단 조건

- 발신번호·자동 발신·개인정보 보관에 대한 국내 법률 검토가 끝나지 않은 경우
- 전화번호 인증, provider webhook 서명 검증, Scheduler secret 회전이 검증되지 않은 경우
- AI 음성 provider의 양방향 스트림과 보관·삭제 정책이 확정되지 않은 경우

