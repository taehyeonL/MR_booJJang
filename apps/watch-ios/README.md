# 부장님! Apple Watch

Xcode에서 watchOS App target을 만든 뒤 `BujangnimWatchApp.swift`와 `ReservationAPI.swift`를 target에 추가하세요.

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`는 앱 설정 또는 안전한 원격 구성에서 제공합니다.
- 사용자 access token은 Keychain에 보관하고, 갱신은 모바일 인증 흐름과 공유합니다.
- service role, Voice provider, AI 키는 절대 Watch 앱에 넣지 않습니다.

