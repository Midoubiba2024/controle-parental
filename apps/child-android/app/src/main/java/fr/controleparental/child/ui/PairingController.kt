package fr.controleparental.child.ui

import fr.controleparental.child.data.PairingClient
import fr.controleparental.child.data.SupervisionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * État de l'appairage en cours, de niveau PROCESSUS (rôle d'un ViewModel) : une
 * rotation ou une recréation de l'activité pendant « Association… » ne perd ni
 * l'appel en cours ni son résultat. Le passage à l'écran « mes données » ne
 * dépend pas de cet état : MainActivity observe SupervisionStore.current, mis à
 * jour par l'enregistrement de l'enrôlement lui-même.
 */
object PairingController {

    /** [errorSeq] change à chaque nouvelle erreur (même code répété). */
    data class State(val busy: Boolean = false, val errorCode: String? = null, val errorSeq: Int = 0)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** Lance l'appairage (ignoré si un appel est déjà en cours). */
    fun submit(store: SupervisionStore, code: String) {
        val previous = _state.value
        if (previous.busy) return
        _state.value = State(busy = true, errorSeq = previous.errorSeq)
        scope.launch {
            val next = when (val r = PairingClient(store).complete(code)) {
                is PairingClient.Result.Ok -> State(errorSeq = previous.errorSeq)
                is PairingClient.Result.Error -> State(errorCode = r.code, errorSeq = previous.errorSeq + 1)
            }
            _state.value = next
        }
    }
}
