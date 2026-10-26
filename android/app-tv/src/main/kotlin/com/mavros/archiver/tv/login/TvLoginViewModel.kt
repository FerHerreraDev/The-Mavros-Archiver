package com.mavros.archiver.tv.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mavros.archiver.core.data.AuthRepository
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.DeviceAuthRepository
import com.mavros.archiver.core.data.DeviceCode
import com.mavros.archiver.core.data.DevicePoll
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Por qué se muestra un código nuevo (TV-03) */
enum class CodeNotice { Expired, Denied, Failed }

sealed interface TvLoginState {
    data object Requesting : TvLoginState
    data class Showing(val code: DeviceCode, val notice: CodeNotice? = null, val offline: Boolean = false) : TvLoginState
    /** No se pudo pedir código: [error] dice si fue la red o el servidor (TV-03) */
    data class Unavailable(val error: DataError) : TvLoginState
    data object SignedIn : TvLoginState
}

/**
 * Login por código (TV-01..TV-03, RFC 8628): pide un código, lo muestra y sondea cada
 * `interval` s hasta que se aprueba en el teléfono. Si caduca o se rechaza, pide otro solo.
 */
class TvLoginViewModel(
    private val device: DeviceAuthRepository,
    private val auth: AuthRepository,
    private val clientName: String,
) : ViewModel() {
    private val _state = MutableStateFlow<TvLoginState>(TvLoginState.Requesting)
    val state: StateFlow<TvLoginState> = _state

    init {
        viewModelScope.launch { run() }
    }

    private suspend fun kotlinx.coroutines.CoroutineScope.run() {
        var notice: CodeNotice? = null
        var retry = RETRY_MS
        while (isActive) {
            val code = when (val result = device.requestCode(clientName)) {
                is DataResult.Success -> result.value
                is DataResult.Failure -> {
                    _state.value = TvLoginState.Unavailable(result.error)
                    // Cada vez más espaciado: insistir cada 5 s mantiene activo el límite de intentos
                    delay(retry)
                    retry = (retry * 2).coerceAtMost(MAX_RETRY_MS)
                    continue
                }
            }
            retry = RETRY_MS
            _state.value = TvLoginState.Showing(code, notice)
            notice = pollUntilDone(code) ?: return
        }
    }

    /** null = sesión iniciada; si no, por qué hay que pedir otro código */
    private suspend fun pollUntilDone(code: DeviceCode): CodeNotice? {
        var interval = code.intervalSeconds.coerceAtLeast(1)
        while (true) {
            delay(interval * 1000L)
            when (val result = device.poll(code.deviceCode)) {
                is DataResult.Failure -> {
                    // Sin red: se avisa, se conserva el código y se sigue intentando
                    _state.value = TvLoginState.Showing(code, (_state.value as? TvLoginState.Showing)?.notice, offline = result.error == DataError.Network)
                }
                is DataResult.Success -> when (val poll = result.value) {
                    DevicePoll.Pending -> clearOffline(code)
                    DevicePoll.SlowDown -> interval += DeviceAuthRepository.SLOW_DOWN_STEP_SECONDS
                    DevicePoll.Denied -> return CodeNotice.Denied
                    DevicePoll.Expired, DevicePoll.Invalid -> return CodeNotice.Expired
                    is DevicePoll.Approved -> {
                        if (auth.signInWithTokens(poll.tokens)) {
                            _state.value = TvLoginState.SignedIn
                            return null
                        }
                        return CodeNotice.Failed
                    }
                }
            }
        }
    }

    private fun clearOffline(code: DeviceCode) {
        val current = _state.value as? TvLoginState.Showing ?: return
        if (current.offline) _state.value = TvLoginState.Showing(code, current.notice)
    }

    companion object {
        const val RETRY_MS = 5_000L
        const val MAX_RETRY_MS = 60_000L
    }
}
