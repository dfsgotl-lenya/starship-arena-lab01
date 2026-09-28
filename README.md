# Lab 02 — Objects, Prototypes, and `this`

## Starship Arena

Продовження **Lab 01** у тому самому проєкті. Цього разу я переробив ігрові сутності з plain objects у класи, додав `Map`-сховище світу, стрільбу, зіткнення, HP, вибухи, респаун, pickup та homing-компонент. Вимоги Lab 02 включають `Vector2`, `Entity`, один рівень `extends`, `World` поверх `Map`, `Bullet`, `Asteroid`, `Pickup`, `Explosion`, приватне `#hp`, окрему систему circle-circle collisions, фікс `this` та композицію для homing/pickup.

## Що я зробив

### 1. `Vector2` і базова `Entity`

`src/sim/vector.js` містить чисті методи `add`, `sub`, `scale`, `length`, `normalize`, `rotate`, `dot` і `static fromAngle`. Вони повертають нові вектори та не мутують аргументи.

`src/sim/entity.js` містить базову `Entity` з `id`, `pos`, `vel`, `radius`, `angle`, `alive`, `kind`, попереднім станом для інтерполяції та приватним статичним лічильником ID.

### 2. `Ship extends Entity`

Корабель тепер є класом, який наслідує `Entity` на один рівень. У `Ship` є приватне поле `#hp` і публічний `get hp()`.

Корабель має:

- рух і поворот з Lab 01;
- cooldown стрільби;
- `fire(world)` — створює кулю з носа корабля та передає кулі власну швидкість;
- shield і rapid-fire стани від pickup.

### 3. `World` + `Map`

`src/sim/world.js` зберігає всі сутності в `Map<id, Entity>`.

Реалізовано:

- `spawn(entity)`;
- `despawn(id)` через `alive = false`;
- безпечний sweep мертвих сутностей наприкінці `step()`;
- `get(id)`;
- `[Symbol.iterator]` для `for...of world`;
- `*ofKind(kind)` як генератор;
- `World.step(dt, context)`.

Таким чином рендер і системи працюють із єдиним сховищем сутностей.

### 4. Кулі та астероїди

`Bullet` має TTL 2.2 секунди та зникає після завершення TTL або виходу за межі арени.

`Asteroid` рухається, обертається та відбивається від меж арени. Частина астероїдів отримує homing-поведінку.

### 5. Колізії та шкода

`src/sim/collision.js` є окремою системою circle-circle collision з наївною складністю `O(n²)`.

Реалізовано взаємодії:

- куля → астероїд: знищення + очки + вибух;
- куля → корабель: шкода;
- астероїд → корабель: шкода;
- корабель → pickup: активація бонусу.

Після смерті корабля створюється вибух, корабель прибирається з `Map`, а через 2 секунди створюється новий корабель у безпечній точці.

### 6. Виправлення `this`

Проблема була продемонстрована окремо в консолі. Якщо забрати метод у змінну:

```js
const detachedFire = ship.fire;
detachedFire(world);
```

метод втрачає receiver, тому `this` більше не вказує на `ship`.

Для реального обробника клавіатури я використав стрілковий callback:

```js
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !event.repeat) {
    world.playerShip?.fire(world);
  }
});
```

Тут стрілка не створює власного `this`, а ми явно звертаємося до потрібного корабля. Альтернативи з методички: `ship.fire.bind(ship)` або class field `fire = () => { ... }`. Перший створює bound function, другий створює окрему arrow-function для кожного екземпляра; тому в проєкті обрано звичайний prototype method + один arrow callback на listener.

### 7. Композиція: homing і pickup

Замість глибокого дерева класів використано композицію.

Homing — це окремий об'єкт-поведінка з `update(owner, world, dt)`. Його можна приєднати як:

```js
bullet.homing = createHomingBehavior(...);
asteroid.homing = createHomingBehavior(...);
```

Тому немає потреби створювати `HomingBullet` і `HomingAsteroid` з окремими гілками спадкування.

Pickup теж не є підкласом корабля: це окрема `Entity` з `kind = "pickup"`, власною поведінкою і методом `collect(ship)`.

**Як виглядала б спадкова версія:**

```text
Entity
├── MovingEntity
│   ├── Ship
│   ├── Bullet
│   └── Asteroid
│       └── HomingAsteroid
└── HomingBullet
```

Але тоді рух, targeting і shooting починають комбінуватися через нові підкласи. У поточній версії поведінки додаються окремо до тих сутностей, яким вони потрібні. Це відповідає вимозі лабораторної про composition over inheritance.

## Прототипний експеримент

У DevTools → Console під час запуску виводяться три короткі експерименти:

1. `Object.create()` показує delegation через prototype.
2. Від'єднаний `ship.fire` демонструє проблему з `this`.
3. Порівнюється `object[1]`, `Map.get(1)` і `Map.get("1")`.

## Керування

- `W` / `↑` — тяга;
- `A` / `←` — поворот ліворуч;
- `D` / `→` — поворот праворуч;
- `SPACE` — стрільба;
- `R` — скидання арени.

Під час гри потрібно знищувати астероїди, збирати `SHIELD` та `RAPID`, а також перевіряти homing-об'єкти.

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
src/
├── main.js
├── input.js
├── loop.js
├── sim/
│   ├── vector.js
│   ├── entity.js
│   ├── ship.js
│   ├── bullet.js
│   ├── asteroid.js
│   ├── pickup.js
│   ├── explosion.js
│   ├── homing.js
│   ├── collision.js
│   ├── world.js
│   └── arena.js
└── render/
    ├── canvas.js
    └── draw.js
```

## Висновок

У Lab 02 я перейшов від одного plain-object корабля до моделі сутностей на класах та прототипах. `World` керує сутностями через `Map`, фізика і колізії відокремлені від рендера, а `this`-проблему для `fire()` виправлено через arrow callback. Homing і pickup реалізовані композицією, щоб не будувати глибоку ієрархію класів.
