# Lab 03 — Asynchronous JavaScript

## Starship Arena

Продовження **Lab 01–02** у тому самому репозиторії. У цій лабораторній я додав асинхронний pipeline завантаження ресурсів, екран прогресу, lobby через HTTP, Web Audio та діагностику помилок.

## Що реалізовано

- `manifest.json` описує sprite sheets, звуки та arena config.
- `loadImage`, `loadAudio`, `loadJson` приймають `AbortSignal`.
- Спільний `fetchJson()` перевіряє `response.ok` і перетворює HTTP-помилки на rejected Promise.
- `withRetry()` використовує exponential backoff + jitter і **не повторює 4xx**.
- `loadAll()` завантажує ресурси конкурентно через `Promise.all()` та показує прогрес кожного файлу.
- Гра переходить до lobby лише після `await loadAll(...)`.
- Корабель, кулі та астероїди малюються зі sprite sheets.
- Звуки декодуються під час loading; Web Audio `AudioContext` створюється/розблоковується після жесту гравця.
- Симуляція не імпортує `audio.js` або `hud.js`: події проходять через `EventTarget` + `CustomEvent` (`fired`, `hit`, `exploded`, `scoreChanged`).
- `class Lobby extends EventTarget` отримує `/api/rooms`, оновлює список через async iteration, використовує `AbortSignal.timeout()` для кожного запиту й скасовує polling після Join/Stop.
- Після Join локальна гра стартує з конфігом вибраної кімнати.
- У lobby є діагностика 404, timeout, abort, corrupt JSON, retry після 5xx та benchmark sequential/concurrent.

## Запуск

```bash
npm install
npm run dev
```

Перевірка:

```bash
npm run lint
npm run format:check
npm run build
```

## Структура

```text
starship-arena-lab01/
├── public/
│   ├── api/rooms.json
│   └── assets/
│       ├── manifest.json
│       ├── arena.json
│       ├── sprites/
│       └── audio/
├── src/
│   ├── assets/loader.js
│   ├── async/puzzles.js
│   ├── audio.js
│   ├── diagnostics.js
│   ├── hud.js
│   ├── lobby/lobby.js
│   ├── lobby/dom.js
│   ├── sim/
│   └── render/
└── vite.config.js
```

## Sequential vs concurrent

Для контрольованого тесту використано чотири `/api/slow?ms=320` запити.

Очікувана різниця: при sequential `await` запити виконуються один за одним, тому час близький до суми всіх затримок; при `Promise.all` запити стартують разом, тому час близький до найдовшого одного запиту.

**Моє вимірювання:**

| Метод | Час |
|---|---:|
| Sequential | ___ ms |
| Concurrent (`Promise.all`) | ___ ms |

## П'ять puzzle на порядок microtask/task

### 1. Promise reaction

```js
console.log("A");
Promise.resolve().then(() => console.log("B"));
console.log("C");
```

Вивід: `A, C, B`.

Пояснення: `.then()` планує реакцію як microtask, тому вона виконується після синхронного коду поточного task.

### 2. `await`

```js
(async () => {
  console.log("A");
  await 0;
  console.log("B");
})();
console.log("C");
```

Вивід: `A, C, B`.

Пояснення: `await` призупиняє async-функцію, а продовження виконується пізніше як microtask.

### 3. `setTimeout` всередині `.then()`

```js
Promise.resolve()
  .then(() => {
    console.log("A");
    setTimeout(() => console.log("D"), 0);
  })
  .then(() => console.log("B"));
console.log("C");
```

Вивід: `C, A, B, D`.

Пояснення: обидві Promise-реакції завершуються як microtasks раніше, ніж timer стає наступним task.

### 4. `requestAnimationFrame`

```js
requestAnimationFrame(() => console.log("rAF"));
Promise.resolve().then(() => console.log("micro"));
console.log("sync");
```

Вивід: `sync, micro, rAF`.

Пояснення: поточний синхронний код завершується, потім очищуються microtasks, після чого браузер доходить до rendering opportunity.

### 5. Два `await`

```js
Promise.resolve().then(async () => {
  console.log("A");
  await Promise.resolve();
  console.log("B");
  await 0;
  console.log("C");
});
console.log("D");
```

Вивід: `D, A, B, C`.

Пояснення: кожен `await` віддає керування event loop і продовжує async-функцію в наступному microtask.

Під час запуску `puzzles.js` ці приклади також друкуються в DevTools Console.

## Галерея збоїв

У правій панелі **Async diagnostics** є окремі кнопки. Після натискання кожна помилка перехоплюється, тому гра не падає.

| Тест | Результат |
|---|---|
| 404 sprite | Помилку оброблено; 4xx не повторювався |
| Network timeout | Помилку оброблено через `TimeoutError` |
| Abort mid-load | Завантаження скасовано через `AbortError` |
| Corrupt JSON | Помилку парсингу оброблено через `SyntaxError` |
| Retry 5xx | Запит відновлено після 3 спроб |

**Скріншоти/логи:** вставити тут 1–2 скріншоти панелі діагностики після проходження тестів.

## Promise combinators

У консолі також демонструються:

- `Promise.all()` — одночасне завантаження asset pipeline;
- `Promise.allSettled()` — перегляд усіх результатів навіть при частковій помилці;
- `Promise.race()` — отримати перший результат;
- `Promise.any()` — отримати перший успішний результат.

## EventTarget та Web Audio

`World` лише генерує події:

```text
fired
hit
exploded
scoreChanged
respawned
```

`audio.js` слухає їх та програє попередньо декодовані буфери. `hud.js` отримує зміни через подієву шину. Таким чином симуляція не має залежності від audio/HUD модулів.

AudioContext розблоковується після натискання **Join**, а звукові буфери готуються під час loading через `OfflineAudioContext`.

## Висновок

У Lab 03 я перевів завантаження ресурсів і lobby на Promise-based API без блокування main thread. Concurrent asset loading скорочує час очікування, `AbortSignal` дозволяє скасовувати запити, а `EventTarget` відокремлює симуляцію від UI та звуку. Окремі діагностичні тести показують, що 404, timeout, abort і битий JSON обробляються без падіння гри.
