package fr.controleparental.child.enforce

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * LOT 2 — Overlay de BLOCAGE plein écran (mode Standard, via SYSTEM_ALERT_WINDOW).
 *
 * Garde-fous de conformité (docs/02-CONFORMITE.md) :
 *   * VISIBLE et explicite : l'enfant voit pourquoi l'app est en pause, et peut
 *     DEMANDER plus de temps (co-régulation). Jamais furtif.
 *   * N'emprisonne pas : la touche Accueil reste opérante (on ne capture rien) ;
 *     l'overlay ne fait que recouvrir l'app bloquée.
 *   * URGENCE : un bouton « Appel d'urgence (112) » est toujours présent et ouvre
 *     le composeur — l'urgence n'est jamais empêchée.
 *
 * NB : en mode Renforcé (device owner), le blocage réel passe par
 * setPackagesSuspended (ReinforcedEnforcer) ; l'overlay sert alors de repli /
 * d'explication. Il requiert l'autorisation « Affichage par-dessus les autres
 * applications » (Settings.canDrawOverlays) — sinon on ne peut qu'informer.
 */
class BlockOverlay(private val context: Context) {

    private val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private var view: View? = null
    private var currentReason: BlockReason? = null

    fun canDraw(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

    /** Affiche (ou met à jour) l'overlay pour la [decision]. Idempotent par motif. */
    fun show(decision: Decision, onRequestExtra: () -> Unit) {
        if (!canDraw()) return
        if (view != null && currentReason == decision.reason) return
        hide()
        currentReason = decision.reason

        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#F2FBF6EF")) // crème, quasi opaque
            setPadding(64, 64, 64, 64)
        }

        root.addView(TextView(context).apply {
            text = "⏸"
            textSize = 46f
            gravity = Gravity.CENTER
        })
        root.addView(TextView(context).apply {
            text = "Pause"
            textSize = 26f
            setTextColor(Color.parseColor("#2A2330"))
            gravity = Gravity.CENTER
            setPadding(0, 16, 0, 8)
        })
        root.addView(TextView(context).apply {
            text = decision.message.ifBlank { "Cette application est momentanément en pause." }
            textSize = 16f
            setTextColor(Color.parseColor("#6B6472"))
            gravity = Gravity.CENTER
        })

        // Demander plus de temps (sauf pour un downtime/coucher où c'est hors sujet).
        if (decision.reason != BlockReason.SCHEDULE_DOWNTIME) {
            root.addView(Button(context).apply {
                text = "Demander plus de temps"
                setPadding(0, 24, 0, 0)
                setOnClickListener { onRequestExtra() }
            })
        }

        // Accès à l'accueil (ne piège pas l'enfant).
        root.addView(Button(context).apply {
            text = "Retour à l'accueil"
            setOnClickListener {
                val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                    .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(home)
            }
        })

        // URGENCE — toujours disponible.
        root.addView(Button(context).apply {
            text = "Appel d'urgence (112)"
            setOnClickListener {
                val dial = Intent(Intent.ACTION_DIAL, Uri.parse("tel:112"))
                    .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(dial)
            }
        })

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            // NOT_FOCUSABLE : ne pas voler le focus clavier ; l'overlay reste
            // cliquable (pas de NOT_TOUCHABLE) pour ses propres boutons.
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT,
        )

        try {
            wm.addView(root, params)
            view = root
        } catch (_: Exception) {
            view = null
            currentReason = null
        }
    }

    fun hide() {
        val v = view ?: return
        try { wm.removeView(v) } catch (_: Exception) { }
        view = null
        currentReason = null
    }

    val isShowing: Boolean get() = view != null
}
