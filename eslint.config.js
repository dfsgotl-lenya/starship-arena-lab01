import eslint from "@eslint/js";

export default [
  { ignores: ["client/dist/**", "node_modules/**", "logs/**"] },
  eslint.configs.recommended,
  {
    files: ["client/src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        EventTarget: "readonly",
        CustomEvent: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        AudioContext: "readonly",
        OfflineAudioContext: "readonly",
        document: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        ResizeObserver: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        fetch: "readonly",
        WebSocket: "readonly",
      },
    },
    rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  },
  {
    files: ["server/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  },
];
