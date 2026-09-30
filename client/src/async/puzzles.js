export function runOrderingPuzzles() {
  window.console.group("[Lab 03] Five microtask/task ordering puzzles");

  window.console.log(
    "P1 output: A, C, B | Promise reaction is a microtask, so sync logs finish first.",
  );
  window.console.log("P1:A");
  window.Promise.resolve().then(() => window.console.log("P1:B"));
  window.console.log("P1:C");

  (async () => {
    window.console.log("P2:A");
    await 0;
    window.console.log("P2:B");
  })();
  window.console.log(
    "P2:C | output: A, C, B | await yields and resumes as a microtask.",
  );

  window.Promise.resolve()
    .then(() => {
      window.console.log("P3:A");
      window.setTimeout(() => window.console.log("P3:D"), 0);
    })
    .then(() => window.console.log("P3:B"));
  window.console.log(
    "P3:C | output: C, A, B, D | the timer is a later task than both promise reactions.",
  );

  window.requestAnimationFrame(() =>
    window.console.log(
      "P4:rAF | output after current task + microtasks | rAF runs at the rendering opportunity before paint.",
    ),
  );
  window.Promise.resolve().then(() => window.console.log("P4:micro"));
  window.console.log("P4:sync");

  window.Promise.resolve().then(async () => {
    window.console.log("P5:A");
    await window.Promise.resolve();
    window.console.log("P5:B");
    await 0;
    window.console.log("P5:C");
  });
  window.console.log(
    "P5:D | output: D, A, B, C | each await yields to a later microtask turn.",
  );

  window.console.groupEnd();
}
