import {
  byApp, byCategory, dailyTotals, totalForDay, type ObservationData,
} from "../../lib/observation";
import {
  appLabelOf, categoryColor, categoryLabel, fmtBytes, fmtDayLabel,
  fmtDuration, fmtDurationShort, shiftDay,
} from "../../lib/format";
import { useI18n } from "../../i18n";
import { Bars, Donut, HBars, Legend, type Slice } from "../charts/ChartKit";
import { EmptyState, Meter, Tile } from "../Ui";

export function OverviewView({ obs }: { obs: ObservationData }) {
  const { t } = useI18n();
  const { usage, inventory, status, anchorDay } = obs;
  const today = anchorDay;                 // jour de référence issu des données
  const todayMs = totalForDay(usage, today);

  const days = Array.from({ length: 7 }, (_, i) => shiftDay(anchorDay, -(6 - i)));
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
        <Tile label={t("views.overview.tiles.screenTimeToday")} value={fmtDuration(todayMs)} icon="⏱"
          iconBg="color-mix(in srgb, var(--primary) 18%, transparent)" />
        <Tile label={t("views.overview.tiles.installedApps")} value={activeApps || t("common.none")} icon="📱"
          iconBg="color-mix(in srgb, var(--series-3) 18%, transparent)" />
        <Tile label={t("views.overview.tiles.battery")}
          value={st?.battery_level != null ? t("views.overview.tiles.batteryValue", { level: st.battery_level }) : t("common.none")}
          icon={st?.is_charging ? "⚡" : "🔋"}
          iconBg="color-mix(in srgb, var(--series-4) 20%, transparent)" />
        <Tile label={t("views.overview.tiles.freeStorage")} value={fmtBytes(st?.storage_free_bytes ?? null)} icon="💾"
          iconBg="color-mix(in srgb, var(--series-7) 18%, transparent)" />
      </div>

      <div className="grid dash">
        <div className="card">
          <h2>{t("views.overview.last7Days")}</h2>
          {totals.some((v) => v > 0)
            ? <Bars data={barData} fmt={fmtDuration} highlightKey={today} />
            : <EmptyState icon="📊" title={t("views.overview.noScreenTimeTitle")}
                hint={t("views.overview.noScreenTimeHint")} />}
        </div>

        <div className="card">
          <h2>{t("views.overview.todayByCategory")}</h2>
          {catSlices.length > 0 ? (
            <>
              <Donut data={catSlices} fmt={fmtDuration}
                center={{ primary: fmtDurationShort(todayMs), secondary: t("views.overview.donutToday") }} />
              <Legend items={catSlices.map((s) => ({ label: s.label, color: s.color }))} />
            </>
          ) : <EmptyState icon="🍩" title={t("views.overview.noActivityToday")} />}
        </div>
      </div>

      <div className="card">
        <h2>{t("views.overview.topAppsToday")}</h2>
        <HBars data={appSlices} fmt={fmtDuration} />
      </div>

      {st && storageUsed != null && st.storage_total_bytes && (
        <div className="card">
          <h2>{t("views.overview.storage.title")}</h2>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted small">{t("views.overview.storage.used", { used: fmtBytes(storageUsed), total: fmtBytes(st.storage_total_bytes) })}</span>
            <span className="muted small">{t("views.overview.storage.free", { free: fmtBytes(st.storage_free_bytes) })}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <Meter value={storageUsed} max={st.storage_total_bytes} color="var(--series-7)" />
          </div>
        </div>
      )}
    </div>
  );
}
