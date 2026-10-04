import { useMemo, useState } from "react";
import { byApp, dailyTotals, totalInRange, type ObservationData } from "../../lib/observation";
import {
  appInitials, appLabelOf, categoryColor, categoryLabel, fmtDayLabel,
  fmtDuration, shiftDay,
} from "../../lib/format";
import { Trans, useI18n } from "../../i18n";
import { Bars, type Slice } from "../charts/ChartKit";
import { EmptyState } from "../Ui";
import type { AppInventory } from "../../lib/types";

// Équivalents de toLocaleDateString() / toLocaleString() (date seule / date + heure).
const DATE_NUMERIC: Intl.DateTimeFormatOptions = { year: "numeric", month: "numeric", day: "numeric" };
const DATE_TIME_FULL: Intl.DateTimeFormatOptions = {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
};

export function ApplicationsView({ obs }: { obs: ObservationData }) {
  const { t } = useI18n();
  const { inventory, usage, anchorDay } = obs;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const from30 = shiftDay(anchorDay, -29);
  const to = anchorDay;

  // Usage (30 j) par package pour trier/afficher même les apps non lançables vues en usage.
  const usageByPkg = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of byApp(usage, from30, to)) m.set(a.packageName, a.ms);
    return m;
  }, [usage, from30, to]);

  const apps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...inventory]
      .filter((a) => !a.removed_at)
      .filter((a) => !q || appLabelOf(a.app_label, a.package_name).toLowerCase().includes(q)
        || a.package_name.toLowerCase().includes(q))
      .sort((a, b) => (usageByPkg.get(b.package_name) ?? 0) - (usageByPkg.get(a.package_name) ?? 0)
        || appLabelOf(a.app_label, a.package_name).localeCompare(appLabelOf(b.app_label, b.package_name)));
  }, [inventory, query, usageByPkg]);

  const current = apps.find((a) => a.package_name === selected) ?? apps[0] ?? null;

  if (inventory.length === 0) {
    return <div className="card"><EmptyState icon="📱"
      title={t("views.applications.emptyTitle")}
      hint={t("views.applications.emptyHint")} /></div>;
  }

  return (
    <div className="grid dash" style={{ gap: 18 }}>
      <div className="card">
        <h2><Trans k="views.applications.listTitle" params={{ count: apps.length }}
          tags={{ muted: (c) => <span className="muted small">{c}</span> }} /></h2>
        <input placeholder={t("views.applications.searchPlaceholder")} value={query}
          onChange={(e) => setQuery(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
        <div className="scroll">
          {apps.map((a) => {
            const ms = usageByPkg.get(a.package_name) ?? 0;
            const active = current?.package_name === a.package_name;
            return (
              <button key={a.id} className={`app-row ${active ? "active" : ""}`}
                onClick={() => setSelected(a.package_name)}>
                <span className="app-ic" style={{ background: categoryColor(a.category) }}>
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
          {apps.length === 0 && <EmptyState title={t("views.applications.noMatch")} />}
        </div>
      </div>

      {current && <AppDetail app={current} usage={usage} anchorDay={anchorDay} />}
    </div>
  );
}

function AppDetail({ app, usage, anchorDay }: { app: AppInventory; usage: ObservationData["usage"]; anchorDay: string }) {
  const { t, fmt } = useI18n();
  const to = anchorDay;
  const from7 = shiftDay(anchorDay, -6);
  const pkgUsage = useMemo(() => usage.filter((u) => u.package_name === app.package_name), [usage, app.package_name]);
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(anchorDay, -(6 - i)));
  const totals = dailyTotals(pkgUsage, days);
  const bars: Slice[] = days.map((d, i) => ({ key: d, label: fmtDayLabel(d), value: totals[i], color: categoryColor(app.category) }));
  const total7 = totalInRange(pkgUsage, from7, to);
  const launches7 = pkgUsage.filter((u) => u.day >= from7).reduce((s, u) => s + u.launch_count, 0);
  const lastUsedList = pkgUsage.map((u) => u.last_used_at).filter(Boolean).sort();
  const lastUsed = lastUsedList.length ? lastUsedList[lastUsedList.length - 1] : null;

  return (
    <div className="card">
      <div className="row" style={{ gap: 14 }}>
        <span className="app-ic" style={{ background: categoryColor(app.category), width: 48, height: 48, fontSize: "1.1rem" }}>
          {appInitials(app.app_label, app.package_name)}
        </span>
        <div>
          <h2 style={{ marginBottom: 2 }}>{appLabelOf(app.app_label, app.package_name)}</h2>
          <div className="muted small">{app.package_name}</div>
        </div>
      </div>

      <div className="row" style={{ gap: 8, margin: "14px 0 4px" }}>
        <span className="badge" style={{ color: categoryColor(app.category) }}>{categoryLabel(app.category)}</span>
        {app.is_system && <span className="badge">{t("views.applications.detail.systemApp")}</span>}
        {app.installed_at && <span className="badge">{t("views.applications.detail.installedOn", { date: fmt.date(app.installed_at, DATE_NUMERIC) })}</span>}
      </div>

      <div className="grid cols-2" style={{ margin: "14px 0" }}>
        <div><div className="muted small">{t("views.applications.detail.time7d")}</div><div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{fmtDuration(total7)}</div></div>
        <div><div className="muted small">{t("views.applications.detail.launches7d")}</div><div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{launches7 || t("common.none")}</div></div>
      </div>

      <h3>{t("views.applications.detail.usage7d")}</h3>
      {total7 > 0 ? <Bars data={bars} fmt={fmtDuration} height={150} highlightKey={to} />
        : <EmptyState title={t("views.applications.detail.noUsage")} />}

      {lastUsed && <p className="muted small" style={{ marginTop: 12 }}>
        {t("views.applications.detail.lastUsed", { date: fmt.date(lastUsed, DATE_TIME_FULL) })}
      </p>}
    </div>
  );
}
