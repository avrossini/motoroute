// Gera os ícones do PWA a partir dos assets da marca.
// Uso (a partir de motoroute-app/):
//   npx --yes -p sharp node scripts/gen-pwa-icons.mjs
//
// Saída em assets/pwa/. Esses PNGs são copiados para o public/ de cada app
// (motoroute-app e motoroute-admin). Regerar quando a arte da marca mudar.
//
// Dívida de branding: hoje icon.png == adaptive-icon.png (mesmo arquivo, sem
// safe-zone). Quando houver uma arte "maskable" com padding de segurança,
// troque MASK para apontar pra ela e regenere os maskable-*.
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SRC = "./assets/icon.png"; // base geral (any)
const MASK = "./assets/adaptive-icon.png"; // fonte maskable (== icon hoje)
const OUT = "./assets/pwa";
const out = (n) => `${OUT}/${n}`;

await mkdir(OUT, { recursive: true });

await Promise.all([
  sharp(SRC).resize(192, 192).png().toFile(out("icon-192.png")),
  sharp(SRC).resize(512, 512).png().toFile(out("icon-512.png")),
  // maskable: preserva transparência; o Android aplica o recorte.
  sharp(MASK).resize(192, 192).png().toFile(out("maskable-192.png")),
  sharp(MASK).resize(512, 512).png().toFile(out("maskable-512.png")),
  sharp(SRC).resize(180, 180).png().toFile(out("apple-touch-icon.png")),
]);

console.log("PWA icons gerados em", OUT);
