/**
 * Generate simple tabBar icons using PNG chunks
 * Creates minimal valid PNG files with colored shapes
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 81;
const OUTPUT_DIR = path.join(__dirname, '../images/tabbar');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Create PNG from raw RGBA pixels
function createPNG(pixels) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);  // width
  ihdr.writeUInt32BE(SIZE, 4);  // height
  ihdr.writeUInt8(8, 8);        // bit depth
  ihdr.writeUInt8(6, 9);        // color type (RGBA)
  ihdr.writeUInt8(0, 10);       // compression
  ihdr.writeUInt8(0, 11);       // filter
  ihdr.writeUInt8(0, 12);       // interlace

  // Add filter byte (0) to each row
  const rawData = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    rawData[y * (SIZE * 4 + 1)] = 0; // filter type: None
    pixels.copy(rawData, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }

  // Compress
  const compressed = zlib.deflateSync(rawData);

  // Build chunks
  function makeChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const typeBuffer = Buffer.from(type);
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData), 0);

    return Buffer.concat([length, typeBuffer, data, crc]);
  }

  // CRC32 calculation
  function crc32(data) {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Draw line with thickness
function drawLine(pixels, x1, y1, x2, y2, r, g, b, a, thickness = 3) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;

  let x = x1, y = y1;
  while (true) {
    // Draw thick point
    for (let tx = -Math.floor(thickness/2); tx <= Math.floor(thickness/2); tx++) {
      for (let ty = -Math.floor(thickness/2); ty <= Math.floor(thickness/2); ty++) {
        const px = x + tx, py = y + ty;
        if (px >= 0 && px < SIZE && py >= 0 && py < SIZE) {
          const idx = (py * SIZE + px) * 4;
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = a;
        }
      }
    }
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

// Draw circle outline
function drawCircle(pixels, cx, cy, radius, r, g, b, a, thickness = 3) {
  for (let angle = 0; angle < 360; angle += 2) {
    const rad = angle * Math.PI / 180;
    const x = Math.round(cx + radius * Math.cos(rad));
    const y = Math.round(cy + radius * Math.sin(rad));
    for (let tx = -Math.floor(thickness/2); tx <= Math.floor(thickness/2); tx++) {
      for (let ty = -Math.floor(thickness/2); ty <= Math.floor(thickness/2); ty++) {
        const px = x + tx, py = y + ty;
        if (px >= 0 && px < SIZE && py >= 0 && py < SIZE) {
          const idx = (py * SIZE + px) * 4;
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = a;
        }
      }
    }
  }
}

// Draw home icon
function drawHome(r, g, b) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4, 0);
  const cx = 40;

  // Roof
  drawLine(pixels, cx, 15, 20, 35, r, g, b, 255);
  drawLine(pixels, cx, 15, 60, 35, r, g, b, 255);

  // Walls
  drawLine(pixels, 20, 35, 20, 65, r, g, b, 255);
  drawLine(pixels, 60, 35, 60, 65, r, g, b, 255);
  drawLine(pixels, 20, 65, 60, 65, r, g, b, 255);

  // Door
  drawLine(pixels, 33, 45, 33, 65, r, g, b, 255, 2);
  drawLine(pixels, 47, 45, 47, 65, r, g, b, 255, 2);
  drawLine(pixels, 33, 45, 47, 45, r, g, b, 255, 2);

  return createPNG(pixels);
}

// Draw chat/square icon
function drawSquare(r, g, b) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4, 0);

  // Box
  drawLine(pixels, 15, 18, 65, 18, r, g, b, 255);
  drawLine(pixels, 15, 50, 65, 50, r, g, b, 255);
  drawLine(pixels, 15, 18, 15, 50, r, g, b, 255);
  drawLine(pixels, 65, 18, 65, 50, r, g, b, 255);

  // Tail
  drawLine(pixels, 25, 50, 20, 62, r, g, b, 255);
  drawLine(pixels, 20, 62, 35, 50, r, g, b, 255);

  return createPNG(pixels);
}

// Draw trophy icon
function drawTrophy(r, g, b) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4, 0);

  // Cup top
  drawLine(pixels, 25, 15, 55, 15, r, g, b, 255);

  // Cup sides
  drawLine(pixels, 25, 15, 30, 40, r, g, b, 255);
  drawLine(pixels, 55, 15, 50, 40, r, g, b, 255);
  drawLine(pixels, 30, 40, 50, 40, r, g, b, 255);

  // Stem
  drawLine(pixels, 40, 40, 40, 55, r, g, b, 255, 2);

  // Base
  drawLine(pixels, 30, 55, 50, 55, r, g, b, 255);
  drawLine(pixels, 28, 62, 52, 62, r, g, b, 255);
  drawLine(pixels, 30, 55, 28, 62, r, g, b, 255);
  drawLine(pixels, 50, 55, 52, 62, r, g, b, 255);

  return createPNG(pixels);
}

// Draw profile/user icon
function drawProfile(r, g, b) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4, 0);

  // Head
  drawCircle(pixels, 40, 25, 12, r, g, b, 255);

  // Body (arc)
  for (let angle = 200; angle <= 340; angle += 3) {
    const rad = angle * Math.PI / 180;
    const x = Math.round(40 + 22 * Math.cos(rad));
    const y = Math.round(68 + 22 * Math.sin(rad));
    for (let t = -1; t <= 1; t++) {
      for (let s = -1; s <= 1; s++) {
        const px = x + t, py = y + s;
        if (px >= 0 && px < SIZE && py >= 0 && py < SIZE) {
          const idx = (py * SIZE + px) * 4;
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = 255;
        }
      }
    }
  }

  return createPNG(pixels);
}

// Generate all icons
function generateIcons() {
  console.log('🎨 Generating tabBar icons...\n');

  const GRAY = [156, 163, 175];   // #9CA3AF
  const ORANGE = [255, 107, 0];   // #FF6B00

  const icons = [
    { name: 'home', draw: drawHome },
    { name: 'square', draw: drawSquare },
    { name: 'trophy', draw: drawTrophy },
    { name: 'profile', draw: drawProfile }
  ];

  for (const icon of icons) {
    // Gray (inactive)
    const grayPng = icon.draw(...GRAY);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${icon.name}.png`), grayPng);
    console.log(`✅ ${icon.name}.png`);

    // Orange (active)
    const orangePng = icon.draw(...ORANGE);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${icon.name}-active.png`), orangePng);
    console.log(`✅ ${icon.name}-active.png`);
  }

  console.log('\n✨ All icons generated!');
}

generateIcons();
