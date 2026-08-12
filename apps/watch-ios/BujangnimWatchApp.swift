import SwiftUI

@main
struct BujangnimWatchApp: App {
    var body: some Scene { WindowGroup { QuickReservationView() } }
}

struct QuickReservationView: View {
    @State private var isSaving = false
    @State private var message = ""
    private let api = ReservationAPI()

    var body: some View {
        VStack(spacing: 10) {
            Text("부장님!").font(.headline)
            Text("원하는 때에 전화 예약")
            ForEach([1, 3, 5], id: \.self) { minutes in
                Button("\(minutes)분 후") { reserve(minutes: minutes) }.disabled(isSaving)
            }
            if !message.isEmpty { Text(message).font(.footnote) }
        }.padding()
    }

    private func reserve(minutes: Int) {
        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                try await api.createReservation(scheduledAt: Date().addingTimeInterval(Double(minutes * 60)))
                message = "예약했습니다"
            } catch { message = "예약에 실패했습니다" }
        }
    }
}

