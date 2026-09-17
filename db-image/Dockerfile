# Postgres with pg_bigm, for evaluating a 2-gram index against the pg_trgm one
# DatabaseStatusSearch currently uses.
#
# Built on the alpine image the instances already run, not the Debian one that
# ships a pg_bigm package: switching musl -> glibc changes LC_COLLATE, which
# reorders every text index and would need a full REINDEX to stay correct.
#
# pg_bigm accelerates LIKE only, and its index is case-sensitive, so a query
# has to become lower(text) LIKE lower(...) against an index on lower(text) --
# unlike pg_trgm, which serves ILIKE directly.
ARG POSTGRES_VERSION=14-alpine

FROM postgres:${POSTGRES_VERSION} AS build

ARG PG_BIGM_VERSION=v1.2-20250903

# icu-dev/libxml2-dev/openssl-dev supply the headers the server headers
# include; the alpine image ships the libraries but not those.
RUN apk add --no-cache build-base curl tar icu-dev libxml2-dev openssl-dev

RUN set -eux; \
    mkdir -p /tmp/pg_bigm; \
    curl -fsSL "https://github.com/pgbigm/pg_bigm/archive/refs/tags/${PG_BIGM_VERSION}.tar.gz" \
      | tar xz -C /tmp/pg_bigm --strip-components=1; \
    cd /tmp/pg_bigm; \
    make USE_PGXS=1 with_llvm=no; \
    make USE_PGXS=1 with_llvm=no install

FROM postgres:${POSTGRES_VERSION}

COPY --from=build /usr/local/lib/postgresql/pg_bigm.so /usr/local/lib/postgresql/
COPY --from=build /usr/local/share/postgresql/extension/pg_bigm* /usr/local/share/postgresql/extension/
