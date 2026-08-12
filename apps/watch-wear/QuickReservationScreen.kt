package com.example.bujangnim.watch

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.Text
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

data class CreateReservationRequest(
    val scheduled_at: String,
    val duration_seconds: Int = 60,
    val mode: String = "normal",
    val idempotency_key: String = UUID.randomUUID().toString(),
)

interface SupabaseReservationApi {
    suspend fun createReservation(token: String, request: CreateReservationRequest)
}

@Composable
fun QuickReservationScreen(api: SupabaseReservationApi, accessToken: String, scope: CoroutineScope) {
    var message by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("부장님!")
        listOf(1, 3, 5).forEach { minutes ->
            Button(onClick = {
                scope.launch {
                    runCatching {
                        api.createReservation(accessToken, CreateReservationRequest(Instant.now().plusSeconds(minutes * 60L).toString()))
                    }.onSuccess { message = "예약했습니다" }.onFailure { message = "예약에 실패했습니다" }
                }
            }) { Text("${minutes}분 후") }
        }
        if (message.isNotEmpty()) Text(message)
    }
}

