package com.mavros.archiver.core.data

import io.github.jan.supabase.exceptions.HttpRequestException
import io.github.jan.supabase.exceptions.RestException
import io.ktor.client.plugins.HttpRequestTimeoutException
import java.io.IOException

/** Error de datos que la UI sabe mostrar (MOB-09) */
enum class DataError { Network, Unauthorized, Server }

sealed interface DataResult<out T> {
    data class Success<T>(val value: T) : DataResult<T>
    data class Failure(val error: DataError) : DataResult<Nothing>
}

internal fun Throwable.toDataError(): DataError = when (this) {
    is HttpRequestException, is HttpRequestTimeoutException, is IOException -> DataError.Network
    is RestException -> if (statusCode == 401 || statusCode == 403) DataError.Unauthorized else DataError.Server
    else -> DataError.Server
}
