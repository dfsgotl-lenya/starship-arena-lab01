Lab 01 — The Event Loop Is the Game Loop

Starship Arena

Індивідуальна лабораторна робота з курсу JavaScript — Build a Multiplayer Browser Game.

У цій роботі я створив браузерний прототип гри Starship Arena на Vite + vanilla JavaScript + HTML5 Canvas 2D. Реалізовано керування одним космічним кораблем, фізику його руху та ігровий цикл. Код фізики відокремлений від DOM і рендера, щоб у наступних лабораторних його можна було використати для multiplayer-версії.

Мета роботи

Дослідити роботу JavaScript Event Loop та реалізувати ігровий цикл із фіксованим кроком симуляції.

У роботі реалізовано:

requestAnimationFrame для рендера;

fixed timestep 1/60 с;

accumulator та інтерполяцію стану;

createInput() на основі замикання;

чисту функцію integrate(ship, input, dt) для фізики;

Canvas 2D з урахуванням devicePixelRatio;

загортання корабля через межі арени;

HUD із STEPS/S, FRAMES/S і тривалістю кадру;

три експерименти з навмисним погіршенням роботи циклу.

Технології

JavaScript (ES modules)

Vite

HTML5 Canvas 2D

ESLint

Prettier

Що було зроблено

1. Ігровий цикл

У src/loop.js реалізовано цикл на requestAnimationFrame. Час накопичується в accumulator, а симуляція виконується кроками однакової довжини:

const STEP = 1 / 60;

accumulator += Math.min((now - last) / 1000, 0.25);

while (accumulator >= STEP) {
  simulate(STEP);
  accumulator -= STEP;
}

const alpha = accumulator / STEP;
render(alpha);

Фізика працює з фіксованим dt = 1/60, незалежно від частоти оновлення монітора. Для відображення використовується інтерполяція між попереднім і поточним станом.

2. Обробка клавіатури через closure

У src/input.js створено createInput(). Натиснуті клавіші зберігаються у внутрішньому Set, доступ до якого мають тільки функція та повернені нею методи:

isDown(code)
justPressed(code)
endFrame()

Таким способом реалізовано приватний стан обробника клавіатури.

3. Фізика корабля

У src/sim/ship.js реалізовано стан корабля:

x, y       — координати
vx, vy     — швидкість
angle      — кут повороту
thrust     — стан тяги

Функція integrate(ship, input, dt) не залежить від DOM, Canvas чи UI. Вона виконує поворот, прискорення корабля, drag та обмеження максимальної швидкості.

4. Арена і wrapping

У src/sim/arena.js реалізовано загортання через межі арени. Якщо корабель виходить за одну межу, він з'являється з протилежного боку.

5. Canvas і devicePixelRatio

У src/render/canvas.js Canvas налаштовується відповідно до devicePixelRatio, щоб зображення залишалося чітким на дисплеях із високою щільністю пікселів. Також Canvas перебудовується при зміні розміру вікна.

6. Рендер корабля

У src/render/draw.js корабель малюється засобами Canvas 2D. Під час рендера використовується alpha для інтерполяції між двома станами симуляції.

Керування

W / ArrowUp — тяга;

A / ArrowLeft — поворот ліворуч;

D / ArrowRight — поворот праворуч.

Корабель може безперервно літати по арені завдяки wrapping.

Експерименти

Experiment 1 — блокування 100 ms

У цикл навмисно додано синхронний busy-wait приблизно на 100 ms.

Результат:

виникають затримки кадрів;

FRAME збільшується;

FRAMES/S зменшується;

JavaScript на основному потоці не може виконати інший код, поки блокуючий цикл не завершиться.

Мої вимірювання:

Показник

Результат

frame-time під час блокування

0.01 ms

frames/s під час тесту

129 fps

кількість блокувань за 10 s

24

Experiment 2 — setInterval замість rAF

Для порівняння використано:

setInterval(frame, 16);

Зібрано показники частоти кадрів та нерівномірності інтервалів.

Мої вимірювання:

Показник

Результат

setInterval FPS за 10 s

62.5 fps

jitter σ

1.32 ms

мінімальний інтервал

10.90 ms

максимальний інтервал

20.70 ms

поведінка у background tab

__________

Experiment 3 — variable timestep

Порівняно два режими симуляції: variable timestep та fixed timestep 1/60.

Тест виконано без throttling і з CPU throttling 6×.

Мої вимірювання координат після 5 s thrust:

Режим

Без throttling

CPU 6×

Variable dt

52, 350

45, 350

Fixed 1/60 s

77, 350

921, 350

Експеримент показує, що при variable timestep результат залежить від фактичного часу між кадрами, а fixed timestep відокремлює фізику від частоти рендера.

Event Loop

Під час виконання роботи я дослідив взаємодію:

JavaScript code
    ↓
Call Stack
    ↓
Tasks / Microtasks
    ↓
requestAnimationFrame
    ↓
Render / Paint

Це дозволило перевірити, чому блокуючий JavaScript зупиняє оновлення сторінки та чому requestAnimationFrame зручно використовувати для анімації.

Приклад порядку виконання:

console.log("1");

setTimeout(() => console.log("2"), 0);

Promise.resolve().then(() => console.log("3"));

console.log("4");

Результат:

1
4
3
2

Структура проєкту

starship-arena-lab01/
├── index.html
├── package.json
├── eslint.config.js
├── .prettierrc.json
├── .nvmrc
├── README.md
├── DEFENSE.md
└── src/
    ├── main.js
    ├── loop.js
    ├── input.js
    ├── experiments/
    │   └── experiments.js
    ├── sim/
    │   ├── ship.js
    │   └── arena.js
    └── render/
        ├── canvas.js
        └── draw.js

Запуск

npm install
npm run dev

Перевірка:

npm run lint
npm run format:check
npm run build

Висновок

У роботі я реалізував базовий ігровий цикл для браузерної гри та дослідив особливості виконання JavaScript через Event Loop. Було реалізовано fixed timestep, requestAnimationFrame, інтерполяцію, closure-based input, чисту фізику корабля, Canvas 2D та wrapping арени.

Три експерименти дозволили на практиці перевірити вплив блокуючого коду, setInterval і variable timestep на роботу гри.
