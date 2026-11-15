function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractEnglishText(value) {
  const source = String(value || "");
  if (!/\p{Script=Latin}/u.test(source)) return "";
  const withoutCjk = source.replace(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu,
    " "
  );
  const english = withoutCjk.replace(
    /[^\p{Script=Latin}\p{Number}\s.,!?;:'"()[\]{}\-–—+/\\%&@#*=<>…]/gu,
    " "
  );
  return cleanText(english).replace(/^[\s,.;:!?–—-]+|[\s,.;:!?–—-]+$/g, "");
}

function filterEnglishSpatialRegions(regions) {
  return (Array.isArray(regions) ? regions : [])
    .map((region) => ({ ...region, text: extractEnglishText(region?.text) }))
    .filter((region) => region.text);
}

function normalizeBox(box = {}) {
  const x = Number(box.x0 ?? box.x ?? 0);
  const y = Number(box.y0 ?? box.y ?? 0);
  const width = Number(box.width ?? (Number(box.x1) - x));
  const height = Number(box.height ?? (Number(box.y1) - y));
  if (![x, y, width, height].every(Number.isFinite) || width < 2 || height < 2) return null;
  return { x, y, width, height };
}

function intersectionRatio(a, b) {
  const left = Math.max(a.x, b.x), top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  return intersection / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
}

function unionRect(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

function proseProfile(value) {
  const text = cleanText(value);
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const han = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
  const latinWords = text.match(/[A-Za-z]{2,}/g) || [];
  const languageCharacters = latin + han;
  return {
    natural: languageCharacters >= 12 && languageCharacters / Math.max(1, text.length) >= 0.45 &&
      (latinWords.length >= 4 || han >= 8),
    text
  };
}

function joinSpatialText(left, right) {
  if (/[-‐‑]\s*$/u.test(left)) return `${left.replace(/[-‐‑]\s*$/u, "")}${right}`;
  return `${left} ${right}`;
}

function splitTextAtBoundaries(value, maximumLength = 900) {
  const text = cleanText(value);
  if (!text || text.length <= maximumLength) return text ? [text] : [];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maximumLength) {
    const window = remaining.slice(0, maximumLength + 1);
    const minimumBreak = Math.floor(maximumLength * 0.55);
    let splitAt = -1;
    for (let index = window.length - 1; index >= minimumBreak; index -= 1) {
      const character = window[index];
      const previous = window[index - 1];
      if (/\s/u.test(character) || /[.!?。！？;；]/u.test(previous)) {
        splitAt = index + (/\s/u.test(character) ? 0 : 1);
        break;
      }
    }
    if (splitAt < 1) splitAt = maximumLength;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitOversizedRegion(region, maximumLength) {
  const chunks = splitTextAtBoundaries(region.text, maximumLength);
  if (chunks.length <= 1) return [{ ...region, text: chunks[0] || region.text }];
  const vertical = region.rect.height >= region.rect.width * 0.18;
  return chunks.map((text, index) => {
    const startRatio = index / chunks.length;
    const endRatio = (index + 1) / chunks.length;
    return {
      ...region,
      text,
      rect: vertical
        ? {
            x: region.rect.x,
            y: region.rect.y + region.rect.height * startRatio,
            width: region.rect.width,
            height: region.rect.height * (endRatio - startRatio)
          }
        : {
            x: region.rect.x + region.rect.width * startRatio,
            y: region.rect.y,
            width: region.rect.width * (endRatio - startRatio),
            height: region.rect.height
          },
      sourceLevel: "paragraph-segment"
    };
  });
}

function sameVisualLine(left, right) {
  const top = Math.max(left.rect.y, right.rect.y);
  const bottom = Math.min(left.rect.y + left.rect.height, right.rect.y + right.rect.height);
  const verticalOverlap = Math.max(0, bottom - top) / Math.max(1, Math.min(left.rect.height, right.rect.height));
  const horizontalGap = right.rect.x - (left.rect.x + left.rect.width);
  return verticalOverlap >= 0.65 && horizontalGap >= -4 && horizontalGap <= Math.max(28, Math.min(left.rect.width, right.rect.width) * 0.12);
}

function canContinueParagraph(group, next, maxCharacters) {
  const last = group.members.at(-1);
  if (!proseProfile(last.text).natural || !proseProfile(next.text).natural) return false;
  if (joinSpatialText(group.text, next.text).length > maxCharacters) return false;
  const verticalGap = next.rect.y - (last.rect.y + last.rect.height);
  const maximumGap = Math.max(8, Math.max(last.rect.height, next.rect.height) * 0.78);
  if (verticalGap < -3 || verticalGap > maximumGap) return false;
  const heightRatio = Math.max(last.rect.height, next.rect.height) / Math.max(1, Math.min(last.rect.height, next.rect.height));
  if (heightRatio > 1.35) return false;
  const horizontalOverlap = Math.max(0,
    Math.min(last.rect.x + last.rect.width, next.rect.x + next.rect.width) - Math.max(last.rect.x, next.rect.x));
  const overlapRatio = horizontalOverlap / Math.max(1, Math.min(last.rect.width, next.rect.width));
  const leftDifference = Math.abs(last.rect.x - next.rect.x);
  const leftTolerance = Math.max(24, Math.max(last.rect.width, next.rect.width) * 0.08);
  return overlapRatio >= 0.58 && leftDifference <= leftTolerance;
}

function groupSpatialTextRegions(regions, { maxCharacters = 900, diagnostics = null } = {}) {
  const ordered = (Array.isArray(regions) ? regions : [])
    .flatMap((region) => splitOversizedRegion({ ...region, rect: { ...region.rect } }, maxCharacters))
    .sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x));
  const visualLines = [];
  for (const region of ordered) {
    const previous = visualLines.at(-1);
    if (previous && proseProfile(previous.text).natural && proseProfile(region.text).natural && sameVisualLine(previous, region) &&
        joinSpatialText(previous.text, region.text).length <= maxCharacters) {
      previous.text = joinSpatialText(previous.text, region.text);
      previous.rect = unionRect(previous.rect, region.rect);
      previous.memberCount = (previous.memberCount || 1) + 1;
    } else {
      visualLines.push({ ...region, memberCount: region.memberCount || 1 });
    }
  }

  const groups = [];
  for (const line of visualLines) {
    let best = null;
    for (const group of groups) {
      if (!canContinueParagraph(group, line, maxCharacters)) continue;
      const last = group.members.at(-1);
      const score = Math.abs(last.rect.x - line.rect.x) + Math.max(0, line.rect.y - last.rect.y) * 0.25;
      if (!best || score < best.score) best = { group, score };
    }
    if (!best) {
      groups.push({
        text: line.text,
        rect: { ...line.rect },
        sourceLevel: line.sourceLevel,
        members: [line]
      });
      continue;
    }
    best.group.text = joinSpatialText(best.group.text, line.text);
    best.group.rect = unionRect(best.group.rect, line.rect);
    best.group.sourceLevel = "grouped-paragraph";
    best.group.members.push(line);
  }

  const result = groups
    .map((group) => ({
      text: group.text,
      rect: group.rect,
      sourceLevel: group.sourceLevel,
      memberCount: group.members.reduce((total, member) => total + (member.memberCount || 1), 0)
    }))
    .sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x));
  if (diagnostics) {
    diagnostics.groupInputRegions = ordered.length;
    diagnostics.groupOutputRegions = result.length;
    diagnostics.groupedSourceRegions = result.reduce((total, region) => total + Math.max(0, region.memberCount - 1), 0);
  }
  return result;
}

function spatialCandidate(node, sourceLevel, minimumLength) {
  const text = cleanText(node?.text);
  const rect = normalizeBox(node?.bbox);
  return text.length >= minimumLength && rect ? { text, rect, sourceLevel } : null;
}

function extractSpatialText(blocks, { maxRegions = 16, minimumLength = 1, diagnostics = null } = {}) {
  const candidates = [];
  const add = (node, sourceLevel) => {
    const text = cleanText(node?.text);
    if (text.length < minimumLength) {
      if (diagnostics) diagnostics.lengthFiltered = (diagnostics.lengthFiltered || 0) + 1;
      return false;
    }
    const rect = normalizeBox(node?.bbox);
    if (!rect) {
      if (diagnostics) diagnostics.invalidBoundsFiltered = (diagnostics.invalidBoundsFiltered || 0) + 1;
      return false;
    }
    candidates.push({ text, rect, sourceLevel });
    return true;
  };
  const visitBlock = (block) => {
    if (!block || typeof block !== "object") return;
    const paragraphs = Array.isArray(block.paragraphs) ? block.paragraphs : [];
    if (paragraphs.length) {
      for (const paragraph of paragraphs) {
        if (add(paragraph, "paragraph")) continue;
        const lines = Array.isArray(paragraph?.lines) ? paragraph.lines : [];
        for (const line of lines) add(line, "line");
      }
      return;
    }
    const lines = Array.isArray(block.lines) ? block.lines : [];
    if (lines.length) {
      let foundLine = false;
      for (const line of lines) foundLine = add(line, "line") || foundLine;
      if (foundLine) return;
    }
    const nestedBlocks = Array.isArray(block.blocks) ? block.blocks : [];
    if (nestedBlocks.length) {
      nestedBlocks.forEach(visitBlock);
      return;
    }
    add(block, "block");
  };
  (Array.isArray(blocks) ? blocks : []).forEach(visitBlock);
  candidates.sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x));
  const unique = [];
  for (const candidate of candidates) {
    const normalized = candidate.text.toLocaleLowerCase();
    const duplicate = unique.some((item) => (
      item.normalized === normalized && intersectionRatio(item.rect, candidate.rect) > 0.6
    ));
    if (!duplicate) unique.push({ ...candidate, normalized });
    else if (diagnostics) diagnostics.duplicateFiltered = (diagnostics.duplicateFiltered || 0) + 1;
    if (unique.length >= maxRegions) break;
  }
  if (diagnostics) {
    diagnostics.candidates = candidates.length;
    diagnostics.confidenceFiltered = 0;
    diagnostics.extracted = unique.length;
  }
  return unique.map(({ normalized, ...item }) => item);
}

function mapPixelRectToScreen(rect, imageSize, displayBounds) {
  const scaleX = displayBounds.width / Math.max(1, imageSize.width);
  const scaleY = displayBounds.height / Math.max(1, imageSize.height);
  return {
    x: Math.round(displayBounds.x + rect.x * scaleX),
    y: Math.round(displayBounds.y + rect.y * scaleY),
    width: Math.max(1, Math.round(rect.width * scaleX)),
    height: Math.max(1, Math.round(rect.height * scaleY))
  };
}

module.exports = {
  cleanText,
  extractEnglishText,
  extractSpatialText,
  filterEnglishSpatialRegions,
  groupSpatialTextRegions,
  mapPixelRectToScreen,
  normalizeBox,
  splitTextAtBoundaries
};
