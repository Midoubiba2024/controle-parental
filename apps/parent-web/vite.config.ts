import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Chemins d'actifs RELATIFS : le build fonctionne aussi bien à la racine d'un
  // domaine qu'à un sous-chemin (ex. GitHub Pages projet : /controle-parental/).
  base: "./",
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Leaflet (carte LOT 3) dans un chunk dédié : meilleur cache et bundle
        // principal allégé (il n'est chargé que pour les vues Localisation/Sécurité).
        manualChunks: { leaflet: ["leaflet"] },
      },
    },
  },
});
