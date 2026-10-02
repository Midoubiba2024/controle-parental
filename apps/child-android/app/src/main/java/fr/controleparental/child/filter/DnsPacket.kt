package fr.controleparental.child.filter

/**
 * LOT 4 — Encodage/décodage MINIMAL de paquets DNS et d'enveloppes IPv4/UDP, pour
 * le resolver userspace du VpnService (sinkhole DNS local).
 *
 * Périmètre volontairement restreint (tranche 1) : IPv4 + UDP/53, question
 * unique (cas ultra-majoritaire). Tout ce qui sort de ce cadre est laissé passer
 * / ignoré (fail-open) pour ne JAMAIS casser la connectivité. On ne lit que l'EN-
 * TÊTE de la requête (nom demandé) : aucune inspection de contenu applicatif.
 */
object DnsPacket {

    data class Question(val name: String, val qtype: Int, val questionEnd: Int)

    /** Lit la première question d'un message DNS. Null si illisible. */
    fun parseQuestion(dns: ByteArray): Question? {
        if (dns.size < 12) return null
        val qd = u16(dns, 4)
        if (qd < 1) return null
        var i = 12
        val sb = StringBuilder()
        while (i < dns.size) {
            val len = dns[i].toInt() and 0xFF
            if (len == 0) { i += 1; break }
            if (len and 0xC0 != 0) return null          // compression interdite en question
            if (i + 1 + len > dns.size) return null
            if (sb.isNotEmpty()) sb.append('.')
            for (j in 0 until len) sb.append((dns[i + 1 + j].toInt() and 0xFF).toChar())
            i += 1 + len
        }
        if (i + 4 > dns.size) return null
        val qtype = u16(dns, i)
        return Question(sb.toString(), qtype, i + 4)
    }

    /** Réponse NXDOMAIN (domaine bloqué) : question renvoyée, RCODE=3, 0 réponse. */
    fun buildNxDomain(query: ByteArray, q: Question): ByteArray {
        val out = query.copyOf(q.questionEnd)
        out[2] = (query[2].toInt() or 0x80).toByte()    // QR=1, opcode & RD conservés
        out[3] = 0x83.toByte()                          // RA=1, RCODE=3 (NXDOMAIN)
        setU16(out, 6, 0); setU16(out, 8, 0); setU16(out, 10, 0) // AN/NS/AR = 0
        return out
    }

    /** Réponse CNAME (réécriture SafeSearch/YouTube) : question → [target]. */
    fun buildCname(query: ByteArray, q: Question, target: String): ByteArray {
        val base = query.copyOf(q.questionEnd)
        base[2] = (query[2].toInt() or 0x80).toByte()   // QR=1
        base[3] = 0x80.toByte()                         // RA=1, RCODE=0
        setU16(base, 6, 1)                              // ANCOUNT = 1
        setU16(base, 8, 0); setU16(base, 10, 0)

        val rdata = encodeName(target)
        val answer = ByteArray(12 + rdata.size)
        answer[0] = 0xC0.toByte(); answer[1] = 0x0C.toByte()   // pointeur vers la question (offset 12)
        setU16(answer, 2, 5)                                   // TYPE = CNAME
        setU16(answer, 4, 1)                                   // CLASS = IN
        answer[6] = 0; answer[7] = 0; answer[8] = 0x01.toByte(); answer[9] = 0x2C.toByte() // TTL = 300
        setU16(answer, 10, rdata.size)                         // RDLENGTH
        System.arraycopy(rdata, 0, answer, 12, rdata.size)
        return base + answer
    }

    private fun encodeName(name: String): ByteArray {
        val out = ArrayList<Byte>()
        for (label in name.split('.')) {
            if (label.isEmpty()) continue
            out.add(label.length.toByte())
            for (c in label) out.add(c.code.toByte())
        }
        out.add(0.toByte())
        return out.toByteArray()
    }

    fun u16(b: ByteArray, off: Int): Int = ((b[off].toInt() and 0xFF) shl 8) or (b[off + 1].toInt() and 0xFF)
    private fun setU16(b: ByteArray, off: Int, v: Int) {
        b[off] = ((v ushr 8) and 0xFF).toByte(); b[off + 1] = (v and 0xFF).toByte()
    }
}

/**
 * Enveloppe IPv4 + UDP. Lecture des paquets sortants depuis le TUN et
 * fabrication des réponses à réinjecter.
 */
object IpUdp {

    data class Datagram(
        val srcIp: ByteArray, val dstIp: ByteArray,
        val srcPort: Int, val dstPort: Int,
        val payload: ByteArray,
    )

    /** Décode un paquet IPv4/UDP. Null si ce n'est pas de l'IPv4/UDP exploitable. */
    fun parse(packet: ByteArray, length: Int): Datagram? {
        if (length < 28) return null
        if ((packet[0].toInt() and 0xF0) != 0x40) return null   // IPv4 seulement
        val ihl = (packet[0].toInt() and 0x0F) * 4
        if (ihl < 20 || ihl + 8 > length) return null
        if (packet[9].toInt() and 0xFF != 17) return null       // UDP seulement
        val srcIp = packet.copyOfRange(12, 16)
        val dstIp = packet.copyOfRange(16, 20)
        val srcPort = DnsPacket.u16(packet, ihl)
        val dstPort = DnsPacket.u16(packet, ihl + 2)
        val udpLen = DnsPacket.u16(packet, ihl + 4)
        val payloadEnd = minOf(length, ihl + udpLen)
        if (ihl + 8 > payloadEnd) return null
        val payload = packet.copyOfRange(ihl + 8, payloadEnd)
        return Datagram(srcIp, dstIp, srcPort, dstPort, payload)
    }

    /**
     * Construit un paquet IPv4/UDP de [srcIp]:[srcPort] vers [dstIp]:[dstPort]
     * portant [payload] (réponse DNS). Checksum IP calculé ; checksum UDP mis à 0
     * (autorisé en IPv4). Pour une réponse, src = serveur DNS virtuel, dst = client.
     */
    fun build(srcIp: ByteArray, srcPort: Int, dstIp: ByteArray, dstPort: Int, payload: ByteArray): ByteArray {
        val udpLen = 8 + payload.size
        val total = 20 + udpLen
        val b = ByteArray(total)
        b[0] = 0x45.toByte()                 // version 4, IHL 5
        b[1] = 0
        setU16(b, 2, total)                  // longueur totale
        setU16(b, 4, 0)                      // identification
        setU16(b, 6, 0x4000)                 // flags: DF
        b[8] = 64                            // TTL
        b[9] = 17                            // protocole UDP
        setU16(b, 10, 0)                     // checksum (calculé ensuite)
        System.arraycopy(srcIp, 0, b, 12, 4)
        System.arraycopy(dstIp, 0, b, 16, 4)
        setU16(b, 10, checksum(b, 0, 20))    // checksum d'en-tête IP

        setU16(b, 20, srcPort)
        setU16(b, 22, dstPort)
        setU16(b, 24, udpLen)
        setU16(b, 26, 0)                     // checksum UDP = 0 (optionnel en IPv4)
        System.arraycopy(payload, 0, b, 28, payload.size)
        return b
    }

    private fun checksum(b: ByteArray, off: Int, len: Int): Int {
        var sum = 0L
        var i = off
        while (i < off + len - 1) {
            sum += (((b[i].toInt() and 0xFF) shl 8) or (b[i + 1].toInt() and 0xFF)).toLong()
            i += 2
        }
        if ((len and 1) == 1) sum += ((b[off + len - 1].toInt() and 0xFF) shl 8).toLong()
        while (sum shr 16 != 0L) sum = (sum and 0xFFFF) + (sum shr 16)
        return (sum.inv() and 0xFFFF).toInt()
    }

    private fun setU16(b: ByteArray, off: Int, v: Int) {
        b[off] = ((v ushr 8) and 0xFF).toByte(); b[off + 1] = (v and 0xFF).toByte()
    }
}
