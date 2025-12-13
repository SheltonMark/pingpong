/**
 * Generate tabBar icons for WeChat mini-program
 * Uses pureimage for pure JS canvas implementation
 */
const PImage = require('pureimage');
const fs = require('fs');
const path = require('path');

const SIZE = 81;
const STROKE_WIDTH = 3;

// Colors
const GRAY = '#9CA3AF';
const ORANGE = '#FF6B00';

// Output directory
const OUTPUT_DIR = path.join(__dirname, '../images/tabbar');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Helper to create a new canvas
function createCanvas() {
  return PImage.make(SIZE, SIZE);
}

// Helper to set stroke style
function setStroke(ctx, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

// Helper to set fill style
function setFill(ctx, color) {
  ctx.fillStyle = color;
}

// Scale factor (SVG viewBox is 24x24, we need 81x81)
const SCALE = SIZE / 24;

// Draw home icon
function drawHome(ctx, color) {
  setStroke(ctx, color);
  setFill(ctx, 'transparent');

  ctx.beginPath();
  // House roof - triangle from (12,2) to (3,9) to (21,9) back to (12,2)
  ctx.moveTo(12 * SCALE, 3 * SCALE);
  ctx.lineTo(3 * SCALE, 10 * SCALE);
  ctx.lineTo(5 * SCALE, 10 * SCALE);
  ctx.lineTo(5 * SCALE, 20 * SCALE);
  ctx.lineTo(19 * SCALE, 20 * SCALE);
  ctx.lineTo(19 * SCALE, 10 * SCALE);
  ctx.lineTo(21 * SCALE, 10 * SCALE);
  ctx.closePath();
  ctx.stroke();

  // Door
  ctx.beginPath();
  ctx.moveTo(9 * SCALE, 20 * SCALE);
  ctx.lineTo(9 * SCALE, 13 * SCALE);
  ctx.lineTo(15 * SCALE, 13 * SCALE);
  ctx.lineTo(15 * SCALE, 20 * SCALE);
  ctx.stroke();
}

// Draw square/chat icon
function drawSquare(ctx, color) {
  setStroke(ctx, color);

  ctx.beginPath();
  // Chat bubble - rounded rectangle with tail
  // Start from top left, go around
  const x = 3 * SCALE;
  const y = 3 * SCALE;
  const w = 18 * SCALE;
  const h = 14 * SCALE;
  const r = 2 * SCALE;

  // Top edge
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI/2, 0);
  // Right edge
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI/2);
  // Bottom edge to tail
  ctx.lineTo(x + 8 * SCALE, y + h);
  // Tail
  ctx.lineTo(x + 2 * SCALE, y + h + 4 * SCALE);
  ctx.lineTo(x + 5 * SCALE, y + h);
  // Continue bottom edge
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI/2, Math.PI);
  // Left edge
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, -Math.PI/2);
  ctx.stroke();
}

// Draw trophy icon
function drawTrophy(ctx, color) {
  setStroke(ctx, color);

  // Trophy cup body
  ctx.beginPath();
  ctx.moveTo(8 * SCALE, 2 * SCALE);
  ctx.lineTo(16 * SCALE, 2 * SCALE);
  ctx.lineTo(15 * SCALE, 10 * SCALE);
  ctx.arc(12 * SCALE, 10 * SCALE, 3 * SCALE, 0, Math.PI);
  ctx.lineTo(8 * SCALE, 2 * SCALE);
  ctx.stroke();

  // Left handle
  ctx.beginPath();
  ctx.arc(6 * SCALE, 6 * SCALE, 2 * SCALE, Math.PI, 0, true);
  ctx.stroke();

  // Right handle
  ctx.beginPath();
  ctx.arc(18 * SCALE, 6 * SCALE, 2 * SCALE, Math.PI, 0);
  ctx.stroke();

  // Stem
  ctx.beginPath();
  ctx.moveTo(12 * SCALE, 13 * SCALE);
  ctx.lineTo(12 * SCALE, 17 * SCALE);
  ctx.stroke();

  // Base
  ctx.beginPath();
  ctx.moveTo(8 * SCALE, 17 * SCALE);
  ctx.lineTo(16 * SCALE, 17 * SCALE);
  ctx.lineTo(17 * SCALE, 20 * SCALE);
  ctx.lineTo(7 * SCALE, 20 * SCALE);
  ctx.closePath();
  ctx.stroke();
}

// Draw profile/user icon
function drawProfile(ctx, color) {
  setStroke(ctx, color);

  // Head - circle
  ctx.beginPath();
  ctx.arc(12 * SCALE, 8 * SCALE, 4 * SCALE, 0, Math.PI * 2);
  ctx.stroke();

  // Body - arc
  ctx.beginPath();
  ctx.moveTo(4 * SCALE, 21 * SCALE);
  ctx.lineTo(4 * SCALE, 19 * SCALE);
  ctx.arc(12 * SCALE, 19 * SCALE, 8 * SCALE, Math.PI, 0, true);
  ctx.lineTo(20 * SCALE, 21 * SCALE);
  ctx.stroke();
}

// Save canvas to PNG
async function saveIcon(canvas, filename) {
  const filepath = path.join(OUTPUT_DIR, filename);
  await PImage.encodePNGToStream(canvas, fs.createWriteStream(filepath));
  console.log(`✅ Created: ${filename}`);
}

// Generate all icons
async function generateIcons() {
  console.log('🎨 Generating tabBar icons...\n');

  const icons = [
    { name: 'home', draw: drawHome },
    { name: 'square', draw: drawSquare },
    { name: 'trophy', draw: drawTrophy },
    { name: 'profile', draw: drawProfile }
  ];

  for (const icon of icons) {
    // Inactive (gray)
    const inactiveCanvas = createCanvas();
    const inactiveCtx = inactiveCanvas.getContext('2d');
    icon.draw(inactiveCtx, GRAY);
    await saveIcon(inactiveCanvas, `${icon.name}.png`);

    // Active (orange)
    const activeCanvas = createCanvas();
    const activeCtx = activeCanvas.getContext('2d');
    icon.draw(activeCtx, ORANGE);
    await saveIcon(activeCanvas, `${icon.name}-active.png`);
  }

  console.log('\n✨ All icons generated successfully!');
}

generateIcons().catch(console.error);
