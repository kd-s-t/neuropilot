"use strict";
const path = require("path");
const polyfill = path.join(__dirname, "snapshot-polyfill.cjs");
require(polyfill);
const add = "--require " + polyfill;
process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || "").trim()
  ? process.env.NODE_OPTIONS + " " + add
  : add;
require("./node_modules/next/dist/bin/next");
