export function createAudioEngine() {
  let context = null;
  const buffers = new Map();
  let attached = false;

  const ensureContext = async () => {
    if (!context) context = new window.AudioContext();
    if (context.state !== "running") await context.resume();
    return context;
  };

  const play = async (name, gain = 0.35) => {
    if (!context || context.state !== "running") return;
    const buffer = buffers.get(name);
    if (!buffer) return;
    const source = context.createBufferSource();
    const volume = context.createGain();
    volume.gain.value = gain;
    source.buffer = buffer;
    source.connect(volume).connect(context.destination);
    source.start();
  };

  return {
    setBuffers(soundBuffers) {
      for (const [name, buffer] of Object.entries(soundBuffers))
        buffers.set(name, buffer);
    },
    async unlock() {
      await ensureContext();
    },
    attach(events) {
      if (attached) return;
      attached = true;
      events.addEventListener("fired", () => {
        void play("fired", 0.24);
      });
      events.addEventListener("hit", () => {
        void play("hit", 0.3);
      });
      events.addEventListener("exploded", () => {
        void play("exploded", 0.34);
      });
    },
    dispose() {
      if (context) void context.close();
      buffers.clear();
    },
  };
}
