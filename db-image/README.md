# pg_bigm 평가

`DatabaseStatusSearch`의 pg_trgm 인덱스를 2-gram 인덱스로 바꿨을 때의 부하를
실측한 기록. 결론부터: **1~2자 한국어 질의에서 24~73배 빠르고, 인덱스는 13%
크다.**

## 왜 필요한가

pg_trgm은 3-gram이라 3자 미만 패턴에서 온전한 트라이그램을 못 뽑는다. 플래너가
그걸 알고 인덱스를 스스로 배제하므로 잘못된 플랜이 나오지는 않지만, 대신 매번
전체 스캔이 된다. 한국어에서 2자 검색어는 흔하다.

## 코퍼스

test 인스턴스의 실제 게시물 5,970건(평균 73자, 총 752,293자). 10만 건 규모는
이 코퍼스를 17회 복제하되 행마다 6자 난수 토큰을 덧붙여 만들었다.

복제본은 **인덱스 크기 측정에 쓸 수 없다**. GIN은 키별 포스팅 리스트라 같은
텍스트를 반복해도 n-gram 어휘가 늘지 않아 행당 크기가 실제보다 작게 나온다.
그래서 크기는 중복 없는 5,970건에서, 속도는 10만 건에서 쟀다.

## 인덱스 크기 (실제 코퍼스 5,970건, heap 984 kB)

| 인덱스 | 크기 | 행당 | 생성 시간(10만 건) |
|---|---|---|---|
| `gin_trgm_ops` on `text` | 696 kB | 119 B | 6.4초 |
| `gin_bigm_ops` on `lower(text)` | 784 kB | 134 B | 15.2초 |

pg_bigm이 13% 크고 생성이 2.4배 느리다. 둘 다 감당 가능한 수준.

## 질의 속도

10만 건:

| 질의어 | 글자 | pg_trgm | pg_bigm | 배수 |
|---|---|---|---|---|
| 승 | 1 | 450.8 ms (seq) | 9.8 ms (index) | **46x** |
| 대련 | 2 | 447.1 ms (seq) | 10.8 ms (index) | **42x** |
| 종료 | 2 | 447.4 ms (seq) | 18.6 ms (index) | **24x** |
| 라운드 | 3 | 122.1 ms (index) | 116.0 ms (index) | 1.1x |
| 쟶쿅(없는 말) | 2 | 455.2 ms (seq) | 6.3 ms (index) | **73x** |

5,970건(현재 prod 규모와 비슷):

| 질의어 | 글자 | pg_trgm | pg_bigm |
|---|---|---|---|
| 승 | 1 | 32.2 ms (seq) | 7.3 ms (index) |
| 대련 | 2 | 32.2 ms (seq) | 7.3 ms (index) |
| 라운드 | 3 | 14.1 ms (index) | 13.6 ms (index) |

3자 이상에서는 차이가 없다. 이득은 전부 3자 미만 구간에서 나온다.

## 적용에 필요한 변경

pg_bigm은 **`LIKE`만 가속하고 인덱스가 대소문자를 구분한다.** pg_trgm처럼
`ILIKE`를 직접 받지 못하므로 질의를 바꿔야 한다:

```ruby
# app/models/status.rb — 현재
where('statuses.text ILIKE :pattern OR statuses.spoiler_text ILIKE :pattern', ...)
# pg_bigm
where('lower(statuses.text) LIKE lower(:pattern) OR lower(statuses.spoiler_text) LIKE lower(:pattern)', ...)
```

인덱스도 `lower()` 표현식 위에 만들어야 한다. pg_bigm 문서는 표현식 인덱스를
다루지 않지만 **실측으로 동작을 확인했다**(위 표의 bigm 행이 전부 표현식
인덱스를 탄 결과다).

한국어에는 대소문자가 없어 `lower()`가 무의미해 보이지만, 본문에 섞이는 라틴
문자 때문에 반드시 필요하다.

## 이미지

`Dockerfile`은 Debian 패키지(`postgresql-14-pg-bigm`)가 아니라 alpine 소스
빌드를 쓴다. 두 인스턴스가 `postgres:14-alpine`(musl)로 돌고 있는데 Debian
이미지로 바꾸면 musl → glibc 전환이라 `LC_COLLATE`가 달라진다. 텍스트 인덱스의
정렬 순서가 바뀌므로 전체 `REINDEX` 없이는 조용히 틀린 결과가 나온다.

musl/aarch64 빌드에서 걸린 것들:

- `clang`/`llvm` 패키지가 없음 → `with_llvm=no` (JIT 비트코드는 없어도 동작)
- 서버 헤더가 `unicode/ucol.h`를 include → `icu-dev`, `libxml2-dev`, `openssl-dev`
- 산출물은 `bigm.so`가 아니라 `pg_bigm.so`

빌드 검증:

```
docker build -t mastodon-db-bigm:14-alpine -f db-image/Dockerfile db-image/
docker run -d --name bigm-bench -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=bench -e POSTGRES_DB=bench mastodon-db-bigm:14-alpine
docker exec bigm-bench psql -U bench -d bench -c 'CREATE EXTENSION pg_bigm;'
```

## 상시 비용

`postgres:14-alpine`의 자동 패치 업데이트를 포기하고, PG 패치 릴리스마다 이
이미지를 다시 빌드해야 한다. 업스트림 Mastodon은 stock postgres를 전제하므로
이 이탈은 계속 기억해야 한다.

## 덤: prod 트라이그램 인덱스가 부풀어 있다

같은 성격의 코퍼스를 새로 인덱싱하면 행당 119 B인데, prod의
`index_statuses_on_text_trigram`은 행당 952 B다(7,488 kB / 8,055행). 8배 차이는
본문 길이 차이(90자 vs 73자)로 설명되지 않는다. GIN 블로트로 보이며,
`REINDEX INDEX CONCURRENTLY`로 회수될 가능성이 높다. pg_bigm 도입과 무관하게
따로 확인할 값어치가 있다.
