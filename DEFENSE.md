# Lab 05 — захист (5 хв)

1. Показати два вікна в одній кімнаті.
2. Пояснити: клієнт передає `seq/thrust/turn/fire`, координати не передає.
3. Показати `NETGRAPH`: RTT, snapshot age, bytes/s, pending, correction, interpolation.
4. Утримувати W: корабель реагує одразу → це prediction.
5. Увімкнути `latency=100&jitter=30&drop=2` і показати, що remote entities плавні через interpolation.
6. Натиснути `Break determinism`: correction росте. Повернути `Fix determinism`.
7. Натиснути `?protocol=json` та порівняти traffic із binary.

### Reflection

**1. Чому authoritative server?** Щоб клієнт не міг визначати істинний стан гри. Надсилання координат дозволило б підробити позицію й створювало б різні світи через drift/loss.

**2. Від чого залежить prediction?** Від детермінізму спільної симуляції. Порушення видно за зростанням reconciliation correction.

**3. Як працює reconciliation?** Snapshot tick 100 із `lastProcessedSeq=57`: client ставить authoritative state, видаляє input `<=57`, потім повторно програє `58+` до поточного prediction tick.

**4. Навіщо interpolation у минулому?** Щоб мати дві точки для плавної інтерполяції. Компроміс: більше затримки → менше jitter.

**5. Що таке lag compensation?** Сервер може враховувати історичний стан під час hit detection, бо клієнт бачить remote player із interpolation delay.

**6. DataView vs Float32Array?** `DataView` підходить для протоколу зі змішаними типами й явним endian. `Float32Array` зручний для однорідних локальних масивів.

# Lab 06 — захист TypeScript (5 хв)

1. Запустити сервер і клієнт та відкрити гру у двох вікнах, як у Lab 5. Показати, що Canvas і мережевий режим працюють так само.
2. Відкрити `shared/types.ts`: пояснити `EntityId`, `Tick` і `Seq`. Усі три значення є числами під час виконання, але бренди не дають переплутати їх під час компіляції.
3. Показати `SnapshotEntity` і `ClientMessage`: поле `kind` або `type` допомагає TypeScript звузити тип у `switch`; `assertNever` ловить неповний обробник нового варіанта.
4. Показати `ClientMessageSchema` та `parseClientMessage(unknown)`: типізація сама по собі не перевіряє мережеві байти, тому Zod перевіряє форму даних у runtime. Пошкоджений JSON повертає помилку розбору, сервер записує її в лог і закриває сокет.
5. Показати `decodeInput` або `decodeSnapshot`: перевірки версії, довжини, кількості сутностей і числових діапазонів захищають від некоректного пакета.
6. Запустити `npm run typecheck`, `npm test` і `npm run build`. Для демо помилки показати, що `Seq` не можна передати як `EntityId`, а `Map.get()` може повернути `undefined` і потребує перевірки.

### Reflection — короткі відповіді

- **Чому `unknown`, а не `any`?** `unknown` змушує перевірити значення перед використанням; `any` вимикає значну частину статичного контролю.
- **Чому потрібен Zod, якщо є TypeScript?** Типи стираються під час збірки. Дані з WebSocket і `.env` надходять у runtime, тому їхню структуру й діапазони треба перевіряти насправді.
- **Чому не додавали React/Vue/Svelte?** Canvas і fixed-step loop не залежать від DOM-фреймворку; для лобі й HUD наявних TypeScript-модулів достатньо, а ще одна UI-залежність не допомогла б протоколу чи симуляції.
