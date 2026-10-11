// Favicon Generator
// Paints a bold V chevron in the upper-left corner of the shared
// images/Gg.png Gospelgo logo, producing images/favicon-verselist-v1.png —
// the same corner-mark trick the other Gospelgo apps use to make their own
// browser tabs tellable apart from a plain Gg.png tab and from each other
// (see BiblePeruser/scripts/generate-favicon.js: one gold pill bar,
// BibleExplorerWebsite/scripts/generate-favicon-v3.js: three stacked orange
// pill bars, BiblePlaces/scripts/generate-favicon.mjs: a red map-pin
// silhouette). Each picks its own app's accent color plus a shape bold
// enough to survive the downscale to a real 16x16 favicon — Explorer's own
// history notes a hand-drawn letter "E" tested *worse* than solid color
// blocks at that size. A chevron V avoided that trap in testing here
// (rendered to an actual 16x16 canvas, not just eyeballed at full
// resolution, the same way Explorer verified its bars): unlike a typeset
// letter's thin curved strokes, it's two straight thick strokes, so it
// survives downscaling and still reads as "V". A second candidate (tapering
// list bars) was tried and rejected — at 16x16 it read as a plain colored
// block, no more distinctive than a solid rectangle.
//
// Usage: node scripts/generate-favicon.js
//
// No npm install — only Node's built-in zlib (PNG is just DEFLATE-compressed
// scanlines in a well-documented container) and fs. Only handles the one PNG
// shape images/Gg.png actually is (8-bit depth, RGBA color type,
// non-interlaced) — not a general-purpose PNG codec.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SOURCE = path.join(__dirname, "..", "images", "Gg.png");

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// A brighter, lighter blue than this app's UI --accent-vivid (#3f63d0) —
// the chevron's top corners poke past the teal circle onto transparent
// background, which shows through as the browser's own dark tab color, and
// #3f63d0's relative luminance (~0.39) read as dull/muddy there. #4C96FF
// lifts luminance to ~0.55 while staying clearly blue rather than drifting
// toward the logo's own cyan (0,254,254).
const BLUE = [76, 150, 255, 255]; // #4c96ff

function readChunks(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Not a PNG file");
  }
  const chunks = [];
  let offset = 8;
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    chunks.push({ type, data });
    offset += 12 + len; // length + type + data + crc
  }
  return chunks;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilter(inflated, width, height, bpp) {
  const rowBytes = width * bpp;
  const out = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    const filterType = inflated[y * (rowBytes + 1)];
    const srcStart = y * (rowBytes + 1) + 1;
    const rowOut = out.subarray(y * rowBytes, (y + 1) * rowBytes);
    const prevRowOut = y > 0 ? out.subarray((y - 1) * rowBytes, y * rowBytes) : null;
    for (let x = 0; x < rowBytes; x++) {
      const raw = inflated[srcStart + x];
      const a = x >= bpp ? rowOut[x - bpp] : 0;
      const b = prevRowOut ? prevRowOut[x] : 0;
      const c = prevRowOut && x >= bpp ? prevRowOut[x - bpp] : 0;
      let value;
      switch (filterType) {
        case 0: value = raw; break;
        case 1: value = raw + a; break;
        case 2: value = raw + b; break;
        case 3: value = raw + Math.floor((a + b) / 2); break;
        case 4: value = raw + paethPredictor(a, b, c); break;
        default: throw new Error(`Unsupported PNG filter type ${filterType}`);
      }
      rowOut[x] = value & 0xff;
    }
  }
  return out;
}

function refilterNone(pixels, width, height, bpp) {
  const rowBytes = width * bpp;
  const out = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    out[y * (rowBytes + 1)] = 0;
    pixels.copy(out, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  return out;
}

function setPixel(pixels, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width) return;
  const idx = (y * width + x) * 4;
  if (idx < 0 || idx + 3 >= pixels.length) return;
  pixels[idx] = color[0];
  pixels[idx + 1] = color[1];
  pixels[idx + 2] = color[2];
  pixels[idx + 3] = color[3];
}

// Distance from point (px,py) to the segment (x1,y1)-(x2,y2).
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// A bold V made of two thick straight strokes meeting at a point — a
// chevron, not a typeset letter, so it stays one solid readable shape
// rather than thin strokes that blur together when downscaled.
function paintChevronV(pixels, width, box, thickness, color) {
  const { x, y, w, h } = box;
  const apex = { x: x + w / 2, y: y + h };
  const left = { x, y };
  const right = { x: x + w, y };
  for (let py = y - thickness; py < y + h + thickness; py++) {
    for (let px = x - thickness; px < x + w + thickness; px++) {
      const d = Math.min(
        distToSegment(px, py, left.x, left.y, apex.x, apex.y),
        distToSegment(px, py, right.x, right.y, apex.x, apex.y),
      );
      if (d <= thickness / 2) setPixel(pixels, width, px, py, color);
    }
  }
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typeAndData) >>> 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function loadSource() {
  const source = fs.readFileSync(SOURCE);
  const chunks = readChunks(source);
  const ihdrChunk = chunks.find((c) => c.type === "IHDR");
  if (!ihdrChunk) throw new Error("Missing IHDR chunk");

  const width = ihdrChunk.data.readUInt32BE(0);
  const height = ihdrChunk.data.readUInt32BE(4);
  const bitDepth = ihdrChunk.data.readUInt8(8);
  const colorType = ihdrChunk.data.readUInt8(9);
  const interlace = ihdrChunk.data.readUInt8(12);
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(
      `Unsupported PNG format (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}) — this script only handles 8-bit RGBA, non-interlaced`,
    );
  }

  const idatData = Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data));
  const inflated = zlib.inflateSync(idatData);
  const pixels = unfilter(inflated, width, height, 4);
  return { pixels, width, height, ihdrData: ihdrChunk.data };
}

function writePng(outputPath, pixels, width, height, ihdrData) {
  const filtered = refilterNone(pixels, width, height, 4);
  const newIdat = zlib.deflateSync(filtered, { level: 9 });
  const png = Buffer.concat([
    PNG_SIGNATURE,
    makeChunk("IHDR", ihdrData),
    makeChunk("IDAT", newIdat),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(outputPath, png);
  console.log(`Wrote ${outputPath}`);
}

function main() {
  // Same corner/footprint as the other apps' marks (roughly a 240x220 box
  // inside the 512x512 source).
  const { pixels, width, height, ihdrData } = loadSource();
  paintChevronV(pixels, width, { x: 20, y: 20, w: 240, h: 220 }, 76, BLUE);
  writePng(path.join(__dirname, "..", "images", "favicon-verselist-v1.png"), pixels, width, height, ihdrData);
}

main();
