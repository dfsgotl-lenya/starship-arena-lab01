# Lab 02 — короткий план захисту

## 1. Що зроблено

У Lab 02 plain-object корабель із Lab 01 перероблено на `class Ship extends Entity`. Додано `Vector2`, `World` на базі `Map`, кулі, астероїди, pickup, вибухи, колізії, HP, score та respawn.

## 2. `this`

Показати в консолі:

```js
const detachedFire = ship.fire;
detachedFire(world);
```

Це втрата receiver: у від'єднаного виклику `this` не є кораблем.

У грі виправлення:

```js
window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    world.playerShip?.fire(world);
  }
});
```

Тут `fire()` викликається як метод саме об'єкта `world.playerShip`.

Альтернативи: `bind` або class field arrow function. Для спільного prototype method використано окремий arrow callback у listener.

## 3. Чотири правила `this`

Порядок для цього курсу:

1. `new` binding;
2. explicit binding (`call/apply/bind`);
3. implicit binding (`obj.method()`);
4. default binding (`method()`; у strict mode — `undefined`).

Arrow functions не мають власного `this` і беруть його лексично із зовнішнього scope.

## 4. Чому `Map`

`World` зберігає `Map<id, Entity>` тому що:

- ключі залишаються числами;
- є `size`;
- є явні `set/get/delete` та insertion order;
- немає проблеми з успадкованими властивостями звичайного object dictionary.

## 5. Чому композиція

Одна і та сама homing-поведінка може бути приєднана і до `Bullet`, і до `Asteroid`:

```js
entity.homing = createHomingBehavior(...);
```

Pickup взагалі не повинен бути `Ship` або `MovingEntity`: він є окремою сутністю з колайдером і методом `collect`.

Глибоке дерево `Entity -> Moving -> Homing -> ...` швидко стає незручним, тому поведінки зберігаються як окремі компоненти.

## 6. Що показати під час демо

1. Рух корабля.
2. SPACE — стрільба.
3. Попадання кулі в астероїд — очки та вибух.
4. `SHIELD` та `RAPID` pickup.
5. Homing-куля та homing-астероїд.
6. Отримання шкоди, смерть і респаун через 2 секунди.
7. DevTools → Console — prototype та detached `this` експеримент.
