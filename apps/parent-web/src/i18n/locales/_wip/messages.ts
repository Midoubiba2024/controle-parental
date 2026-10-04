// Fragment temporaire (fusionné dans fr.ts en fin de lot) — namespace views.messages
export default {
  // {name} = prénom de l'enfant ; <muted>…</muted> = partie atténuée du titre.
  title: "Messages <muted>avec {name}</muted>",
  intro: "Messagerie interne, visible par l'enfant. On n'accède jamais à ses autres applications de messagerie.",
  emptyTitle: "Aucun message",
  emptyHint: "Écrivez un premier mot — il apparaîtra sur l'appareil de l'enfant.",
  // Horodatage d'un message du parent déjà lu par l'enfant ; {date} = date/heure.
  sentAtRead: "{date} · lu",
  placeholder: "Écrire un message…",
  send: "Envoyer",
} as const;
