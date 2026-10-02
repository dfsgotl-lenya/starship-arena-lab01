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
