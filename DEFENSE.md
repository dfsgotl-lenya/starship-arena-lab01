# Lab 04 — сценарій захисту (5 хв)

## 1. Показати запуск

Термінал 1:

```bash
npm run dev:server
```

Термінал 2:

```bash
npm run dev:client
```

Відкрити `http://localhost:5173`.

## 2. Два вікна

У двох вкладках ввести різні імена, вибрати одну кімнату та натиснути Join. Показати roster — обидва імені видно на обох клієнтах.

## 3. Чат

Написати повідомлення у першому вікні та показати появу повідомлення у другому.

## 4. Гра

Показати політ і `SPACE`. Координати корабля не передаються серверу — гра локальна, сервер на Lab 4 відповідає за кімнату та чат.

## 5. EventEmitter

Показати `server/src/rooms.js`: `Room extends EventEmitter`. Пояснити `join`, `leave`, `chat`, `empty` та чому `error` має listener.

## 6. Streams/backpressure

Показати `server/src/log/matchlog.js` і `server/src/log/replay.js`. Ланцюг: event → Transform → NDJSON → file; replay: read stream → HTTP response через pipeline. Пояснити `write() === false` і `drain`.

## 7. 2–3 короткі відповіді

**Чому два вікна можуть спілкуватися без polling?**
WebSocket створює постійне двобічне з'єднання; сервер може сам відправити `chat` і `roster` у кімнату.

**Що станеться при `/api/slow?ms=300`?**
Busy-loop блокує єдиний JS thread Node, тому на цей час інші handlers теж чекають.

**Що буде при `emit("error")` без listener?**
Node викине необроблену помилку; процес може завершитися. Тому emitters, що можуть помилитися, мають `error` listener.
