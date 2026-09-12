import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const gerador = path.join(raiz, 'tools/gerar-firmware-unico.mjs');

test('sketch de uma aba está atualizado e não depende das outras abas', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'aquasense-unico-test-'));
  try {
    const destino = path.join(pasta, 'teste.ino');
    const resultado = spawnSync(process.execPath, [gerador, '--output', destino], { encoding: 'utf8' });
    assert.equal(resultado.status, 0, resultado.stderr);
    const gerado = fs.readFileSync(destino, 'utf8');
    const versionado = fs.readFileSync(path.join(raiz, 'firmware/aquasense_hc_sr04/aquasense_hc_sr04.ino'), 'utf8');
    assert.equal(gerado.replace(/\r\n/g, '\n'), versionado.replace(/\r\n/g, '\n'));
    assert.doesNotMatch(gerado, /^\s*#include\s+"/m);
    assert.ok(gerado.split('\n').length <= 1000);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('gerador recusa configuração privada no destino público', () => {
  // A barreira deve agir antes até de abrir o arquivo de credenciais.
  const resultado = spawnSync(process.execPath, [gerador, '--config', 'nao-ler-credenciais.h'], { encoding: 'utf8' });
  assert.notEqual(resultado.status, 0);
  assert.match(resultado.stderr, /fora do repositório/);
});
