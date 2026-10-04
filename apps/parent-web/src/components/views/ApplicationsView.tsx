import { useMemo, useState, type CSSProperties } from "react";
import { Blocks, Search } from "lucide-react";
import { byApp, dailyTotals, totalInRange, type ObservationData } from "../../lib/observation";
import {
  appInitials, appLabelOf, categoryColor, categoryLabel, dayTick, fmtDateTime, fmtDayLabel,
  fmtDuration, shiftDay,
} from "../../lib/format";
import { Trans, useI18n } from "../../i18n";
import { Bars, type Slice } from "../charts/ChartKit";
import { EmptyState, useShowMore } from "../Ui";
import { icSm } from "../icons";
import type { AppInventory } from "../../lib/types";

type Period = 7 | 30;
const PERIODS: Period[] = [7, 30];
const LIST_LIMIT = 10;

export function ApplicationsView({ obs }: { obs: ObservationData }) {
  const { t } = useI18n();
  const { inventory, usage, anchorDay } = obs;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  // Période PARTAGÉE par la liste et le détail (mêmes chiffres des deux côtés).
  const [period, setPeriod] = useState<Period>(7);

  const from = shiftDay(anchorDay, -(period - 1));
  const to = anchorDay;

  const usageByPkg = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of byApp(usage, from, to)) m.set(a.packageName, a.ms);
    return m;
  }, [usage, from, to]);

  const apps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...inventory]
      .filter((a) => !a.removed_at)
      .filter((a) => !q || appLabelOf(a.app_label, a.package_name).toLowerCase().includes(q)
        || a.package_name.toLowerCase().includes(q))
      .sort((a, b) => (usageByPkg.get(b.package_name) ?? 0) - (usageByPkg.get(a.package_name) ?? 0)
        || appLabelOf(a.app_label, a.package_name).localeCompare(appLabelOf(b.app_label, b.package_name)));
  }, [inventory, query, usageByPkg]);

  const { visible, button, truncated } = useShowMore(apps, LIST_LIMIT);
  const current = apps.find((a) => a.package_name === selected) ?? apps[0] ?? null;

  if (inventory.length === 0) {
    return <div className="card"><EmptyState icon={Blocks}
      title={t("views.applications.emptyTitle")}
      hint={t("views.applications.emptyHint")} /></div>;
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row">
        <div className="seg" role="group" aria-label={t("views.applications.listPeriod", { count: period })}>
          {PERIODS.map((p) => (
            <button key={p} type="button" className={period === p ? "on" : ""} aria-pressed={period === p}
              onClick={() => setPeriod(p)}>{t("views.screenTime.periodDays", { count: p })}</button>
          ))}
        </div>
      </div>

      <div className="grid dash">
        <div className="card">
          <h2 style={{ marginBottom: 2 }}><Trans k="views.applications.listTitle" params={{ count: apps.length }}
            tags={{ muted: (c) => <span className="muted small">{c}</span> }} /></h2>
          <p className="card-sub" style={{ margin: "0 0 12px" }}>{t("views.applications.listPeriod", { count: period })}</p>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search {...icSm} size={18} style={{ position: "absolute", insetInlineStart: 14, insetBlockStart: 14, color: "var(--c-muted)" }} />
            <input type="search" aria-label={t("views.applications.searchPlaceholder")} placeholder={t("views.applications.searchPlaceholder")} value={query}
              onChange={(e) => setQuery(e.target.value)} style={{ width: "100%", paddingInlineStart: 42 }} />
          </div>
          <div className={truncated ? "truncated" : undefined}>
            {visible.map((a) => {
              const ms = usageByPkg.get(a.package_name) ?? 0;
              const active = current?.package_name === a.package_name;
              return (
                <button key={a.id} type="button" className={`app-row ${active ? "active" : ""}`}
                  aria-pressed={active} onClick={() => setSelected(a.package_name)}>
                  <span className="app-ic sm" aria-hidden="true" style={{ "--ic-color": categoryColor(a.category) } as CSSProperties}>
                    {appInitials(a.app_label, a.package_name)}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <div className="nm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {appLabelOf(a.app_label, a.package_name)}
                    </div>
                    <div className="meta">
                      {a.is_system
                        ? t("views.applications.categorySystem", { category: categoryLabel(a.category) })
                        : categoryLabel(a.category)}
                    </div>
                  </span>
                  <span className="dur">{ms > 0 ? fmtDuration(ms) : t("common.none")}</span>
                </button>
              );
            })}
          </div>
          {button}
          {apps.length === 0 && <EmptyState title={t("views.applications.noMatch")} />}
        </div>

        {current && <AppDetail app={current} usage={usage} anchorDay={anchorDay} period={period} />}
      </div>
    </div>
  );
}

function AppDetail({ app, usage, anchorDay, period }: {
  app: AppInventory; usage: ObservationData["usage"]; anchorDay: string; period: Period;
}) {
  const { t, fmt } = useI18n();
  const to = anchorDay;
  const from = shiftDay(anchorDay, -(period - 1));
  const pkgUsage = useMemo(() => usage.filter((u) => u.package_name === app.package_name), [usage, app.package_name]);
  const days = Array.from({ length: period }, (_, i) => shiftDay(anchorDay, -(period - 1 - i)));
  const totals = dailyTotals(pkgUsage, days);
  const bars: Slice[] = days.map((d, i) => ({
    key: d, label: fmtDayLabel(d), tick: dayTick(d, period, i), value: totals[i], color: "var(--chart-bar)",
  }));
  const total = totalInRange(pkgUsage, from, to);
  const launches = pkgUsage.filter((u) => u.day >= from && u.day <= to).reduce((s, u) => s + u.launch_count, 0);
  const lastUsedList = pkgUsage.map((u) => u.last_used_at).filter(Boolean).sort();
  const lastUsed = lastUsedList.length ? lastUsedList[lastUsedList.length - 1] : null;

  return (
    <div className="card">
      <div className="row" style={{ gap: 14, flexWrap: "nowrap" }}>
        <span className="app-ic lg" aria-hidden="true" style={{ "--ic-color": categoryColor(app.category) } as CSSProperties}>
          {appInitials(app.app_label, app.package_name)}
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ marginBottom: 2, overflowWrap: "anywhere" }}>{appLabelOf(app.app_label, app.package_name)}</h2>
          <div className="muted small" style={{ overflowWrap: "anywhere" }}>{app.package_name}</div>
        </div>
      </div>

      <div className="row" style={{ gap: 8, margin: "14px 0 4px" }}>
        <span className="badge"><span className="sw" style={{ background: categoryColor(app.category) }} />{categoryLabel(app.category)}</span>
        {app.is_system && <span className="badge">{t("views.applications.detail.systemApp")}</span>}
        {app.installed_at && <span className="badge">{t("views.applications.detail.installedOn", {
          date: fmt.date(app.installed_at, { day: "numeric", month: "long", year: "numeric" }),
        })}</span>}
      </div>

      <div className="grid cols-2" style={{ margin: "14px 0" }}>
        <div className="panel"><div className="tile-label">{t("views.applications.detail.time", { count: period })}</div><div className="tile-value" style={{ fontSize: 26 }}>{fmtDuration(total)}</div></div>
        <div className="panel"><div className="tile-label">{t("views.applications.detail.launches", { count: period })}</div><div className="tile-value" style={{ fontSize: 26 }}>{launches ? fmt.number(launches) : t("common.none")}</div></div>
      </div>

      <h3>{t("views.applications.detail.usage", { count: period })}</h3>
      {total > 0 ? <Bars data={bars} fmt={fmtDuration} height={160} highlightKey={to} />
        : <EmptyState title={t("views.applications.detail.noUsage")} />}

      {lastUsed && <p className="muted small" style={{ marginTop: 12 }}>
        {t("views.applications.detail.lastUsed", { date: fmtDateTime(lastUsed) })}
      </p>}
    </div>
  );
}
