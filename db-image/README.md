# pg_bigm 평가

`DatabaseStatusSearch`의 pg_trgm 인덱스를 2-gram 인덱스로 바꿨을 때의 부하를
실측한 기록. 결론부터: **1~2자 한국어 질의가 8배 빨라지고, 인덱스는 37%
작아진다.** prod에 넣으면 메모리도 디스크도 줄어든다.

## 왜 필요한가

pg_trgm은 3-gram이라 3자 미만 패턴에서 온전한 트라이그램을 못 뽑는다. 플래너가
그걸 알고 인덱스를 스스로 배제하므로 잘못된 플랜이 나오지는 않지만, 대신 매번
전체 스캔이 된다. 한국어에서 2자 검색어는 흔하다.

## 코퍼스

- **prod 본문 8,043건** (평균 91자) — 크기·속도의 기준값. 사람이 쓴 한국어다.
- test 본문 5,970건 (평균 73자) — 봇 생성 정형 문구라 어휘가 좁다. 참고용.
- 10만 건 — test 코퍼스를 17회 복제하고 행마다 6자 난수를 덧붙인 합성 데이터.
  **속도 확장성에만 쓴다.** GIN은 키별 포스팅 리스트라 같은 텍스트를 반복해도
  n-gram 어휘가 늘지 않아, 복제본으로는 행당 크기가 실제보다 작게 나온다.

## 인덱스 크기

**prod의 실제 본문(8,043건, 평균 91자, heap 1,928 kB)** — 도입 판단은 이 표를 본다.

| 인덱스 | 크기 | 행당 | 생성 시간 |
|---|---|---|---|
| `gin_trgm_ops` on `text` | 5,784 kB | 736 B | 1.86초 |
| `gin_bigm_ops` on `lower(text)` | **3,640 kB** | **463 B** | 1.99초 |

**pg_bigm이 37% 작다.** 한국어에서는 트라이그램 어휘가 바이그램보다 훨씬 크게
터지기 때문이다 — 한글 음절이 약 11,172자라 2-gram보다 3-gram의 distinct 키가
압도적으로 많다. 생성 시간은 사실상 같다.

참고로 test 코퍼스(5,970건, 평균 73자)에서는 반대로 bigm이 13% 컸다(696 kB vs
784 kB). test 인스턴스는 봇이 정형 문구를 반복 생성해 어휘가 좁기 때문이며,
**사람이 쓴 한국어를 대표하지 못한다.** 도입 판단에 쓰면 안 된다.

## 질의 속도

10만 건:

| 질의어 | 글자 | pg_trgm | pg_bigm | 배수 |
|---|---|---|---|---|
| 승 | 1 | 450.8 ms (seq) | 9.8 ms (index) | **46x** |
| 대련 | 2 | 447.1 ms (seq) | 10.8 ms (index) | **42x** |
| 종료 | 2 | 447.4 ms (seq) | 18.6 ms (index) | **24x** |
| 라운드 | 3 | 122.1 ms (index) | 116.0 ms (index) | 1.1x |
| 쟶쿅(없는 말) | 2 | 455.2 ms (seq) | 6.3 ms (index) | **73x** |

prod의 실제 본문 8,043건 — 지금 운영 중인 규모 그대로:

| 질의어 | 글자 | 일치 | pg_trgm | pg_bigm |
|---|---|---|---|---|
| 승 | 1 | 64건 | 55.3 ms (seq) | 6.7 ms (index) |
| 그냥 | 2 | 183건 | 52.8 ms (seq) | 6.7 ms (index) |
| 오늘 | 2 | 56건 | 56.1 ms (seq) | 6.6 ms (index) |
| 니다 | 2 | 1,028건 | 55.1 ms (seq) | 7.8 ms (index) |
| 안녕하세 | 4 | 7건 | 6.2 ms (index) | 6.5 ms (index) |

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

## prod 도입 시 부하 추산

측정값을 그대로 옮기면 된다 — prod 본문으로 쟀으므로 추정이 아니다.

### 디스크

| | 현재 | pg_bigm 도입 후 | 차이 |
|---|---|---|---|
| `statuses.text` 인덱스 | 7,376 kB (운영 중, 블로트 포함) | 3,640 kB | **-3,736 kB** |
| `statuses.spoiler_text` 인덱스 | 112 kB | 비슷하거나 더 작음 | ~0 |
| DB 이미지 | 406 MB | 406 MB | **+0** |

이미지는 멀티스테이지라 최종 레이어에 `pg_bigm.so` 74 kB와 SQL 파일만 더해진다.
docker가 보고하는 크기는 동일하다.

트라이그램 인덱스를 대체하는 것이므로 **순증이 아니라 순감**이다. 블로트 회수분이
같이 딸려온다.

### 메모리

| 항목 | 값 |
|---|---|
| 인덱스 상주분 (shared_buffers 128 MB 중) | 7.4 MB → **3.6 MB** |
| `gin_pending_list_limit` | 4 MB × 인덱스 2개 (변화 없음) |
| 비트맵 스캔 `work_mem` | 4 MB (변화 없음) |
| 인덱스 생성 시 `maintenance_work_mem` | 64 MB, 일시적 |
| 확장 `.so` | 74 kB, 백엔드가 공유 매핑 |

`shared_preload_libraries`가 필요 없으므로 서버 상주 비용이 없다. **도입으로
늘어나는 메모리는 없고, 인덱스가 작아지는 만큼 버퍼 압박이 줄어든다.**

### 규모가 커지면

행당 463 B(bigm) / 736 B(trgm) 기준:

| 게시물 수 | pg_trgm | pg_bigm |
|---|---|---|
| 8천 (현재) | 5.8 MB | 3.6 MB |
| 5만 | 36 MB | 23 MB |
| 10만 | 72 MB | 45 MB |

`shared_buffers`가 128 MB이므로 pg_trgm은 10만 건 부근에서 인덱스만으로 버퍼의
절반을 요구한다. pg_bigm이면 그 시점이 더 뒤로 밀린다.

## 상시 비용

`postgres:14-alpine`의 자동 패치 업데이트를 포기하고, PG 패치 릴리스마다 이
이미지를 다시 빌드해야 한다. 업스트림 Mastodon은 stock postgres를 전제하므로
이 이탈은 계속 기억해야 한다.

## 덤: prod 트라이그램 인덱스에 약간의 블로트

prod의 본문을 새로 인덱싱하면 5,784 kB인데 운영 중인
`index_statuses_on_text_trigram`은 7,376 kB다. 차이는 약 1.6 MB(22%)로, GIN
블로트로 보인다. `REINDEX INDEX CONCURRENTLY`로 회수할 수 있다.

(초안에서 이 값을 "8배"로 적었는데 틀렸다. 그때는 test 코퍼스에서 잰 119 B/행을
prod에 갖다 댔는데, 두 코퍼스의 어휘 밀도가 전혀 다르다. prod 본문으로 직접
재면 22%다.)
