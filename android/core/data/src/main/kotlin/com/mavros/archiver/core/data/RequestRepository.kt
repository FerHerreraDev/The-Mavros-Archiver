package com.mavros.archiver.core.data

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.exception.PostgrestRestException
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Qué pasó con un pedido (REQ-02, REQ-03) */
enum class RequestResult { Sent, Duplicate, TooMany }

interface RequestRepository {
    /** Pide una película o serie con este título ("Pedir «…»", REQ-03) */
    suspend fun request(title: String): DataResult<RequestResult>
}

/** Insert directo con la sesión del usuario: RLS pone user_id y solo deja crear pendientes (REQ-01) */
class SupabaseRequestRepository(private val client: SupabaseClient, private val auth: AuthRepository) : RequestRepository {
    override suspend fun request(title: String): DataResult<RequestResult> {
        val clean = title.trim().replace(Regex("\\s+"), " ").take(200)
        if (clean.isEmpty()) return DataResult.Failure(DataError.Server)
        return try {
            client.from("movie_requests").insert(buildJsonObject { put("title", clean) })
            DataResult.Success(RequestResult.Sent)
        } catch (e: CancellationException) {
            throw e
        } catch (e: PostgrestRestException) {
            when {
                e.code == "23505" -> DataResult.Success(RequestResult.Duplicate)
                e.message?.contains("too_many_requests") == true -> DataResult.Success(RequestResult.TooMany)
                else -> e.toDataError().also { if (it == DataError.Unauthorized) auth.onUnauthorized() }.let { DataResult.Failure(it) }
            }
        } catch (e: Throwable) {
            DataResult.Failure(e.toDataError())
        }
    }
}
