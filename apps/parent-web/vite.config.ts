import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Précharge la police de TEXTE (Figtree, sous-ensemble latin) : sans cela, le
 * navigateur ne la découvre qu'après avoir analysé la CSS → texte affiché d'abord
 * en police système (font-display: swap), puis saut visuel. Le fichier haché est
 * retrouvé dans le bundle au moment du build ; chemin RELATIF (base "./").
 */
function preloadTextFont(): Plugin {
  return {
    name: "preload-text-font",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const file = Object.keys(ctx.bundle ?? {}).find((f) => /figtree-latin-wght-normal.*\.woff2$/.test(f));
        if (!file) return [];
        return [{
          tag: "link",
          attrs: { rel: "preload", as: "font", type: "font/woff2", href: `./${file}`, crossorigin: "" },
          injectTo: "head",
        }];
      },
    },
  };
}

export default defineConfig({
  // Chemins d'actifs RELATIFS : le build fonctionne aussi bien à la racine d'un
  // domaine qu'à un sous-chemin (ex. GitHub Pages projet : /controle-parental/).
  base: "./",
  plugins: [react(), preloadTextFont()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Leaflet (carte LOT 3) dans un chunk dédié : meilleur cache et bundle
        // principal allégé (il n'est chargé que pour les vues Localisation/Sécurité).
        manualChunks: (id) => {
          if (id.includes("/node_modules/leaflet/")) return "leaflet";
          // Bibliothèques stables dans des chunks « vendor » (cache long terme).
          // Les aides CommonJS de Rollup vont avec React : sinon elles atterrissent
          // dans le chunk leaflet, que le bundle principal importerait alors
          // STATIQUEMENT (Leaflet téléchargé dès la connexion).
          if (id.includes("commonjsHelpers") || /\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          if (id.includes("/node_modules/@supabase/")) return "supabase";
          // Catalogue français (source + repli, toujours chargé) dans son propre
          // chunk : les textes évoluent sans invalider le cache du code (LOT 9).
          if (id.endsWith("/src/i18n/locales/fr.ts")) return "i18n-fr";
          return undefined;
        },
      },
    },
  },
});
