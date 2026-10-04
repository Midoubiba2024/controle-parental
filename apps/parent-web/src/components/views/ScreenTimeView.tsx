import { useState } from "react";
import {
  byApp, byCategory, dailyTotals, pctDelta, totalInRange, type ObservationData,
} from "../../lib/observation";
import {
  appLabelOf, categoryColor, categoryLabel, fmtDayLabel, fmtDuration, fmtDurationShort, shiftDay,
} from "../../lib/format";
import { useI18n } from "../../i18n";
import { Bars, Donut, HBars, Legend, type Slice } from "../charts/ChartKit";
import { EmptyState, Tile } from "../Ui";

export function ScreenTimeView({ obs }: { obs: ObservationData }) {
  const { t } = useI18n();
  const { usage, anchorDay } = obs;
  const [period, setPeriod] = useState<7 | 30>(7);

  // Plages dérivées du jour de référence (données), pas du fuseau navigateur.
  const to = anchorDay;
  const from = shiftDay(anchorDay, -(period - 1));
  const prevTo = shiftDay(anchorDay, -period);
  const prevFrom = shiftDay(anchorDay, -(period * 2 - 1));

  const total = totalInRange(usage, from, to);
  const prevTotal = totalInRange(usage, prevFrom, prevTo);
  const delta = pctDelta(total, prevTotal);
  const avgPerDay = Math.round(total / period);

  const days = Array.from({ length: period }, (_, i) => shiftDay(anchorDay, -(period - 1 - i)));
  const totals = dailyTotals(usage, days);
  const barData: Slice[] = days.map((d, i) => ({
    key: d, label: period <= 7 ? fmtDayLabel(d) : (i % 3 === 0 ? d.slice(8) : ""),
    value: totals[i], color: "var(--series-1)",
  }));

  const catMap = byCategory(usage, from, to);
  const catSlices: Slice[] = [...catMap.entries()].sort((a, b) => b[1] - a[1])
    .map(([cat, ms]) => ({ key: cat, label: categoryLabel(cat), value: ms, color: categoryColor(cat) }));

  const apps = byApp(usage, from, to);
  const appSlices: Slice[] = apps.slice(0, 10).map((a) => ({
    key: a.packageName, label: appLabelOf(a.label, a.packageName), value: a.ms, color: categoryColor(a.category),
  }));
  const totalLaunches = apps.reduce((s, a) => s + a.launches, 0);

  const hasData = total > 0;

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="row">
        <div className="seg">
          <button className={period === 7 ? "on" : ""} onClick={() => setPeriod(7)}>{t("views.screenTime.periodDays", { count: 7 })}</button>
          <button className={period === 30 ? "on" : ""} onClick={() => setPeriod(30)}>{t("views.screenTime.periodDays", { count: 30 })}</button>
        </div>
      </div>

      <div className="grid cols-3">
        <Tile label={t("views.screenTime.tiles.total", { days: period })} value={fmtDuration(total)} icon="⏱"
          iconBg="color-mix(in srgb, var(--primary) 18%, transparent)" delta={{ pct: delta }} />
        <Tile label={t("views.screenTime.tiles.averagePerDay")} value={fmtDuration(avgPerDay)} icon="📅"
          iconBg="color-mix(in srgb, var(--series-3) 18%, transparent)" />
        <Tile label={t("views.screenTime.tiles.appLaunches")} value={totalLaunches || t("common.none")} icon="👆"
          iconBg="color-mix(in srgb, var(--series-5) 20%, transparent)" />
      </div>

      <div className="card">
        <h2>{t("views.screenTime.dailyTrend")}</h2>
        {hasData ? <Bars data={barData} fmt={fmtDuration} highlightKey={to} />
          : <EmptyState icon="📈" title={t("views.screenTime.noDataInPeriod")} />}
      </div>

      <div className="grid dash">
        <div className="card">
          <h2>{t("views.screenTime.byCategory")}</h2>
          {catSlices.length > 0 ? (
            <>
              <Donut data={catSlices} fmt={fmtDuration}
                center={{ primary: fmtDurationShort(total), secondary: t("views.screenTime.periodDays", { count: period }) }} />
              <Legend items={catSlices.map((s) => ({ label: s.label, color: s.color }))} />
            </>
          ) : <EmptyState icon="🍩" title={t("views.screenTime.noActivity")} />}
        </div>
        <div className="card">
          <h2>{t("views.screenTime.topApps")}</h2>
          <HBars data={appSlices} fmt={fmtDuration} maxRows={10} />
        </div>
      </div>
    </div>
  );
}
