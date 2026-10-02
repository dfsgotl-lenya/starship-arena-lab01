# Lab 05 — Real-Time Networking: Prediction, Reconciliation & Binary Protocol

## Starship Arena

Продовження лабораторних 1–4. У цій роботі два клієнти грають через **authoritative Node.js server**. Клієнт передає тільки input (`thrust`, `turn`, `fire`), сервер є єдиним джерелом істини та надсилає snapshots зі швидкістю **30 Hz**.

## Що зроблено

- створено спільний workspace `shared/` для симуляції та протоколу;
- `shared/sim/integrate.js` — детермінована фізика без DOM/Node API;
- seeded PRNG (`mulberry32`) для однакового початкового світу;
- серверний `Match` працює на 30 Hz через absolute-target `setTimeout`, без `setInterval`;
- кожен input має `seq`, кожен snapshot містить `tick` і `lastProcessedSeq`;
- сервер перевіряє input і ніколи не приймає координати від клієнта;
- client-side prediction для власного корабля;
- reconciliation: authoritative snapshot → видалення підтверджених input → повторне програвання pending input;
- correction smoothing приблизно за 100 ms;
- інтерполяція віддалених сутностей із регульованою затримкою;
- локальні кулі показуються одразу, серверні замінюють їх після підтвердження;
- штучні `latency`, `jitter`, `drop` через query-параметри WebSocket;
- netgraph: RTT, snapshot age, bytes/s, pending inputs, correction magnitude, interpolation delay;
- бінарний протокол через `ArrayBuffer`/`DataView`, little-endian, versioned, angle як `Int16` у тисячних радіана;
- JSON залишено за прапорцем `?protocol=json` для порівняння;
- round-trip тести для binary codec;
- benchmark JSON vs binary;
- `/api/stats` із tick rate, tick duration та jitter.

## Архітектура

```text
client/  ── input ──>  WebSocket  ──>  server/Match
   │                                      │
   │ <──── snapshots / 30 Hz ────────────┘
   │
   └── prediction + reconciliation + interpolation

shared/
├── sim/
│   ├── integrate.js
│   ├── world.js
│   ├── entity.js
│   ├── collision.js
│   ├── vector.js
│   └── prng.js
├── codec/
│   ├── binary.js
│   └── json.js
└── protocol/
    └── index.js
```

## Бінарний формат

Усі числові поля кодуються **little-endian**.

```text
Input (12 bytes)
0      version: Uint8
1      type: Uint8 (1 = input)
2..5   seq: Uint32
6..9   tick: Uint32
10     flags: bit0=thrust, bit1=fire
11     turn: Int8 (-1/0/1)
```

Snapshot:

```text
0      version: Uint8
1      type: Uint8 (2 = snapshot)
2..5   tick: Uint32
6..7   entityCount: Uint16
8..11  lastProcessedSeq: Uint32
12..15 score: Int32
16..   entities, 26 bytes each
```

Для сутності: `id Uint16`, `kind Uint8`, flags, `ownerId Uint16`, `x/y/vx/vy Float32`, `angle Int16` у `rad × 1000`, `hp Uint16`.

## Prediction / reconciliation

Клієнт одразу застосовує власні input до локального корабля. Вони зберігаються у `pendingInputs`.

Коли приходить snapshot:

1. береться authoritative стан корабля;
2. input із `seq <= lastProcessedSeq` видаляються;
3. інші pending input повторно програються через ту саму `shared`-функцію `integrate`;
4. різниця вимірюється як `correction magnitude`;
5. візуальна поправка згладжується приблизно за 100 ms.

Віддалені сутності малюються між двома останніми snapshots із затримкою інтерполяції.

## Netgraph і тестування затримки

Без затримки:

```text
http://localhost:5173/
```

100 ms latency + 30 ms jitter + 2% packet loss:

```text
http://localhost:5173/?latency=100&jitter=30&drop=2
```

JSON замість binary:

```text
http://localhost:5173/?protocol=json
```

Можна комбінувати:

```text
http://localhost:5173/?protocol=json&latency=100&jitter=30&drop=2
```

На HUD відображаються `RTT`, `SNAP AGE`, `RX/TX`, `PENDING`, `CORRECTION`, `INTERP`.

## Experiment — break determinism

Кнопка **Break determinism** в netgraph вмикає спеціальний режим, де клієнтський `integrate` додає `Math.random()`, а сервер продовжує детерміновану версію. Через це `correction` починає зростати. Після натискання **Fix determinism** випадкова складова вимикається.

## JSON vs binary measurements

Запуск:

```bash
node server/scripts/codec-benchmark.js
```

Поточні шаблонні поля для власних вимірювань:

| Codec               | Bytes/snapshot | KB/s per client (down) | KB/s per client (up) | Encode+decode µs |
| ------------------- | -------------: | ---------------------: | -------------------: | ---------------: |
| JSON                |            ___ |                    ___ |                  ___ |              ___ |
| Binary (`DataView`) |            ___ |                    ___ |                  ___ |              ___ |

## Network measurements

Записи для звіту після двох вкладок:

| Показник            | Без штучної затримки | 100 ms ± 30 ms, 2% drop |
| ------------------- | -------------------: | ----------------------: |
| RTT                 |               ___ ms |                  ___ ms |
| snapshot age        |               ___ ms |                  ___ ms |
| correction          |               ___ px |                  ___ px |
| pending inputs      |                  ___ |                     ___ |
| interpolation delay |               ___ ms |                  ___ ms |

## GIF

Записати **20 секунд двох вікон side-by-side** під час бою при `100 ms ± 30 ms` та `2% drop`, з netgraph. Після запису покласти GIF у `docs/two-player.gif` та залишити його на початку README перед цим заголовком.

## Запуск

```bash
npm install
Copy-Item .env.example .env
npm run dev:server
```

В іншому терміналі:

```bash
npm run dev:client
```

Перевірки:

```bash
npm run lint
npm run format:check
npm run build
npm test
```

Серверні endpoints:

```text
GET /health
GET /api/rooms
GET /api/stats
GET /api/replays
GET /api/replays/<id>
WS /ws
```

## Network write-up

**Затримка.** Input і snapshots проходять через WebSocket, тому клієнт може отримувати authoritative state із затримкою. Prediction прибирає затримку для власного керування, а interpolation приховує стрибки віддалених сутностей.

**Розбіжність стану.** Сервер використовує той самий deterministic `integrate`, тому в нормальному режимі correction у відкритому просторі має бути малою. Навмисний `Math.random()` показує, як швидко prediction починає розходитися.

**Чіти.** Клієнт не надсилає `x/y`; він надсилає тільки input. Сервер сам рахує світ, тому зміна координат у DevTools не є джерелом істини.

**Інтерполяція.** Обрано `100 ms` як стартове значення: це дає запас у кілька 30-Hz snapshots і зменшує видиму jitter-нестабільність, ціною перегляду віддалених сутностей трохи в минулому.

## Висновок

У Lab 05 гру переведено на модель authoritative server: клієнти передають input, сервер симулює світ на 30 Hz, а клієнти використовують prediction, reconciliation та interpolation. Дані snapshot/input передаються binary `DataView`, а JSON залишається режимом порівняння.
