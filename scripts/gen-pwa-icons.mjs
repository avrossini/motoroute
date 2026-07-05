// Gera os ícones do PWA a partir das artes da marca (símbolo "M Destino").
// Uso (a partir de motoroute-app/):
//   npm install sharp png-to-ico --no-save   # npm ci falha nesse repo (lock dessincronizado)
//   node scripts/gen-pwa-icons.mjs
//
// Fontes em assets/pwa/ (geradas no Gemini "Nano Banana 2", ver brand-manual §21.1):
//   Arte_1 = símbolo master (referência; não gera saída direta)
//   Arte_2 = maskable   Arte_3 = "any"   Arte_4 = apple-touch   Arte_5 = favicon (M sólido, sem pin)
// Saídas em assets/pwa/ são copiadas para o public/ de cada app.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const A = (n) => `./assets/pwa/Arte_${n}.png`;
const MASK = A(2), ANY = A(3), APPLE = A(4), FAV = A(5);
const OUT = "./assets/pwa";
const out = (n) => `${OUT}/${n}`;

await mkdir(OUT, { recursive: true });

// Conjunto raster do PWA (fundo full-bleed já vem embutido nas artes).
await Promise.all([
  sharp(ANY).resize(192, 192).png().toFile(out("icon-192.png")),
  sharp(ANY).resize(512, 512).png().toFile(out("icon-512.png")),
  sharp(MASK).resize(192, 192).png().toFile(out("maskable-192.png")),
  sharp(MASK).resize(512, 512).png().toFile(out("maskable-512.png")),
  sharp(APPLE).resize(180, 180).png().toFile(out("apple-touch-icon.png")),
  sharp(FAV).resize(48, 48).png().toFile(out("favicon.png")),
  // Fonte do favicon web do Expo (app.config web.favicon → gera favicon.ico no build).
  sharp(FAV).resize(512, 512).png().toFile("./assets/favicon.png"),
]);

// favicon.ico multi-size (16/32/48/64) — o admin (Next) serve app/favicon.ico.
const favBufs = await Promise.all(
  [16, 32, 48, 64].map((s) => sharp(FAV).resize(s, s).png().toBuffer())
);
await writeFile(out("favicon.ico"), await pngToIco(favBufs));

console.log("PWA icons + favicon.ico gerados em", OUT);
