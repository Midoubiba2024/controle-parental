#!/usr/bin/env bash
# =============================================================================
# Banc de test LOCAL et jetable des migrations Supabase (LOT 12 : appairage RPC).
#
#   1. initdb + démarrage d'un Postgres jetable (utilisateur système postgres) ;
#   2. stubs Supabase (tests/stubs.sql) ;
#   3. TOUTES les migrations supabase/migrations/*.sql, dans l'ordre ;
#   4. tests SQL (01_pairing_complete_test.sql), course concurrente (deux
#      connexions psql en parallèle), puis tests RGPD (03_rgpd_test.sql) ;
#   5. arrêt du serveur (toujours, même en cas d'échec).
#
# Usage : supabase/tests/run.sh            (PGBIN, PGDIR, PGPORT surchargeables)
# Aucune connexion à la production. Aucun secret.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$(cd "$HERE/../migrations" && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDIR="${PGDIR:-$(cd "$HERE/../../.." && pwd)/pg12}"
PGPORT="${PGPORT:-55433}"
PGSOCK="${PGSOCK:-/tmp}"
RUNAS=(runuser -u postgres --)

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$PGSOCK" -p "$PGPORT" -U postgres)

stop_server() {
  if [ -f "$PGDIR/data/postmaster.pid" ]; then
    "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$PGDIR/data" -m fast stop >/dev/null 2>&1 || \
      kill "$(head -1 "$PGDIR/data/postmaster.pid")" 2>/dev/null || true
  fi
}
trap stop_server EXIT

# Le serveur tourne sous l'utilisateur postgres : il doit pouvoir TRAVERSER les
# répertoires parents (droit x seulement, sans lecture/listing).
d="$PGDIR"
while d="$(dirname "$d")" && [ "$d" != "/" ]; do
  if ! "${RUNAS[@]}" test -x "$d"; then chmod o+x "$d"; fi
done

# --- 1) Serveur jetable --------------------------------------------------------
stop_server
rm -rf "$PGDIR"
mkdir -p "$PGDIR"
chown postgres:postgres "$PGDIR"
"${RUNAS[@]}" "$PGBIN/initdb" -D "$PGDIR/data" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$PGDIR/data" -l "$PGDIR/server.log" -w \
  -o "-p $PGPORT -k $PGSOCK -c listen_addresses=''" start >/dev/null
echo "== Postgres jetable démarré (port $PGPORT, données $PGDIR/data)"

# --- 2) Stubs + 3) migrations -------------------------------------------------
"${PSQL[@]}" -d postgres -f "$HERE/stubs.sql" >/dev/null
for f in "$MIGRATIONS"/*.sql; do
  "${PSQL[@]}" -d postgres -f "$f" >/dev/null 2>"$PGDIR/migration.err" || {
    echo "!! Échec de la migration $(basename "$f")"; cat "$PGDIR/migration.err"; exit 1; }
  # Les NOTICE (ex. « relation existe déjà ») ne sont pas des erreurs.
done
echo "== $(ls "$MIGRATIONS"/*.sql | wc -l) migrations appliquées"
# Idempotence : la DERNIÈRE migration doit pouvoir être rejouée sans erreur.
LAST="$(ls "$MIGRATIONS"/*.sql | tail -1)"
"${PSQL[@]}" -d postgres -f "$LAST" >/dev/null 2>"$PGDIR/migration.err" || {
  echo "!! $(basename "$LAST") n'est pas idempotente"; cat "$PGDIR/migration.err"; exit 1; }
echo "== $(basename "$LAST") rejouée sans erreur (idempotente)"

# --- 4a) Tests principaux -------------------------------------------------------
OUT="$PGDIR/test.out"
"${PSQL[@]}" -d postgres -f "$HERE/01_pairing_complete_test.sql" >"$OUT" 2>&1 || {
  cat "$OUT"; echo "!! ÉCHEC des tests principaux"; exit 1; }

# --- 4b) Course : deux appareils, MÊME code, deux connexions en parallèle --------
race() { # $1 = utilisateur anonyme
  "${PSQL[@]}" -d postgres -At <<SQL
select t.act('$1', true) \\g /dev/null
begin;
set local role authenticated;
select public.pairing_complete((select code from t.race), '{"platform":"android","model":"Course"}');
select pg_sleep(2) \\g /dev/null
commit;
SQL
}
race 'aaaaaaaa-0000-0000-0000-000000000011' >"$PGDIR/race1.out" 2>&1 &
P1=$!
sleep 0.5
race 'aaaaaaaa-0000-0000-0000-000000000012' >"$PGDIR/race2.out" 2>&1 &
P2=$!
# Pendant que la connexion 1 garde sa transaction ouverte, un AUTRE appelant
# (code faux) ne doit pas attendre : verrou par utilisateur, pas de verrou global
# (revue L12 #5). statement_timeout 1 s : un verrou global le ferait expirer.
"${PSQL[@]}" -d postgres -At >"$PGDIR/race3.out" 2>&1 <<SQL &
select t.act('aaaaaaaa-0000-0000-0000-000000000020', true) \\g /dev/null
set statement_timeout = '1s';
set role authenticated;
select public.pairing_complete('0000000001', '{"platform":"android"}');
SQL
P3=$!
wait "$P1"; wait "$P2"; wait "$P3" || true
echo "   course, connexion 3 (autre appelant) : $(grep -v '^$' "$PGDIR/race3.out" | tr '\n' ' ')"
if ! grep -q '"error": "code_not_found"' "$PGDIR/race3.out"; then
  echo "ECHEC RACE un autre appelant est bloqué par un appairage en cours"; exit 1
fi
echo "OK  RACE un autre appelant n'attend pas un appairage en cours (pas de verrou global)" >>"$OUT"
echo "   course, connexion 1 : $(grep -v '^$' "$PGDIR/race1.out" | tr '\n' ' ')"
echo "   course, connexion 2 : $(grep -v '^$' "$PGDIR/race2.out" | tr '\n' ' ')"
"${PSQL[@]}" -d postgres -v r1="$(grep '{' "$PGDIR/race1.out")" -v r2="$(grep '{' "$PGDIR/race2.out")" \
  -f "$HERE/02_race_check.sql" >>"$OUT" 2>&1 || {
  cat "$OUT"; echo "!! ÉCHEC du test de course"; exit 1; }

# --- 4c) RGPD : effacement enfant / famille + purge des anonymes orphelins ------
"${PSQL[@]}" -d postgres -f "$HERE/03_rgpd_test.sql" >>"$OUT" 2>&1 || {
  cat "$OUT"; echo "!! ÉCHEC des tests RGPD"; exit 1; }

# --- 4d) Edge Functions retirées (revue L12 #4) : bouchons 410, sans clé ni base --
FUNCS="$(cd "$HERE/../functions" && pwd)"
for fn in pairing-complete pairing-start create-family; do
  f="$FUNCS/$fn/index.ts"
  if grep -qE 'SERVICE_ROLE|createClient|Deno\.env' "$f"; then
    echo "ECHEC EDGE $fn utilise encore une clé, un secret ou la base" >>"$OUT"
  elif grep -q 'status: 410' "$f"; then
    echo "OK  EDGE $fn est un bouchon 410 (aucune clé, aucun accès base, aucun oracle de codes)" >>"$OUT"
  else
    echo "ECHEC EDGE $fn ne répond pas 410" >>"$OUT"
  fi
done

grep -E 'OK  |ECHEC' "$OUT" | sed 's/^.*NOTICE:  //'
N_OK=$(grep -c 'OK  ' "$OUT" || true)
if grep -q 'ECHEC' "$OUT"; then echo "!! ÉCHEC"; exit 1; fi
echo "== TOUS LES TESTS PASSENT ($N_OK assertions)"
