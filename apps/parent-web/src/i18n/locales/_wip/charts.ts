// Fragment temporaire (fusionné dans fr.ts en fin de lot) — namespace views.charts
export default {
  // aria-label du graphique en anneau ; {total} = total déjà formaté (ex. « 2 h 35 »).
  donutAriaLabel: "Répartition : total {total}",
  // Infobulles au survol : <k>…</k> = libellé atténué, <v>…</v> = valeur mise en avant.
  tooltip: "<k>{label} · </k><v>{value}</v>",
  tooltipWithPercent: "<k>{label} · </k><v>{value}</v><k> ({pct}%)</k>",
  noData: "Aucune donnée.",
} as const;
