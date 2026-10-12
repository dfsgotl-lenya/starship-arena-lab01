export function createAudioEngine() {
  let context: AudioContext | null = null;
  const buffers = new Map<string, AudioBuffer>();
  let attached = false;

  const ensureContext = async (): Promise<AudioContext> => {
    if (!context) context = new window.AudioContext();
    if (context.state !== "running") await context.resume();
    return context;
  };
  const play = async (name: string, gain = 0.35): Promise<void> => {
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
    setBuffers(soundBuffers: Readonly<Record<string, AudioBuffer>>): void {
      for (const [name, buffer] of Object.entries(soundBuffers))
        buffers.set(name, buffer);
    },
    async unlock(): Promise<void> {
      await ensureContext();
    },
    attach(events: EventTarget): void {
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
    dispose(): void {
      if (context) void context.close();
      buffers.clear();
    },
  };
}
