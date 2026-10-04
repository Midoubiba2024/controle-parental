import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { t } from "../../i18n";

/* =============================================================================
   Carte Leaflet + tuiles OpenStreetMap (MIT, sans clé API — meilleur choix archi
   vs Google Maps : respectueux de la vie privée, pas de dépendance propriétaire).
   Wrapper IMPÉRATIF (pas de react-leaflet) pour rester léger et maîtrisé.

   On n'utilise QUE des circleMarker / circle / polyline (SVG) : aucun asset
   d'icône PNG à bundler (évite le bug classique des marqueurs Leaflet cassés
   sous Vite). L'identité des marqueurs ne repose jamais sur la couleur seule
   (popup + libellé). Les tuiles reçoivent un filtre en thème sombre.

   CADRAGE : le recadrage automatique est DÉCOUPLÉ du redraw. On ne recadre que
   lorsque l'ensemble des points change réellement (signature), et plus du tout
   dès que l'utilisateur a déplacé/zoomé la carte — sinon le suivi SOS live et la
   navigation manuelle seraient cassés à chaque rendu React.
   ============================================================================= */

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;        // token CSS ("var(--series-1)") ou couleur littérale
  /** Texte BRUT du popup (jamais du HTML : peut contenir une saisie utilisateur). */
  label: string;
  kind?: "dot" | "position" | "sos";
  radiusPx?: number;
}

export interface MapCircle {
  id: string;
  lat: number;
  lng: number;
  radiusM: number;
  color: string;
  /** Texte BRUT du popup (jamais du HTML : peut contenir une saisie utilisateur). */
  label?: string;
  dashed?: boolean;
}

/**
 * Résout un token CSS (« var(--series-1) ») en couleur calculée : Leaflet pose
 * `color` comme attribut SVG `stroke`, qui n'interprète PAS les variables CSS.
 * On lit donc la valeur effective sur :root. Les couleurs littérales passent tel
 * quel. Un changement de thème/palette redessine les couches (useThemeVersion).
 */
function resolveColor(c: string): string {
  const m = c.match(/^var\((--[\w-]+)\)$/);
  if (!m) return c;
  const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  return v || "currentColor";
}

/**
 * Version du thème : change quand data-theme / data-palette changent sur <html>
 * ou quand le thème système bascule — les couleurs résolues doivent être relues.
 */
function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const obs = new MutationObserver(bump);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-palette"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    return () => { obs.disconnect(); mq.removeEventListener("change", bump); };
  }, []);
  return version;
}

export function MapCanvas({
  markers = [], circles = [], path, height = 420, onClick, className,
}: {
  markers?: MapMarker[];
  circles?: MapCircle[];
  path?: { lat: number; lng: number }[];
  height?: number;
  onClick?: (lat: number, lng: number) => void;
  className?: string;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  // Suivi du cadrage : interaction utilisateur + mouvement programmatique + dernière
  // signature de points cadrée.
  const userInteractedRef = useRef(false);
  const programmaticRef = useRef(false);
  const lastFitSigRef = useRef<string | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const themeVersion = useThemeVersion();

  // Création unique de la carte.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      center: [48.8566, 2.3522],     // Paris par défaut (repli si aucune donnée)
      zoom: 12,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: t("views.map.attribution"),   // lu au montage de la carte
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      onClickRef.current?.(e.latlng.lat, e.latlng.lng);
    });
    // Dès que l'utilisateur déplace/zoome LUI-MÊME (pas un recadrage programmatique),
    // on cesse tout recadrage automatique.
    map.on("movestart zoomstart", () => {
      if (!programmaticRef.current) userInteractedRef.current = true;
    });
    mapRef.current = map;
    // La taille réelle du conteneur n'est parfois connue qu'après le layout.
    resizeTimerRef.current = setTimeout(() => map.invalidateSize(), 0);
    return () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Redessine les couches à chaque changement de données (SANS recadrer ici).
  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();

    // Points qui définissent le cadre (incluent le RAYON des cercles via getBounds()).
    const pts: L.LatLng[] = [];

    for (const c of circles) {
      const col = resolveColor(c.color);
      const circle = L.circle([c.lat, c.lng], {
        radius: c.radiusM,
        color: col,
        weight: 2,
        opacity: 0.9,
        fillColor: col,
        fillOpacity: 0.12,
        dashArray: c.dashed ? "6 6" : undefined,
      }).addTo(group);
      if (c.label) circle.bindPopup(textContent(c.label));
      const b = circle.getBounds();
      pts.push(b.getSouthWest(), b.getNorthEast());
    }

    if (path && path.length > 1) {
      L.polyline(path.map((p) => [p.lat, p.lng] as [number, number]), {
        color: resolveColor("var(--primary)"), weight: 3, opacity: 0.6,
      }).addTo(group);
    }
    for (const p of path ?? []) pts.push(L.latLng(p.lat, p.lng));

    for (const m of markers) {
      const r = m.radiusPx ?? (m.kind === "position" ? 9 : m.kind === "sos" ? 11 : 5);
      L.circleMarker([m.lat, m.lng], {
        radius: r,
        color: resolveColor("var(--c-map-marker-ring)"),
        weight: m.kind === "sos" ? 3 : 2,
        fillColor: resolveColor(m.color),
        fillOpacity: m.kind === "dot" ? 0.7 : 1,
      }).addTo(group).bindPopup(textContent(m.label));
      pts.push(L.latLng(m.lat, m.lng));
    }

    // Recadrage DÉCOUPLÉ : seulement si l'utilisateur n'a pas pris la main ET si
    // l'ensemble des positions a changé (signature = centres, hors rayon pour ne
    // pas recadrer à chaque ajustement de rayon dans l'éditeur de zone).
    if (userInteractedRef.current || pts.length === 0) return;
    const sig = JSON.stringify({
      m: markers.map((m) => [round(m.lat), round(m.lng)]),
      c: circles.map((c) => [round(c.lat), round(c.lng)]),
      p: (path ?? []).map((p) => [round(p.lat), round(p.lng)]),
    });
    if (sig === lastFitSigRef.current) return;
    lastFitSigRef.current = sig;

    programmaticRef.current = true;
    const onlyOnePoint = markers.length + (path?.length ?? 0) === 1 && circles.length === 0;
    if (onlyOnePoint) {
      map.setView([markers[0]?.lat ?? path![0].lat, markers[0]?.lng ?? path![0].lng], 16);
    } else {
      map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 17 });
    }
    // Rend la main après que les événements de mouvement programmatiques soient passés.
    setTimeout(() => { programmaticRef.current = false; }, 0);
  }, [markers, circles, path, themeVersion]);

  return (
    <div
      ref={elRef}
      className={className}
      style={{ height, width: "100%", borderRadius: "var(--radius-sm)", overflow: "hidden", zIndex: 0 }}
    />
  );
}

/**
 * Contenu de popup SÛR : Leaflet injecte une chaîne via innerHTML, or les libellés
 * peuvent contenir une saisie libre (nom de zone…) → XSS stockée. On passe donc
 * toujours un nœud DOM dont le texte est posé via textContent (jamais interprété).
 */
function textContent(label: string): HTMLElement {
  const el = document.createElement("span");
  el.textContent = label;
  return el;
}

function round(v: number): number { return Math.round(v * 1e5) / 1e5; }
