import { useState } from "react";
import {
  byApp, byCategory, dailyTotals, pctDelta, totalInRange, type ObservationData,
} from "../../lib/observation";
import {
  appLabelOf, categoryColor, categoryLabel, dayTick, fmtDayLabel, fmtDuration, fmtDurationShort, shiftDay,
} from "../../lib/format";
import { useI18n } from "../../i18n";
import { CalendarDays, ChartColumn, ChartPie, MousePointerClick, Timer } from "lucide-react";
import { Bars, CategoryList, Donut, HBars, type Slice } from "../charts/ChartKit";
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
    // Libellé complet (aria-label, infobulle) + graduation courte de l'axe.
    key: d, label: fmtDayLabel(d), tick: dayTick(d, period, i),
    value: totals[i], color: "var(--chart-bar)",
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
    <div className="stack" style={{ gap: 20 }}>
      <div className="row">
        <div className="seg" role="group" aria-label={t("views.screenTime.dailyTrend")}>
          <button type="button" className={period === 7 ? "on" : ""} aria-pressed={period === 7} onClick={() => setPeriod(7)}>{t("views.screenTime.periodDays", { count: 7 })}</button>
          <button type="button" className={period === 30 ? "on" : ""} aria-pressed={period === 30} onClick={() => setPeriod(30)}>{t("views.screenTime.periodDays", { count: 30 })}</button>
        </div>
      </div>

      <div className="grid cols-3">
        <Tile label={t("views.screenTime.tiles.total", { days: period })} value={fmtDuration(total)} icon={Timer}
          tone="accent" delta={{ pct: delta }} />
        <Tile label={t("views.screenTime.tiles.averagePerDay")} value={fmtDuration(avgPerDay)} icon={CalendarDays}
          tone="plum" />
        <Tile label={t("views.screenTime.tiles.appLaunches")} value={totalLaunches || t("common.none")} icon={MousePointerClick}
          tone="sand" />
      </div>

      <div className="card">
        <h2>{t("views.screenTime.dailyTrend")}</h2>
        {hasData ? <Bars data={barData} fmt={fmtDuration} valueFmt={fmtDurationShort} highlightKey={to} />
          : <EmptyState icon={ChartColumn} title={t("views.screenTime.noDataInPeriod")} />}
      </div>

      <div className="grid dash">
        <div className="card">
          <h2>{t("views.screenTime.byCategory")}</h2>
          {catSlices.length > 0 ? (
            <>
              <Donut data={catSlices} fmt={fmtDuration}
                center={{ primary: fmtDuration(total), secondary: t("views.screenTime.periodDays", { count: period }) }} />
              <CategoryList items={catSlices} fmt={fmtDuration} />
            </>
          ) : <EmptyState icon={ChartPie} title={t("views.screenTime.noActivity")} />}
        </div>
        <div className="card">
          <h2>{t("views.screenTime.topApps")}</h2>
          <HBars data={appSlices} fmt={fmtDuration} maxRows={10} />
        </div>
      </div>
    </div>
  );
}
