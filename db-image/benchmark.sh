#!/usr/bin/env bash
# pg_trgm(ILIKE) vs pg_bigm(lower LIKE) — 같은 데이터, 같은 질의어.
# 각 질의를 3회 돌려 최소값을 취한다(캐시 워밍 후 안정값).
set -u
DB="docker exec bigm-bench psql -U bench -d bench -At"

run() { # $1=sql
  local best=99999 t
  for _ in 1 2 3; do
    t=$($DB -c "\timing on" -c "$1" 2>/dev/null | grep -oE 'Time: [0-9.]+' | grep -oE '[0-9.]+')
    [ -n "${t:-}" ] && awk -v a="$t" -v b="$best" 'BEGIN{exit !(a<b)}' && best=$t
  done
  echo "$best"
}

plan() { # $1=sql -> 인덱스 사용 여부
  $DB -c "EXPLAIN $1" 2>/dev/null | grep -qE 'Bitmap Index Scan' && echo "index" || echo "seq"
}

printf '%-10s %-5s | %10s %8s | %10s %8s | %s\n' \
  "질의어" "글자" "pg_trgm" "" "pg_bigm" "" "비고"
printf '%s\n' "---------------------------------------------------------------------------"

for k in 승 대련 종료 라운드 "쟶쿅" ; do
  len=$(echo -n "$k" | wc -m)
  q_trgm="SELECT count(*) FROM statuses_bench WHERE text ILIKE '%${k}%';"
  q_bigm="SELECT count(*) FROM statuses_bench WHERE lower(text) LIKE lower('%${k}%');"
  t1=$(run "$q_trgm"); p1=$(plan "$q_trgm")
  t2=$(run "$q_bigm"); p2=$(plan "$q_bigm")
  ratio=$(awk -v a="$t1" -v b="$t2" 'BEGIN{ if (b>0) printf "%.1fx", a/b; else print "-" }')
  printf '%-10s %-5s | %8s ms %8s | %8s ms %8s | %s\n' "$k" "$len" "$t1" "$p1" "$t2" "$p2" "$ratio"
done
