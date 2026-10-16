// Share card for the pay calculator, drawn locally on a canvas. Two layouts: Chinese and English.
const WIDTH = 1080;
const HEIGHT = 1350;
const COLORS = {
  paper: "#f4eee2", paperWhite: "#fbf8f1", ink: "#27342f", muted: "#68695f",
  rule: "#c9bda9", cpi: "#b85b43", wpi: "#4f7770", brass: "#92774b",
};
const UI = '"Plus Jakarta Sans", "Source Han Sans CN", sans-serif';
const SERIF = { zh: '"Source Han Serif CN", "Noto Serif SC", serif', en: '"Newsreader", Georgia, serif' };

function wrap(context, text, maxWidth) {
  // Chinese wraps between characters; English between words.
  const units = /[㐀-鿿]/.test(text) ? [...text] : text.split(/(\s+)/);
  const lines = [];
  let line = "";
  for (const unit of units) {
    const candidate = line + unit;
    if (line && context.measureText(candidate.trimEnd()).width > maxWidth) {
      lines.push(line.trim());
      line = unit.trimStart();
    } else line = candidate;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function drawLines(context, lines, x, y, lineHeight) {
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

export async function loadCardFonts(lang) {
  if (!document.fonts?.load) return;
  const sample = lang === "zh" ? "工资跑赢通胀 0123456789%" : "Your pay beat inflation 0123456789%";
  await Promise.allSettled([
    `600 40px ${UI}`, `500 40px ${UI}`, `600 40px ${SERIF[lang]}`,
  ].map(font => document.fonts.load(font, sample)));
}

// card: { lang, kicker, region, period, verdict, verdictKind, real, realLabel,
//         rows: [{ label, value, pct, tone }], bars?, amounts?, source, note, url }
export function drawWageCard(canvas, card) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  const left = 96;
  const right = WIDTH - 96;
  const width = right - left;
  const tone = { ahead: COLORS.wpi, behind: COLORS.cpi, flat: COLORS.ink }[card.verdictKind] ?? COLORS.ink;

  context.fillStyle = COLORS.paper;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.strokeStyle = "rgba(146, 119, 75, .07)";
  context.lineWidth = 1;
  for (let y = 0; y < HEIGHT; y += 36) {
    context.beginPath();
    context.moveTo(0, y + .5);
    context.lineTo(WIDTH, y + .5);
    context.stroke();
  }
  context.fillStyle = COLORS.paperWhite;
  context.fillRect(48, 48, WIDTH - 96, HEIGHT - 96);
  context.strokeStyle = COLORS.rule;
  context.lineWidth = 2;
  context.strokeRect(48, 48, WIDTH - 96, HEIGHT - 96);

  // Brand mark: four tilted squares, as in the masthead.
  context.save();
  context.translate(left + 22, 132);
  context.rotate(-8 * Math.PI / 180);
  context.strokeStyle = COLORS.ink;
  context.lineWidth = 2;
  for (const [dx, dy, fill] of [[-21, -21, null], [2, -21, COLORS.wpi], [-21, 2, COLORS.wpi], [2, 2, COLORS.cpi]]) {
    if (fill) {
      context.fillStyle = fill;
      context.globalAlpha = .75;
      context.fillRect(dx, dy, 19, 19);
      context.globalAlpha = 1;
    }
    context.strokeRect(dx, dy, 19, 19);
  }
  context.restore();

  context.textBaseline = "alphabetic";
  context.fillStyle = COLORS.muted;
  context.font = `600 ${card.lang === "zh" ? 26 : 22}px ${UI}`;
  const kickerLines = wrap(context, card.kicker, width - 80);
  drawLines(context, kickerLines, left + 72, 142, 34);

  // Footer is laid out from the bottom so long sources never collide with the body.
  context.font = `500 24px ${UI}`;
  const sourceLines = wrap(context, card.source, width);
  const noteLines = wrap(context, card.note, width);
  const urlY = HEIGHT - 100;
  const footerTextTop = urlY - 44 - (sourceLines.length + noteLines.length - 1) * 34;
  const footer = footerTextTop - 48;

  let y = 250;
  context.fillStyle = COLORS.ink;
  context.font = `500 ${card.lang === "zh" ? 34 : 32}px ${UI}`;
  y = drawLines(context, wrap(context, `${card.region} · ${card.period}`, width), left, y, 48);

  // Prefer a slightly smaller verdict on one line over a two-line headline.
  const baseVerdict = card.lang === "zh" ? 92 : 80;
  let verdictSize = baseVerdict;
  for (const size of [baseVerdict, 72, 64]) {
    context.font = `600 ${size}px ${SERIF[card.lang]}`;
    if (wrap(context, card.verdict, width).length === 1) {
      verdictSize = size;
      break;
    }
  }
  context.font = `600 ${verdictSize}px ${SERIF[card.lang]}`;
  const verdictLines = wrap(context, card.verdict, width);
  const verdictStep = Math.round(verdictSize * 1.2);
  const verdictTop = y + 96;
  y = verdictTop + (verdictLines.length - 1) * verdictStep + 56;

  context.font = `500 28px ${UI}`;
  const amountLines = card.amounts ? wrap(context, card.amounts, width) : [];
  const rest = 56 + 70 + card.rows.length * 108 + (amountLines.length ? 78 + (amountLines.length - 1) * 40 : 0);
  // The big figure must fit both the remaining height and the card width (long amounts, e.g. ₽528,000).
  const fits = size => {
    context.font = `600 ${size}px ${UI}`;
    return y + size * .81 + rest <= footer - 36 && context.measureText(card.real).width <= width + size * .04;
  };
  const numeral = [210, 184, 160, 136, 112, 96, 84, 72].find(fits) ?? 64;

  context.fillStyle = tone;
  context.font = `600 ${verdictSize}px ${SERIF[card.lang]}`;
  drawLines(context, verdictLines, left, verdictTop, verdictStep);
  context.font = `600 ${numeral}px ${UI}`;
  context.fillText(card.real, left - numeral * .04, y + numeral * .81);
  y += numeral * .81 + 56;
  context.fillStyle = COLORS.muted;
  context.font = `600 28px ${UI}`;
  context.fillText(card.realLabel, left, y);

  y += 70;
  context.strokeStyle = COLORS.rule;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(left, y);
  context.lineTo(right, y);
  context.stroke();

  const largest = Math.max(1, ...card.rows.map(row => Math.abs(row.pct)));
  for (const row of card.rows) {
    y += 64;
    context.fillStyle = COLORS.ink;
    context.font = `500 30px ${UI}`;
    context.fillText(row.label, left, y);
    context.textAlign = "right";
    context.fillStyle = row.tone === "cpi" ? COLORS.cpi : COLORS.wpi;
    context.font = `600 40px ${UI}`;
    context.fillText(row.value, right, y);
    context.textAlign = "left";
    y += 26;
    // Bars compare like with like; cards mixing cumulative and annual rates draw a plain rule.
    context.fillStyle = "rgba(201, 189, 169, .45)";
    context.fillRect(left, y, width, card.bars === false ? 2 : 18);
    if (card.bars !== false) {
      context.fillStyle = row.tone === "cpi" ? COLORS.cpi : COLORS.wpi;
      context.fillRect(left, y, Math.max(4, width * Math.abs(row.pct) / largest), 18);
    }
    y += 18;
  }

  if (amountLines.length) {
    context.fillStyle = COLORS.ink;
    context.font = `500 28px ${UI}`;
    drawLines(context, amountLines, left, y + 78, 40);
  }

  context.strokeStyle = COLORS.rule;
  context.beginPath();
  context.moveTo(left, footer);
  context.lineTo(right, footer);
  context.stroke();
  context.fillStyle = COLORS.muted;
  context.font = `500 24px ${UI}`;
  const noteTop = drawLines(context, sourceLines, left, footerTextTop, 34);
  drawLines(context, noteLines, left, noteTop, 34);
  context.fillStyle = COLORS.brass;
  context.font = `600 26px ${UI}`;
  context.fillText(card.url, left, urlY);
  return canvas;
}
