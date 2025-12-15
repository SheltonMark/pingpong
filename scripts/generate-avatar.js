/**
 * Generate default avatar PNG
 * Creates a simple user silhouette icon
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 200;
const OUTPUT_DIR = path.join(__dirname, '../images');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Create PNG from raw RGBA pixels
function createPNG(pixels, size) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr.writeUInt8(8, 8);        // bit depth
  ihdr.writeUInt8(6, 9);        // color type (RGBA)
  ihdr.writeUInt8(0, 10);       // compression
  ihdr.writeUInt8(0, 11);       // filter
  ihdr.writeUInt8(0, 12);       // interlace

  // Add filter byte (0) to each row
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rawData[y * (size * 4 + 1)] = 0; // filter type: None
    pixels.copy(rawData, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
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

// Draw filled circle
function fillCircle(pixels, cx, cy, radius, r, g, b, a, size) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        const idx = (y * size + x) * 4;
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = a;
      }
    }
  }
}

// Draw default avatar (user silhouette on gray background)
function drawDefaultAvatar() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4, 0);

  // Fill background with light gray
  const bgR = 229, bgG = 231, bgB = 235; // #E5E7EB (gray-200)
  for (let i = 0; i < SIZE * SIZE; i++) {
    pixels[i * 4] = bgR;
    pixels[i * 4 + 1] = bgG;
    pixels[i * 4 + 2] = bgB;
    pixels[i * 4 + 3] = 255;
  }

  // Draw user icon (head + body) in darker gray
  const iconR = 156, iconG = 163, iconB = 175; // #9CA3AF (gray-400)

  // Head circle
  fillCircle(pixels, SIZE / 2, SIZE * 0.35, SIZE * 0.18, iconR, iconG, iconB, 255, SIZE);

  // Body (half circle at bottom)
  for (let y = Math.floor(SIZE * 0.55); y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - SIZE / 2;
      const dy = y - SIZE * 0.9;
      const radius = SIZE * 0.35;
      if (dx * dx + dy * dy <= radius * radius) {
        const idx = (y * SIZE + x) * 4;
        pixels[idx] = iconR;
        pixels[idx + 1] = iconG;
        pixels[idx + 2] = iconB;
        pixels[idx + 3] = 255;
      }
    }
  }

  return createPNG(pixels, SIZE);
}

// Generate avatar
console.log('🎨 Generating default avatar...\n');

const avatarPng = drawDefaultAvatar();
fs.writeFileSync(path.join(OUTPUT_DIR, 'default-avatar.png'), avatarPng);
console.log('✅ default-avatar.png');

console.log('\n✨ Avatar generated!');
