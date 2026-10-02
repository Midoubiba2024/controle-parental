import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* =============================================================================
   Carte Leaflet + tuiles OpenStreetMap (MIT, sans clé API — meilleur choix archi
   vs Google Maps : respectueux de la vie privée, pas de dépendance propriétaire).
   Wrapper IMPÉRATIF (pas de react-leaflet) pour rester léger et maîtrisé.

   On n'utilise QUE des circleMarker / circle / polyline (SVG) : aucun asset
   d'icône PNG à bundler (évite le bug classique des marqueurs Leaflet cassés
   sous Vite). L'identité des marqueurs ne repose jamais sur la couleur seule
   (popup + libellé). Les tuiles reçoivent un filtre en thème sombre.
   ============================================================================= */

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;        // couleur résolue (ex. "#2a78d6")
  label: string;        // texte du popup
  kind?: "dot" | "position" | "sos";
  radiusPx?: number;
}

export interface MapCircle {
  id: string;
  lat: number;
  lng: number;
  radiusM: number;
  color: string;
  label?: string;
  dashed?: boolean;
}

/**
 * Résout un token CSS (« var(--series-1) ») en couleur calculée : Leaflet pose
 * `color` comme attribut SVG `stroke`, qui n'interprète PAS les variables CSS.
 * On lit donc la valeur effective sur :root. Les couleurs littérales passent tel
 * quel. (Un changement de thème est répercuté au prochain redraw des données.)
 */
function resolveColor(c: string): string {
  const m = c.match(/^var\((--[\w-]+)\)$/);
  if (!m) return c;
  const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  return v || "#888888";
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
      attribution: "&copy; contributeurs OpenStreetMap",
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      onClickRef.current?.(e.latlng.lat, e.latlng.lng);
    });
    mapRef.current = map;
    // La taille réelle du conteneur n'est parfois connue qu'après le layout.
    setTimeout(() => map.invalidateSize(), 0);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Redessine les couches à chaque changement de données.
  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();

    for (const c of circles) {
      const col = resolveColor(c.color);
      L.circle([c.lat, c.lng], {
        radius: c.radiusM,
        color: col,
        weight: 2,
        opacity: 0.9,
        fillColor: col,
        fillOpacity: 0.12,
        dashArray: c.dashed ? "6 6" : undefined,
      }).addTo(group).bindPopup(c.label ?? "");
    }

    if (path && path.length > 1) {
      L.polyline(path.map((p) => [p.lat, p.lng] as [number, number]), {
        color: resolveColor("var(--primary)"), weight: 3, opacity: 0.6,
      }).addTo(group);
    }

    for (const m of markers) {
      const r = m.radiusPx ?? (m.kind === "position" ? 9 : m.kind === "sos" ? 11 : 5);
      const marker = L.circleMarker([m.lat, m.lng], {
        radius: r,
        color: "#ffffff",
        weight: 2,
        fillColor: resolveColor(m.color),
        fillOpacity: m.kind === "dot" ? 0.7 : 1,
      }).addTo(group).bindPopup(m.label);
      if (m.kind === "sos") {
        // Halo pulsant autour du point SOS pour le repérer immédiatement.
        marker.setStyle({ weight: 3 });
      }
    }

    // Cadre automatique sur l'ensemble des éléments.
    const pts: [number, number][] = [
      ...markers.map((m) => [m.lat, m.lng] as [number, number]),
      ...circles.map((c) => [c.lat, c.lng] as [number, number]),
      ...(path ?? []).map((p) => [p.lat, p.lng] as [number, number]),
    ];
    if (pts.length === 1) {
      map.setView(pts[0], 16);
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 17 });
    }
  }, [markers, circles, path]);

  return (
    <div
      ref={elRef}
      className={className}
      style={{ height, width: "100%", borderRadius: "var(--radius-sm)", overflow: "hidden", zIndex: 0 }}
    />
  );
}
