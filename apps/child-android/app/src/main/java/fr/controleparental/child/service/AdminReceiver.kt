package fr.controleparental.child.service

import android.app.admin.DeviceAdminReceiver

/**
 * Récepteur d'administration d'appareil — requis pour lockNow() (verrouillage
 * instantané) et, en device owner, pour setPackagesSuspended() / user restrictions.
 *
 * Transparence : l'activation de l'administrateur d'appareil est explicite
 * (écran système) et la supervision reste visible (notification persistante).
 * Aucune capacité de masquage ni d'espionnage n'est utilisée ici.
 */
class AdminReceiver : DeviceAdminReceiver()
