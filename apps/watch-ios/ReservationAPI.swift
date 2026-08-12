import Foundation

struct ReservationPayload: Encodable {
    let scheduled_at: String
    let duration_seconds = 60
    let mode = "normal"
    let idempotency_key = UUID().uuidString
}

struct ReservationAPI {
    // Inject these at build/configuration time. Do not embed server secrets in this target.
    let supabaseURL = ProcessInfo.processInfo.environment["SUPABASE_URL"] ?? ""
    let publishableKey = ProcessInfo.processInfo.environment["SUPABASE_PUBLISHABLE_KEY"] ?? ""
    let tokenProvider: () throws -> String = { throw URLError(.userAuthenticationRequired) }

    func createReservation(scheduledAt: Date) async throws {
        guard let url = URL(string: "\(supabaseURL)/functions/v1/create-reservation") else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(try tokenProvider())", forHTTPHeaderField: "Authorization")
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(ReservationPayload(scheduled_at: ISO8601DateFormatter().string(from: scheduledAt)))
        let (_, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 201 else { throw URLError(.cannotParseResponse) }
    }
}

