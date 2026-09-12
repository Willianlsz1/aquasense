// Reúne os fontes já usados na bancada, sem manter outra implementação manual.
// Uso: node tools/gerar-firmware-unico.mjs
// Cópia privada: --config CAMINHO --output PASTA_EXTERNA/PASTA_EXTERNA.ino
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
function argumento(nome) {
  const i = args.indexOf(nome);
  if (i < 0) return null;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Falta valor para ${nome}`);
  return args[i + 1];
}
const config = argumento('--config');
const destino = path.resolve(argumento('--output') || path.join(raiz, 'firmware/aquasense_hc_sr04/aquasense_hc_sr04.ino'));
const relativo = path.relative(raiz, destino);
if (config && (!relativo.startsWith('..' + path.sep) && !path.isAbsolute(relativo))) {
  throw new Error('A cópia com credenciais deve ficar fora do repositório.');
}
function ler(nome) { return fs.readFileSync(path.join(raiz, 'firmware', nome), 'utf8'); }
function compacto(texto) {
  return texto.replace(/^\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*#pragma once\s*$/gm, '')
    .split(/\r?\n/)
    .filter(linha => !/^\s*\/\//.test(linha) || /^\/\/ =====/.test(linha))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
let configuracao = config ? fs.readFileSync(config, 'utf8') : ler('piezometro_config_local.h.example');
configuracao = compacto(configuracao);
let sensor = ler('sketch_demo_hc_sr04.ino')
  .replace(/^#include "(?:piezometro_config_local|piezometro_core)\.h"\s*$/gm, '')
  .replace(/^PIEZOMETRO_MAIN\(\)\s*$/gm, '');
// Os pinos e a escala ficam junto das configurações, antes das funções.
const inicioSensor = sensor.indexOf('float distanciaCm');
const ajustes = compacto(sensor.slice(0, inicioSensor));
sensor = compacto(sensor.slice(inicioSensor));
const tela = compacto(ler('tela.h'));
const oled = compacto(ler('tela_ssd1306.h').replace(/^#include "tela.h"\s*$/gm, ''));
const nucleo = compacto(ler('piezometro_core.h')
  .replace(/^#include "tela(?:_ssd1306)?\.h"\s*$/gm, '')
  .replace(/#define PIEZOMETRO_MAIN\(\)[\s\S]*$/, ''));
const texto = `// AQUASENSE — HC-SR04 + OLED SSD1306 — UMA ÚNICA ABA
// Gerado por tools/gerar-firmware-unico.mjs a partir dos fontes da bancada.
// Edite a configuração abaixo na cópia LOCAL da Arduino IDE.
// Não publique este arquivo depois de preencher senha e chave.
// Escala didática: max(0, 40 - distância em cm) * 0,5 m.
// ECHO no GPIO 18 exige divisor de tensão; mantenha a montagem já testada.
// Bibliotecas: Adafruit GFX e Adafruit SSD1306; placa ESP32 Dev Module.

${configuracao}

${ajustes}

// ===== TELA OLED =====
${tela}

${oled}

// ===== CONEXÃO, ENVIO E ALERTAS =====
${nucleo}

// ===== LEITURA DO HC-SR04 =====
${sensor}

// ===== INÍCIO E REPETIÇÃO =====
void setup() {
  initSensor();
  coreSetup();
}

void loop() {
  coreLoop();
}
`;
if (texto.split('\n').length > 1000) throw new Error('Sketch excedeu 1000 linhas.');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, texto);
console.log(`Sketch gerado: ${destino} (${texto.split('\n').length} linhas)`);
