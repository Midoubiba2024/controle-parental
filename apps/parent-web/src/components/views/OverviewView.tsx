import {
  byApp, byCategory, dailyTotals, pctDelta, totalForDay, type ObservationData,
} from "../../lib/observation";
import {
  appLabelOf, categoryColor, categoryLabel, dayKey, fmtBytes, fmtDayLabel,
  fmtDuration, fmtDurationShort,
} from "../../lib/format";
import { Bars, Donut, HBars, Legend, type Slice } from "../charts/ChartKit";
import { EmptyState, Meter, Tile } from "../Ui";

export function OverviewView({ obs }: { obs: ObservationData }) {
  const { usage, inventory, status } = obs;
  const today = dayKey(0);
  const yesterday = dayKey(1);
  const todayMs = totalForDay(usage, today);
  const dayPct = pctDelta(todayMs, totalForDay(usage, yesterday));

  const days = Array.from({ length: 7 }, (_, i) => dayKey(6 - i));
  const totals = dailyTotals(usage, days);
  const barData: Slice[] = days.map((d, i) => ({
    key: d, label: fmtDayLabel(d), value: totals[i], color: "var(--series-1)",
  }));

  const catMap = byCategory(usage, today, today);
  const catSlices: Slice[] = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat, ms]) => ({ key: cat, label: categoryLabel(cat), value: ms, color: categoryColor(cat) }));

  const topApps = byApp(usage, today, today).slice(0, 7);
  const appSlices: Slice[] = topApps.map((a) => ({
    key: a.packageName, label: appLabelOf(a.label, a.packageName), value: a.ms, color: categoryColor(a.category),
  }));

  const st = status[0];
  const storageUsed = st?.storage_total_bytes && st?.storage_free_bytes != null
    ? st.storage_total_bytes - st.storage_free_bytes : null;
  const activeApps = inventory.filter((a) => !a.removed_at).length;

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="grid cols-4">
        <Tile label="Temps d'écran aujourd'hui" value={fmtDuration(todayMs)} icon="⏱"
          iconBg="color-mix(in srgb, var(--primary) 18%, transparent)"
          delta={{ pct: dayPct }} />
        <Tile label="Applications installées" value={activeApps || "—"} icon="📱"
          iconBg="color-mix(in srgb, var(--series-3) 18%, transparent)" />
        <Tile label="Batterie" value={st?.battery_level != null ? `${st.battery_level}%` : "—"}
          icon={st?.is_charging ? "⚡" : "🔋"}
          iconBg="color-mix(in srgb, var(--series-4) 20%, transparent)" />
        <Tile label="Stockage libre" value={fmtBytes(st?.storage_free_bytes ?? null)} icon="💾"
          iconBg="color-mix(in srgb, var(--series-7) 18%, transparent)" />
      </div>

      <div className="grid dash">
        <div className="card">
          <h2>7 derniers jours</h2>
          {totals.some((t) => t > 0)
            ? <Bars data={barData} fmt={fmtDuration} highlightKey={today} />
            : <EmptyState icon="📊" title="Pas encore de données de temps d'écran"
                hint="Elles apparaîtront après l'activation de l'accès à l'usage sur l'appareil." />}
        </div>

        <div className="card">
          <h2>Aujourd'hui par catégorie</h2>
          {catSlices.length > 0 ? (
            <>
              <Donut data={catSlices} fmt={fmtDuration}
                center={{ primary: fmtDurationShort(todayMs), secondary: "aujourd'hui" }} />
              <Legend items={catSlices.map((s) => ({ label: s.label, color: s.color }))} />
            </>
          ) : <EmptyState icon="🍩" title="Aucune activité aujourd'hui" />}
        </div>
      </div>

      <div className="card">
        <h2>Applications les plus utilisées aujourd'hui</h2>
        <HBars data={appSlices} fmt={fmtDuration} />
      </div>

      {st && storageUsed != null && st.storage_total_bytes && (
        <div className="card">
          <h2>Stockage de l'appareil</h2>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted small">{fmtBytes(storageUsed)} utilisés sur {fmtBytes(st.storage_total_bytes)}</span>
            <span className="muted small">{fmtBytes(st.storage_free_bytes)} libres</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <Meter value={storageUsed} max={st.storage_total_bytes} color="var(--series-7)" />
          </div>
        </div>
      )}
    </div>
  );
}
