# Захист Lab 01 — 5 хвилин

## 0:00–0:40 — Що зроблено

«Моя тема — Starship Arena. Я зробив керований космічний корабель на Canvas. Архітектура розділена на `loop.js`, `input.js`, `sim/`, `render/` та `experiments/`. Це ES modules, а фізика не має залежностей від DOM.»

## 0:40–1:30 — Fixed timestep

«`requestAnimationFrame` запускає render перед paint. Я додаю elapsed time в accumulator, а потім роблю стільки кроків `1/60`, скільки накопичилося. Тому на 60 і 120 Hz кількість simulation steps за секунду залишається близько 60. `alpha` використовується для інтерполяції між `previous` і `current`. Delta обмежений 250 ms, щоб після великого зависання не виникало spiral of death.»

## 1:30–2:20 — Input + фізика

«`createInput()` — замикання. Set натиснутих клавіш закритий усередині функції. Зовнішній код отримує `isDown` і `justPressed`. `integrate(ship, input, dt)` працює тільки зі state, input та dt: поворот, thrust, drag і speed clamp. Після інтегрування корабель wrap-иться через межі арени.»

## 2:20–3:00 — Canvas + interpolation

«Canvas збільшується на `devicePixelRatio`, але малювання працює в CSS-пікселях через transform. При resize canvas налаштовується повторно. Корабель малюється через `translate` і `rotate`. Для кута я використовую найкоротшу різницю, тому перехід біля 0/360° не стрибає.»

## 3:00–4:10 — Три експерименти

1. **100 ms busy-wait.** «Синхронний `while` блокує main thread. Поки callback не завершився, наступні JavaScript callbacks та rendering step не виконуються.»

2. **setInterval(16).** «Timer не синхронізований з paint, тому має jitter/drift. Я вимірюю FPS та стандартне відхилення інтервалу за 10 секунд і перевіряю background tab.»

3. **Variable dt.** «У variable mode physics оновлюється один раз на кадр з реальним `dt`. При CPU throttling частота кадрів змінюється, отже змінюється й траєкторія. Fixed step прибирає залежність simulation від refresh rate.»

## 4:10–5:00 — Типові питання

**Чому Promise `.then()` виконується перед `setTimeout(..., 0)`?**

«`.then()` додається в microtask queue, а timer — у task queue. Після синхронного коду microtasks очищуються раніше за наступну task.»

**Що таке `alpha`?**

«Це частка залишкового часу accumulator від одного fixed step: `alpha = accumulator / step`. Renderer змішує попередній і поточний state.»

**Чому це важливо для multiplayer?**

«Однаковий input + однакові fixed steps дають відтворювану simulation. Це основа для подальшого authoritative server і reconciliation.»
