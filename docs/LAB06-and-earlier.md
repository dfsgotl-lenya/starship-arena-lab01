# Lab 06 (і раніше) — TypeScript для протоколу та симуляції

## Starship Arena

Продовження лабораторних 1–5. Код симуляції, протоколу, сервера та клієнта переведено на TypeScript зі строгим контролем типів. Сама гра, Canvas і цикл симуляції лишилися без UI-фреймворку. У Lab 5 два клієнти грають через **authoritative Node.js server**. Клієнт передає тільки input (`thrust`, `turn`, `fire`), сервер є єдиним джерелом істини та надсилає snapshots зі швидкістю **30 Hz**.

## Що зроблено

- створено спільний workspace `shared/` для симуляції та протоколу;
- `shared/sim/integrate.ts` — детермінована фізика без DOM/Node API;
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
├── types.ts              # EntityId / Tick / Seq + model
├── sim/
│   ├── integrate.ts
│   ├── world.ts
│   ├── entity.ts
│   ├── collision.ts
│   ├── vector.ts
│   └── prng.ts
├── codec/
│   ├── binary.ts
│   └── json.ts
└── protocol/
    └── index.ts           # Zod schemas + inferred message types
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
npm run bench:codec
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

```powershell
npm install
Copy-Item .env.example .env
npm run dev:server
```

В іншому терміналі:

```bash
npm run dev:client
```

Перевірки:

```powershell
npm run typecheck
npm test
npm run build
npm run lint
npm run format:check
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

## Lab 06 — що змінилося в TypeScript

- Усі модулі `shared/`, `server/src/` і `client/src/` мають розширення `.ts`; клієнт і сервер перевіряються одним кореневим `tsconfig.json`.
- Увімкнено `strict`, `noUncheckedIndexedAccess` і `useUnknownInCatchVariables`. `npm run typecheck` запускає `tsc --noEmit` і виконується в GitHub Actions.
- Вектор `Vector2` має `readonly x` та `readonly y`. Моделі snapshots — об'єднання сутностей за `kind`; клієнтські повідомлення — об'єднання за `type`. У відповідних `switch` є `default` з `never`.
- `EntityId`, `Tick` і `Seq` — branded-типи. У звичайному JavaScript це числа, але TypeScript не дозволяє випадково передати sequence number замість ID; функції-конструктори також перевіряють діапазони.
- `ClientMessageSchema`, `ServerMessageSchema`, snapshot і конфігурація оточення перевіряються Zod у runtime. `parseClientMessage(unknown)` повертає типізований результат, не кидає помилку на зламаному JSON, а WebSocket-обробник записує відмову в лог і закриває з'єднання.
- Бінарний decoder перевіряє версію, тип повідомлення, точну довжину, кількість сутностей, прапорці, допустимий напрямок руху й скінченність числових значень.
- Події кімнати мають типізовані payload-и через `EventEmitter`; у браузері `Bus<Events>` пов'язує ім'я події з її payload. У `catch` помилки розглядаються як `unknown`.

### Три важливі типи простими словами

1. **Structural types** — важлива форма об'єкта, а не назва класу. Наприклад, функції, які рухають корабель, отримують об'єкт з потрібними полями корабля і стан керування.
2. **Discriminated union** — об'єднання кількох форм, які мають спільний маркер. `kind: "ship" | "bullet" | "asteroid" | "pickup"` дозволяє TypeScript знати, що поле `hp` є в корабля, а `ownerId` — у кулі.
3. **Branded types** — числа, які лишаються числами під час виконання, але мають різні типи на етапі компіляції. `EntityId`, `Tick` і `Seq` не можна плутати між собою.

### Що допоміг виявити TypeScript

Типи відокремлюють UUID гравця (`string`) від числового `EntityId` корабля. Під час reconciliation кулі потрібно зіставляти за `shipId`, а не за `playerId`: це різні ідентифікатори, попри те, що обидва стосуються одного гравця. Також `Map.get()` і доступ за індексом можуть повернути `undefined`; код перевіряє ці випадки замість неявно припускати, що елемент існує.

### Чому без React / Vue / Svelte

У цій лабораторній роботі фреймворк не додавався: основна складність — Canvas, цикл гри, симуляція й мережевий протокол. Вони залишаються незалежними від DOM-фреймворку, а невелике лобі та HUD вже достатньо описані TypeScript-модулями. Додавання фреймворку лише заради переходу на TypeScript збільшило б залежності без користі для симуляції.

### Перевірка Lab 06

```bash
npm install
npm run typecheck
npm test
npm run build
npm run lint
npm run format:check
```

CI автоматично запускає `npm run typecheck`, тести та збірку клієнта. Перед здачею потрібно виконати ці команди в локальному оточенні, перевірити гру за сценарієм Lab 5 і лише тоді поставити тег `lab-06`.

## Висновок

У Lab 06 симуляція, сервер і клієнт переведені на TypeScript. Статичні типи відсікають частину помилок під час збірки, а Zod продовжує перевіряти мережеві дані та змінні оточення під час виконання. Авторитетна серверна симуляція, prediction, reconciliation, interpolation і binary `DataView` збережені; Canvas та ігровий цикл не залежать від UI-фреймворку.
