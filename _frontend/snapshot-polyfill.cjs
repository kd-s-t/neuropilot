"use strict";
try {
  const { AsyncLocalStorage } = require("async_hooks");
  if (typeof AsyncLocalStorage.snapshot !== "function") {
    AsyncLocalStorage.snapshot = function snapshot() {
      return function (fn, ...args) { return fn(...args); };
    };
  }
  if (typeof AsyncLocalStorage.bind !== "function") {
    AsyncLocalStorage.bind = function bind(fn) { return fn; };
  }
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
} catch (_) {}
