# Lab 03 — короткий захист

## 1. Що показати

1. Loading screen і реальний progress bar.
2. Lobby: ім'я → вибір кімнати → Join.
3. Політ, SPACE → постріл + звук, попадання → hit/explosion.
4. Async diagnostics: 404, timeout, abort, corrupt JSON, retry 5xx, benchmark.
5. DevTools Console: п'ять ordering puzzles.

## 2. Основна ідея

`loadAll()` запускає всі asset-завантаження одночасно та чекає їх через `Promise.all()`. Тому час очікування не дорівнює сумі окремих завантажень.

`async/await` не блокує JavaScript. На `await` async-функція повертає керування event loop, а продовження запускається після завершення Promise.

## 3. Retry

4xx не повторюються, бо помилка означає проблему в запиті/ресурсі. Тимчасові 5xx та network errors можуть повторюватися через exponential backoff + jitter.

## 4. Abort

`AbortController` скасовує власний довгий запит. `AbortSignal.timeout()` дає окремий дедлайн для HTTP-запиту lobby.

## 5. Чому EventTarget

Sim не повинен імпортувати audio або HUD. Він генерує події `fired`, `hit`, `exploded`, а окремі модулі підписуються на них.

## 6. Що відповісти про lobby

`Lobby extends EventTarget`. `refresh()` робить `fetchJson('/api/rooms')`; кожен запит має `AbortSignal.timeout(...)`. Polling працює тільки поки lobby активне. Після Join викликається `leave()` і controller робить abort.

## 7. Reflection

**Promise states:** pending → fulfilled/rejected, перехід відбувається один раз.

**async/await:** `await` є синтаксичним способом працювати з Promise; функція продовжується після settlement.

**all vs allSettled vs race vs any:** `all` — всі assets; `allSettled` — diagnostics; `race` — перший результат; `any` — перший успішний.

**fetch + 404:** сам `fetch` зазвичай не reject-иться на HTTP 404, тому треба перевіряти `response.ok`; body читається окремим async-кроком через `json()/blob()/arrayBuffer()`.
