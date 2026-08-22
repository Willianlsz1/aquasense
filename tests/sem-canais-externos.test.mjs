import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtimeFiles = [
  "cloudflare-worker/src/config.js",
  "cloudflare-worker/src/http.js",
  "cloudflare-worker/src/index.js",
  "cloudflare-worker/src/rotas.js",
  "cloudflare-worker/wrangler.toml",
];

const publicAndFirmwareFiles = [
  "readme.md",
  "cloudflare-worker/README.md",
  "docs/GUIA_MESTRE.md",
  "index.html",
  "firmware/sketch.ino",
  "firmware/sketch_fisico_jsn_sr04t.ino",
];

const externalChannelIdentifiers = [
  /TELEGRAM_/,
  /TWILIO_/,
  /sendTelegram/,
  /sendSMS/,
  /telegramOn/,
  /smsOn/,
];

const externalChannelReferences = [
  /telegram/i,
  /twilio/i,
  /\bsms\b/i,
];

test("runtime does not retain external alert-channel configuration or contracts", async () => {
  for (const relativePath of runtimeFiles) {
    const source = await readFile(new URL(relativePath, `file://${root}/`), "utf8");

    for (const identifier of externalChannelIdentifiers) {
      assert.doesNotMatch(source, identifier, `${relativePath} still exposes ${identifier}`);
    }
  }
});

test("public documentation and firmware comments describe only written and local alerts", async () => {
  for (const relativePath of publicAndFirmwareFiles) {
    const source = await readFile(new URL(relativePath, `file://${root}/`), "utf8");

    for (const reference of externalChannelReferences) {
      assert.doesNotMatch(source, reference, `${relativePath} still references ${reference}`);
    }
  }
});
