# Lab 01 — The Event Loop Is the Game Loop

## Starship Arena

Індивідуальна лабораторна робота з курсу **JavaScript — Build a Multiplayer Browser Game**.

Проєкт виконаний на **Vite + vanilla JavaScript + HTML5 Canvas 2D**. Поточний етап — один керований корабель; фізика відокремлена від DOM і рендера, тому цю симуляцію можна буде перевикористати для наступних лабораторних із мережевим клієнтом/сервером.

Лабораторна вимагає fixed timestep 60 Hz, рендер через `requestAnimationFrame`, інтерполяцію, closure-based input, DPR-aware canvas та три експерименти з навмисно зламаними циклами. citeturn928059view0turn928059view1

## Запуск

```bash
npm install
npm run dev
```

Відкрити адресу, яку покаже Vite, наприклад.

Перевірка:

```bash
npm run lint
npm run format:check
npm run build
```

Використовується Node.js 22 (`.nvmrc`), ES modules (`"type": "module"`) та ESLint + Prettier.

## Структура

```text
starship-arena-lab01/
├── index.html
├── package.json
├── eslint.config.js
├── .prettierrc.json
├── .nvmrc
├── src/
│   ├── main.js
│   ├── loop.js
│   ├── input.js
│   ├── experiments/
│   │   └── experiments.js
│   ├── sim/
│   │   ├── ship.js
│   │   └── arena.js
│   └── render/
│       ├── canvas.js
│       └── draw.js
└── README.md
```

## Що реалізовано

### 1. Fixed timestep + rAF

`src/loop.js` використовує акумулятор:

```js
accumulator += Math.min((now - last) / 1000, 0.25);
while (accumulator + 1e-9 >= 1 / 60) {
  simulate(1 / 60);
  accumulator -= 1 / 60;
}
render(accumulator / (1 / 60));
```

Таким чином симуляція завжди робить крок **1/60 секунди**, а `requestAnimationFrame` відповідає за відображення. Довгий кадр обмежується 250 ms, щоб не виникав spiral of death. `render()` отримує `alpha` для інтерполяції між попереднім і поточним станом. Саме такий accumulator-підхід вимагає M1/M3 лабораторної. citeturn579049view1turn928059view1

HUD у грі показує:

- `STEPS/S` — кількість кроків симуляції за секунду;
- `FRAMES/S` — частоту рендера;
- `FRAME` — тривалість останнього кадру.

На типовому дисплеї очікується близько **60 steps/s**, тоді як frames/s залежить від частоти оновлення екрана. citeturn579049view1turn928059view0

### 2. Closure-based input

`createInput()` ховає `Set` натиснутих клавіш у замиканні. Ззовні доступні лише методи `isDown(code)` та `justPressed(code)`, а також `endFrame()` для очищення edge-triggered стану.

Це відповідає ідеї лабораторної: приватний стан закритий усередині функції, а замикання є API. citeturn928059view0

### 3. Чиста фізика корабля

`src/sim/ship.js` містить:

```js
{ x, y, vx, vy, angle, thrust }
```

`integrate(ship, input, dt)` не знає про DOM, Canvas або браузерний UI. Він залежить тільки від переданого стану, input і `dt`, застосовує:

- поворот;
- прискорення вздовж напрямку корабля;
- drag;
- обмеження максимальної швидкості.

`src/sim/arena.js` реалізує wrapping через межі арени. Це залишає фізику відокремленою від рендера й підготовленою до повторного використання в майбутніх лабораторних.

### 4. Interpolation + DPR

Перед кожним simulation step зберігається `previousShip`. Під час рендера виконується лінійна інтерполяція позиції та швидкості, а кут інтерполюється через найкоротшу дугу, щоб не було стрибка з `359°` у `0°`.

Canvas масштабується через:

```js
canvas.width = cssWidth * devicePixelRatio;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
```

і перебудову при resize. Це відповідає вимозі DPR-aware canvas з лабораторної. citeturn928059view0turn928059view1

## Експерименти M4

> Важливо: числа нижче — це **місця для фактичного вимірювання у вашому браузері**. Я не підміняю реальні результати вигаданими значеннями. У застосунок додані кнопки, які автоматично показують вимірювання.

### Experiment 1 — 100 ms synchronous block

Увімкнути **Experiment 1: add 100 ms block**.

Логіка навмисно робить:

```js
while (performance.now() < end) {}
```

кожен 60-й кадр.

Очікуване спостереження: кожен 60-й кадр має помітний freeze/stutter. `FRAME` різко зростає приблизно на 100 ms, а `FRAMES/S` у цей момент падає. Клавіатура, скрол і інший JavaScript на тому самому потоці не можуть «обігнати» синхронний busy-wait, бо JS виконує поточний callback до завершення. citeturn579049view0

**Моє фактичне вимірювання:**

| Показник | Результат |
|---|---:|
| frame-time під час блокування | ___ ms |
| frames/s під час тесту | ___ fps |
| кількість блокувань за 10 s | ___ |

### Experiment 2 — `setInterval(frame, 16)`

Кнопка запускає 10-секундний `setInterval`-тест і вимірює середній FPS та jitter (`σ`) інтервалу. Під час тесту переключитися на іншу вкладку приблизно на 5 секунд і повернутися.

Лабораторна вимагає порівняти цей підхід із rAF: timers не синхронізовані з paint, їхній інтервал не дорівнює точним `16.667 ms`, а поведінка таймерів у background tab відрізняється від rAF. citeturn579049view1

**Моє фактичне вимірювання:**

| Показник | Результат |
|---|---:|
| `setInterval` FPS за 10 s | ___ fps |
| jitter σ | ___ ms |
| мінімальний інтервал | ___ ms |
| максимальний інтервал | ___ ms |
| що сталося у background tab | __________________ |

### Experiment 3 — variable timestep

Перемкнути **Experiment 3: variable timestep**. Для коректного порівняння:

1. Записати координати корабля через 5 секунд thrust без CPU throttling.
2. У DevTools встановити CPU throttling 6× і повторити тест.
3. Повернути fixed timestep і повторити обидва запуски.

Причина: при `simulate(dt)` один раз на кадр саме frame rate визначає кількість і розмір physics updates. При різній завантаженості CPU `dt` змінюється, отже траєкторія змінюється. Fixed timestep відв'язує simulation від частоти рендера; це особливо важливо для детермінізму та майбутньої multiplayer-мережі. citeturn579049view1turn928059view1

**Моє фактичне вимірювання координати після 5 s thrust:**

| Режим | Без throttling | CPU 6× |
|---|---:|---:|
| Variable dt | ___, ___ | ___, ___ |
| Fixed 1/60 s | ___, ___ | ___, ___ |

## Event loop — пояснення для захисту

JavaScript виконує код на одному main thread послідовно. `setTimeout`/`setInterval` та DOM events потрапляють у task queue, Promise callbacks — у microtask queue; microtasks очищаються перед переходом до наступної задачі та перед rendering opportunity. `requestAnimationFrame` належить до rendering step і викликається безпосередньо перед paint. citeturn579049view0turn579049view1

Тому для гри зручно розділити:

```text
input/tasks → microtasks → requestAnimationFrame → render/paint
                       ↘ fixed-step simulation
```

Приклад порядку:

```js
console.log("1");
setTimeout(() => console.log("2"), 0);
Promise.resolve().then(() => console.log("3"));
console.log("4");
```

Результат: `1, 4, 3, 2`. Promise reaction — microtask, тому вона виконується після синхронного коду, але до timer task. citeturn579049view0

## Reflection — готові відповіді на захист

### 1. Що таке call stack, heap, Web APIs, task queue, microtask queue?

Heap зберігає об'єкти, call stack містить активні виклики функцій. Browser Web APIs працюють поза JS engine і після завершення події додають callback у відповідну чергу. Task queue містить timer/DOM/I/O callbacks. Microtask queue містить, зокрема, Promise reactions та `queueMicrotask`. Microtasks очищаються повністю перед наступною task/rendering opportunity. citeturn579049view0

### 2. Чому 100 ms loop заморожує сторінку?

Тому що синхронний callback не віддає керування main thread, поки `while` не завершиться. Браузер не може паралельно виконати інший JavaScript або перейти до наступного rendering step на тому самому потоці. citeturn579049view0

### 3. Microtasks vs tasks

Після завершення поточного stack браузер/host обробляє microtasks до спорожнення черги. Потім може перейти до наступної task і rendering step. Нескінченний ланцюг microtasks тому може starve rendering. citeturn579049view0

### 4. Чому rAF кращий за setInterval для animation?

`requestAnimationFrame` виконується у rendering phase перед paint, синхронізується з частотою дисплея та зупиняється/призупиняється для hidden tabs. `setInterval(fn, 16)` — timer, він не прив'язаний до моменту paint і має drift/jitter. citeturn579049view1

### 5. Що робить accumulator loop?

Accumulated elapsed time складається у `accumulator`. Поки там є хоча б один `STEP = 1/60`, виконується physics update з однаковим `dt`. `alpha = accumulator / STEP` показує, наскільки ми знаходимося між двома simulation states; renderer змішує `previous` і `current` за цим коефіцієнтом. Clamp до 250 ms не дозволяє одному великому hitch створити сотні physics steps. citeturn579049view1

### 6. Навіщо детермінізм у multiplayer?

Коли однакова послідовність input застосовується до однакових fixed steps, physics дає відтворюваний результат. Це корисно для узгодження стану між клієнтом і authoritative server у наступних лабораторних. citeturn579049view1turn928059view2

### 7. Що захоплює closure?

Closure зберігає доступ до **змінних/lexical environment**, а не просто копіює їх значення. Через це `let` у циклі дає окреме binding на ітерацію, тоді як `var` використовує одне function-scoped binding. У цій лабі closure утримує приватний `Set` натиснутих клавіш. citeturn928059view0

### 8. Що дає `type="module"`?

Файл стає ES module зі своєю областю видимості, код працює у strict mode, `import/export` формують статичний dependency graph, модулі defer-яться до завершення parsing, а top-level `await` дозволений. citeturn579049view1

## Git checklist

Після перевірки:

```bash
git init
git add .
git commit -m "Lab 01: event loop and fixed game loop"
git tag lab-01
```

Потім створити **public GitHub repository**, додати remote і push:

```bash
git remote add origin https://github.com/<YOUR_LOGIN>/starship-arena-lab01.git
git branch -M main
git push -u origin main
git push origin lab-01
```

Вимога публічного GitHub repo з тегом `lab-01` і README з evidence/measurement є частиною definition of done лабораторної. citeturn928059view1turn928059view2
