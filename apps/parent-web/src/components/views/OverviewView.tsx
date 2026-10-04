import type { CSSProperties } from "react";
import {
  ArrowRight, Battery, BatteryCharging, Check, Clock3, Database, EyeOff, LayoutGrid, ShieldCheck,
} from "lucide-react";
import {
  byApp, byCategory, dailyTotals, totalForDay, type ObservationData,
} from "../../lib/observation";
import {
  appLabelOf, categoryColor, categoryLabel, fmtBytes, fmtDayLabel,
  fmtDuration, fmtDurationShort, shiftDay,
} from "../../lib/format";
import { useDailyLimits } from "../../lib/rules";
import { Trans, useI18n } from "../../i18n";
import { Bars, CategoryList, Donut, type Slice } from "../charts/ChartKit";
import { CardHead, EmptyState, Meter, Tile } from "../Ui";
import { appCategoryIcon, ic, icSm } from "../icons";
import type { Child } from "../../lib/types";
import type { View } from "../Dashboard";

export function OverviewView({ obs, child, onNavigate }: {
  obs: ObservationData;
  child: Child;
  onNavigate: (v: View) => void;
}) {
  const { t, fmt } = useI18n();
  const { usage, inventory, status, devices, anchorDay } = obs;
  const today = anchorDay;                 // jour de référence issu des données
  const todayMs = totalForDay(usage, today);
  const { limitFor } = useDailyLimits(child.id);

  // --- Tendance « vs hier » : seulement si la veille a des données RÉELLES.
  const yesterday = shiftDay(anchorDay, -1);
  const hasYesterday = usage.some((u) => u.day === yesterday);
  const diffMs = hasYesterday ? todayMs - totalForDay(usage, yesterday) : null;

  // --- 7 jours + limite quotidienne de chaque jour (si une limite existe).
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(anchorDay, -(6 - i)));
  const totals = dailyTotals(usage, days);
  const limitsMs = days.map((d) => { const m = limitFor(d); return m == null ? null : m * 60_000; });
  const hasLimit = limitsMs.some((l) => l != null);
  const barData: Slice[] = days.map((d, i) => ({
    key: d, label: fmtDayLabel(d), value: totals[i], color: "var(--chart-bar)",
    tick: fmt.date(new Date(d + "T00:00:00"), { weekday: "short" }),
  }));
  const daysWithData = totals.filter((v) => v > 0).length;
  const avg = daysWithData > 0 ? totals.reduce((s, v) => s + v, 0) / daysWithData : 0;
  const exceeded = hasLimit ? totals.filter((v, i) => limitsMs[i] != null && v > limitsMs[i]!).length : 0;
  const constantLimit = hasLimit && limitsMs.every((l) => l === limitsMs[0]) ? limitsMs[0] : null;

  // --- Catégories du jour.
  const catMap = byCategory(usage, today, today);
  const catSlices: Slice[] = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat, ms]) => ({ key: cat, label: categoryLabel(cat), value: ms, color: categoryColor(cat) }));

  const topApps = byApp(usage, today, today).slice(0, 5);
  const topMax = Math.max(1, ...topApps.map((a) => a.ms));

  // --- État de l'appareil (dernier relevé d'un appareil ACTIF).
  const liveDevices = devices.filter((d) => !d.revoked_at);
  const liveIds = new Set(liveDevices.map((d) => d.id));
  const st = status.find((s) => liveIds.has(s.device_id)) ?? null;
  const storageUsed = st?.storage_total_bytes && st?.storage_free_bytes != null
    ? st.storage_total_bytes - st.storage_free_bytes : null;
  const activeApps = inventory.filter((a) => !a.removed_at);
  const lastInstalled = activeApps
    .filter((a) => a.installed_at && !a.is_system)
    .sort((a, b) => (b.installed_at ?? "").localeCompare(a.installed_at ?? ""))[0] ?? null;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <section className="grid cols-4" aria-label={t("views.overview.tilesLabel")}>
        <Tile label={t("views.overview.tiles.screenTimeToday")} value={fmtDuration(todayMs)} icon={Clock3} tone="accent"
          foot={diffMs != null && (
            <span className={`trend ${diffMs < 0 ? "down" : diffMs > 0 ? "up" : "flat"}`}>
              {diffMs === 0 ? t("views.overview.trend.same")
                : t(diffMs < 0 ? "views.overview.trend.less" : "views.overview.trend.more", { duration: fmtDuration(Math.abs(diffMs)) })}
            </span>
          )} />
        <Tile label={t("views.overview.tiles.installedApps")} value={activeApps.length || t("common.none")} icon={LayoutGrid} tone="plum"
          foot={lastInstalled && t("views.overview.tiles.lastInstalled", {
            app: appLabelOf(lastInstalled.app_label, lastInstalled.package_name),
            date: fmt.date(lastInstalled.installed_at!, { day: "numeric", month: "short" }),
          })} />
        <Tile label={t("views.overview.tiles.battery")} icon={st?.is_charging ? BatteryCharging : Battery} tone="sage"
          value={st?.battery_level != null ? t("views.overview.tiles.batteryValue", { level: st.battery_level }) : t("common.none")}
          foot={st?.battery_level != null && (
            <>
              <Meter value={st.battery_level} max={100} color="var(--c-good)" />
              {st.is_charging != null && (
                <span>{st.is_charging ? t("views.overview.tiles.charging") : t("views.overview.tiles.notCharging")}</span>
              )}
            </>
          )} />
        <Tile label={t("views.overview.tiles.freeStorage")} value={fmtBytes(st?.storage_free_bytes ?? null)} icon={Database} tone="sand"
          foot={st && storageUsed != null && st.storage_total_bytes ? (
            <>
              <Meter value={storageUsed} max={st.storage_total_bytes} color="var(--c-plum)" />
              <span>{t("views.overview.storage.used", { used: fmtBytes(storageUsed), total: fmtBytes(st.storage_total_bytes) })}</span>
            </>
          ) : null} />
      </section>

      <div className="grid dash-wide">
        <section className="card" aria-labelledby="ov-7d">
          <CardHead id="ov-7d" title={t("views.overview.last7Days")}
            sub={avg > 0 ? t("views.overview.averagePerDay", { avg: fmtDuration(avg) }) : undefined}
            action={totals.some((v) => v > 0) && (
              <div className="legend" style={{ marginTop: 0 }}>
                <span className="it"><span className="sw" style={{ background: "var(--c-accent)" }} />{t("views.overview.legend.today")}</span>
                <span className="it"><span className="sw" style={{ background: "var(--chart-bar)" }} />{t("views.overview.legend.previousDays")}</span>
                {hasLimit && <span className="it"><span className="sw" style={{ background: "var(--chart-bar-over)" }} />{t("views.overview.legend.overLimit")}</span>}
                {hasLimit && <span className="it"><span className="sw-line" />{t("views.overview.legend.dailyLimit")}</span>}
              </div>
            )} />
          {totals.some((v) => v > 0) ? (
            <>
              <Bars data={barData} fmt={fmtDuration} valueFmt={fmtDurationShort} highlightKey={today}
                limits={hasLimit ? limitsMs : undefined}
                limitLabel={constantLimit != null ? <Trans k="views.overview.limitLabel" params={{ value: fmtDuration(constantLimit) }}
                  tags={{ l: (c) => <span style={{ display: "block" }}>{c}</span> }} /> : undefined} />
              {hasLimit && (
                <p className="card-sub" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--c-divider)" }}>
                  {exceeded > 0 ? t("views.overview.limitExceeded", { count: exceeded }) : t("views.overview.limitNeverExceeded")}
                </p>
              )}
            </>
          ) : <EmptyState icon={Clock3} title={t("views.overview.noScreenTimeTitle")}
                hint={t("views.overview.noScreenTimeHint")} />}
        </section>

        <section className="card" aria-labelledby="ov-cat">
          <CardHead id="ov-cat" title={t("views.overview.todayByCategory")} sub={t("views.overview.categorySubtitle")} />
          {catSlices.length > 0 ? (
            <>
              <Donut data={catSlices} fmt={fmtDuration}
                center={{ primary: fmtDuration(todayMs), secondary: t("views.overview.donutTotal") }} />
              <CategoryList items={catSlices} fmt={fmtDuration} />
            </>
          ) : <EmptyState icon={LayoutGrid} title={t("views.overview.noActivityToday")} />}
        </section>
      </div>

      <div className="grid dash-wide">
        <section className="card" aria-labelledby="ov-apps">
          <CardHead id="ov-apps" title={t("views.overview.topAppsToday")} sub={t("views.overview.topAppsSubtitle")}
            action={<button type="button" className="link" onClick={() => onNavigate("apps")}>
              {t("views.overview.seeAllApps")}<ArrowRight {...icSm} />
            </button>} />
          {topApps.length === 0 ? <EmptyState icon={LayoutGrid} title={t("views.overview.noActivityToday")} /> : (
            <ul className="app-list">
              {topApps.map((a) => {
                const Icon = appCategoryIcon(a.category);
                const color = categoryColor(a.category);
                return (
                  <li key={a.packageName}>
                    <span className="app-ic" style={{ "--ic-color": color } as CSSProperties}><Icon {...ic} /></span>
                    <span className="nm-wrap">
                      <span className="nm">{appLabelOf(a.label, a.packageName)}</span>
                      <span className="meta">{categoryLabel(a.category)}</span>
                    </span>
                    <span className="bar-track" aria-hidden="true">
                      <span style={{ width: `${Math.max((a.ms / topMax) * 100, 3)}%`, background: color }} />
                    </span>
                    <span className="dur">{fmtDuration(a.ms)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <TransparencyCard name={child.display_name} active={liveDevices.length > 0}
          onPrivacy={() => onNavigate("privacy")} />
      </div>
    </div>
  );
}

/** Carte de transparence : ce que le parent voit / ne voit JAMAIS. */
function TransparencyCard({ name, active, onPrivacy }: { name: string; active: boolean; onPrivacy: () => void }) {
  const { t } = useI18n();
  const see = ["usage", "device", "calls"] as const;
  return (
    <section className="transparency" aria-labelledby="ov-transparency">
      <div className="t-head">
        <span className="t-ic"><ShieldCheck {...ic} size={22} /></span>
        <div>
          <h2 id="ov-transparency">
            {active ? t("views.overview.transparency.title", { name }) : t("views.overview.transparency.titleNoDevice", { name })}
          </h2>
          <p className="t-sub">{t("views.overview.transparency.subtitle", { name })}</p>
        </div>
      </div>
      <div>
        <p className="t-kicker yes">{t("views.overview.transparency.youSee")}</p>
        <ul>
          {see.map((k) => (
            <li key={k} className="yes"><Check {...icSm} size={18} />{t(`views.overview.transparency.see.${k}`)}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="t-kicker no">{t("views.overview.transparency.youNeverSee")}</p>
        <ul>
          <li className="no"><EyeOff {...icSm} size={18} />{t("views.overview.transparency.never.content")}</li>
          <li className="no"><EyeOff {...icSm} size={18} />{t("views.overview.transparency.never.files", { name })}</li>
        </ul>
      </div>
      <button type="button" className="link" onClick={onPrivacy}>
        {t("views.overview.transparency.link")}<ArrowRight {...icSm} />
      </button>
    </section>
  );
}
