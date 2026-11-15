const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractEnglishText,
  extractSpatialText,
  filterEnglishSpatialRegions,
  groupSpatialTextRegions,
  mapPixelRectToScreen
} = require("../src/services/region-capture/spatial-text");
const { ContinuousRegionManager } = require("../src/services/region-capture/continuous-region-manager");
const {
  decideGameTranslation,
  filterSpatialRegionsForTarget,
  resolveGameText
} = require("../src/services/region-capture/game-language-policy");
const fs = require("node:fs");
const path = require("node:path");
const { calculateOverlayBounds } = require("../src/services/region-capture/translation-overlay-position");
const { estimateOverlaySize, findAvailableOverlayBounds } = require("../src/services/region-capture/translation-overlay-manager");
const {
  FULLSCREEN_MAX_REGIONS,
  selectTranslatableFullscreenRegions,
  splitFullscreenTranslationText,
  translateFullscreenRegions
} = require("../src/services/region-capture/region-capture-controller");

test("fullscreen translations are published together after every region finishes", async () => {
  const resolvers = [];
  const published = [];
  const work = translateFullscreenRegions([
    { text: "First", rect: { x: 1 } },
    { text: "Second", rect: { x: 2 } }
  ], {
    translateRegion: (region) => new Promise((resolve) => resolvers.push(() => resolve({ text: `T:${region.text}` }))),
    mapRegion: (region) => region.rect,
    publish: (id, payload) => published.push([id, payload.text, payload.rect.x])
  });

  await new Promise(setImmediate);
  assert.equal(resolvers.length, 2);
  resolvers.shift()();
  await new Promise(setImmediate);
  assert.equal(resolvers.length, 1);
  assert.deepEqual(published, []);
  resolvers.shift()();

  assert.deepEqual(await work, {
    submitted: 2,
    completed: 2,
    failed: 0,
    longSubmitted: 0,
    longCompleted: 0,
    prepared: 2,
    published: 2,
    failureCodes: {},
    cancelled: false,
    concurrencyLimit: 2,
    peakConcurrency: 2,
    rateLimitObserved: false
  });
  assert.deepEqual(published, [
    ["fullscreen:0", "T:First", 1],
    ["fullscreen:1", "T:Second", 2]
  ]);
});

test("cancelled fullscreen batches never publish partial overlays", async () => {
  let active = true;
  const published = [];
  const result = await translateFullscreenRegions([{ text: "First", rect: {} }], {
    translateRegion: async () => {
      active = false;
      return { text: "translated" };
    },
    mapRegion: (region) => region.rect,
    publish: (...args) => published.push(args),
    isActive: () => active
  });
  assert.deepEqual(result, {
    submitted: 1,
    completed: 0,
    failed: 0,
    longSubmitted: 0,
    longCompleted: 0,
    prepared: 0,
    published: 0,
    failureCodes: {},
    cancelled: true,
    concurrencyLimit: 1,
    peakConcurrency: 1,
    rateLimitObserved: false
  });
  assert.deepEqual(published, []);
});

test("one failed fullscreen translation keeps other successful overlays in the same batch", async () => {
  const published = [];
  const result = await translateFullscreenRegions([
    { text: "First", rect: { x: 1 } },
    { text: "Second", rect: { x: 2 } },
    { text: "Third", rect: { x: 3 } }
  ], {
    translateRegion: async (region) => {
      if (region.text === "Second") throw Object.assign(new Error("rate limited"), { code: "rate-limited" });
      return { text: `T:${region.text}` };
    },
    mapRegion: (region) => region.rect,
    publish: async (id, payload) => { published.push([id, payload.text]); return true; }
  });
  assert.deepEqual(result, {
    submitted: 3,
    completed: 2,
    failed: 1,
    longSubmitted: 0,
    longCompleted: 0,
    prepared: 3,
    published: 3,
    failureCodes: { "rate-limited": 1 },
    cancelled: false,
    concurrencyLimit: 3,
    peakConcurrency: 3,
    rateLimitObserved: true
  });
  assert.deepEqual(published, [
    ["fullscreen:0", "T:First"],
    ["fullscreen:1", "翻译失败"],
    ["fullscreen:2", "T:Third"]
  ]);
});

test("fullscreen diagnostics distinguish cancellation from API and overlay failures", async () => {
  let active = true;
  const states = [];
  const result = await translateFullscreenRegions([
    { diagnosticId: 4, text: "First paragraph", rect: { x: 1 } },
    { diagnosticId: 8, text: "Second paragraph", rect: { x: 2 } }
  ], {
    translateRegion: async (region) => {
      if (region.diagnosticId === 8) active = false;
      return { text: `T:${region.text}` };
    },
    mapRegion: (region) => region.rect,
    publish: () => true,
    onRegionState: (region, state) => states.push({ id: region.diagnosticId, ...state }),
    isActive: () => active,
    concurrency: 1
  });

  assert.equal(result.cancelled, true);
  assert.equal(result.submitted, 2);
  assert.equal(result.completed, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.published, 0);
  assert.deepEqual(states.map(({ id, stage }) => [id, stage]), [
    [4, "submitted"],
    [4, "translated"],
    [8, "submitted"]
  ]);
});

test("fullscreen translation uses bounded concurrency while preserving publish order", async () => {
  const pending = [];
  const published = [];
  const regions = Array.from({ length: 7 }, (_, index) => ({ text: `Region ${index}`, rect: { x: index } }));
  const work = translateFullscreenRegions(regions, {
    concurrency: 3,
    translateRegion: (region) => new Promise((resolve) => pending.push({ region, resolve })),
    mapRegion: (region) => region.rect,
    publish: (id, payload) => published.push([id, payload.text])
  });

  await new Promise(setImmediate);
  assert.equal(pending.length, 3);
  pending.splice(1, 1)[0].resolve({ text: "T:Region 1" });
  await new Promise(setImmediate);
  assert.equal(pending.length, 3);
  while (pending.length) {
    const item = pending.shift();
    item.resolve({ text: `T:${item.region.text}` });
    await new Promise(setImmediate);
  }
  const result = await work;
  assert.equal(result.peakConcurrency, 3);
  assert.equal(result.completed, 7);
  assert.deepEqual(published.map(([id]) => id), regions.map((_, index) => `fullscreen:${index}`));
});

test("bounded concurrency reduces mocked multi-region translation wall time", async () => {
  const regions = Array.from({ length: 9 }, (_, index) => ({ text: `Timed region ${index}`, rect: { x: index } }));
  const run = async (concurrency) => {
    const startedAt = performance.now();
    const result = await translateFullscreenRegions(regions, {
      concurrency,
      translateRegion: async (region) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { text: `T:${region.text}` };
      },
      mapRegion: (region) => region.rect,
      publish: () => true
    });
    return { elapsed: performance.now() - startedAt, result };
  };
  const serial = await run(1);
  const bounded = await run(3);
  assert.equal(serial.result.completed, 9);
  assert.equal(bounded.result.completed, 9);
  assert.equal(bounded.result.peakConcurrency, 3);
  assert.ok(bounded.elapsed < serial.elapsed * 0.6, `serial=${serial.elapsed} bounded=${bounded.elapsed}`);
});

test("a confirmed rate limit makes extra workers stop taking new fullscreen requests", async () => {
  const regions = Array.from({ length: 8 }, (_, index) => ({ text: `Rate region ${index}`, rect: { x: index } }));
  const starts = [];
  const result = await translateFullscreenRegions(regions, {
    concurrency: 3,
    translateRegion: async (region) => {
      const index = Number(region.text.split(" ").at(-1));
      starts.push(index);
      if (index === 1) throw Object.assign(new Error("limited"), { code: "rate-limited" });
      await new Promise((resolve) => setImmediate(resolve));
      return { text: `T:${region.text}` };
    },
    mapRegion: (region) => region.rect,
    publish: () => true
  });
  assert.equal(result.rateLimitObserved, true);
  assert.equal(result.failureCodes["rate-limited"], 1);
  assert.equal(result.peakConcurrency, 3);
  assert.equal(result.submitted, 8);
  assert.equal(new Set(starts).size, 8);
});

test("fullscreen extraction uses a finite larger cap without dropping the lower half at sixteen", () => {
  const blocks = Array.from({ length: 40 }, (_, index) => ({
    text: `Game instruction ${index}`,
    bbox: { x0: 10, y0: index * 20, x1: 240, y1: index * 20 + 18 }
  }));
  const regions = extractSpatialText(blocks, { maxRegions: FULLSCREEN_MAX_REGIONS });
  assert.equal(FULLSCREEN_MAX_REGIONS, 32);
  assert.equal(regions.length, 32);
  assert.equal(regions.at(-1).text, "Game instruction 31");
});

test("target-language OCR regions no longer consume the fullscreen translation cap", () => {
  const alreadyChinese = Array.from({ length: FULLSCREEN_MAX_REGIONS }, (_, index) => ({
    text: `已经是中文的界面文字${index}`,
    rect: { x: 0, y: index * 10, width: 100, height: 9 }
  }));
  const englishToTranslate = Array.from({ length: 8 }, (_, index) => ({
    text: `English instruction number ${index}`,
    rect: { x: 0, y: 400 + index * 10, width: 180, height: 9 }
  }));
  const selection = selectTranslatableFullscreenRegions(
    [...alreadyChinese, ...englishToTranslate],
    "zh-CN"
  );
  assert.equal(selection.eligibleCount, 8);
  assert.equal(selection.droppedByLimit, 0);
  assert.deepEqual(selection.regions.map((region) => region.text), englishToTranslate.map((region) => region.text));
});

test("fullscreen translation keeps its finite cap after language filtering", () => {
  const english = Array.from({ length: FULLSCREEN_MAX_REGIONS + 5 }, (_, index) => ({
    text: `Translate this game instruction ${index}`,
    rect: { x: 0, y: index * 10, width: 180, height: 9 }
  }));
  const selection = selectTranslatableFullscreenRegions(english, "zh-CN");
  assert.equal(selection.eligibleCount, FULLSCREEN_MAX_REGIONS + 5);
  assert.equal(selection.regions.length, FULLSCREEN_MAX_REGIONS);
  assert.equal(selection.droppedByLimit, 5);
});

test("fullscreen selection keeps a central long paragraph when short menus exceed the cap", () => {
  const upperMenus = Array.from({ length: 36 }, (_, index) => ({
    text: `Navigation item ${index}`,
    rect: { x: index * 20, y: 20 + index, width: 100, height: 18 }
  }));
  const abstract = {
    text: "This long scientific abstract explains the study background, methods, results, and conclusions in enough detail to represent the principal page content.",
    rect: { x: 320, y: 280, width: 800, height: 260 }
  };
  const lowerMenus = Array.from({ length: 12 }, (_, index) => ({
    text: `Footer option ${index}`,
    rect: { x: index * 30, y: 700 + index, width: 110, height: 18 }
  }));

  const selection = selectTranslatableFullscreenRegions(
    [...upperMenus, abstract, ...lowerMenus],
    "zh-CN"
  );

  assert.equal(selection.regions.length, FULLSCREEN_MAX_REGIONS);
  assert.equal(selection.droppedByLimit, 17);
  assert.ok(selection.regions.some((region) => region.text === abstract.text));
  assert.ok(selection.regions.some((region) => region.rect.y < 100));
  assert.ok(selection.regions.some((region) => region.rect.y > 700));
  assert.equal(selection.longEligibleCount, 1);
  assert.equal(selection.longSelectedCount, 1);
});

test("fullscreen selection retains multiple OCR paragraph regions without exceeding the cap", () => {
  const paragraphLines = Array.from({ length: 10 }, (_, index) => ({
    text: `The paragraph line ${index} contains enough English words to preserve the meaning of a multi-line abstract section.`,
    rect: { x: 280, y: 180 + index * 34, width: 900, height: 30 }
  }));
  const menus = Array.from({ length: 40 }, (_, index) => ({
    text: `Menu ${index}`,
    rect: { x: 10, y: index * 20, width: 90, height: 18 }
  }));
  const selection = selectTranslatableFullscreenRegions([...menus, ...paragraphLines], "zh-CN");
  assert.equal(selection.regions.length, FULLSCREEN_MAX_REGIONS);
  assert.ok(selection.longSelectedCount >= 8);
  assert.ok(paragraphLines.some((paragraph) => selection.regions.some((region) => region.text === paragraph.text)));
});

test("a multi-line English abstract is grouped into ordered paragraph segments before the cap", () => {
  const lines = Array.from({ length: 15 }, (_, index) => ({
    text: `Sentence line ${index} describes the scientific background methods results and conclusion for this study.`,
    rect: { x: index === 0 || index === 10 ? 730 : 688, y: 260 + index * 25, width: index % 4 === 3 ? 650 : 785, height: 20 },
    sourceLevel: "paragraph"
  }));
  const diagnostics = {};
  const grouped = groupSpatialTextRegions(lines, { diagnostics });
  assert.equal(grouped.length, 2);
  assert.equal(grouped.reduce((total, region) => total + region.memberCount, 0), 15);
  assert.ok(grouped.every((region) => region.sourceLevel === "grouped-paragraph"));
  assert.match(grouped[0].text, /^Sentence line 0 /);
  assert.match(grouped.at(-1).text, /Sentence line 14 /);
  assert.equal(diagnostics.groupInputRegions, 15);
  assert.equal(diagnostics.groupOutputRegions, 2);
});

test("an exceptionally long paragraph is split at readable boundaries without losing content", () => {
  const source = Array.from({ length: 80 }, (_, index) => `Sentence ${index} preserves every important detail.`).join(" ");
  const chunks = splitFullscreenTranslationText(source, 300);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 301));
  assert.equal(chunks.join(" ").replace(/\s+/g, " "), source);
  const grouped = groupSpatialTextRegions([{
    text: source,
    rect: { x: 200, y: 100, width: 700, height: 360 },
    sourceLevel: "paragraph"
  }], { maxCharacters: 300 });
  assert.equal(grouped.length, chunks.length);
  assert.ok(grouped.every((region) => region.text.length <= 301));
  assert.ok(grouped.every((region) => region.sourceLevel === "paragraph-segment"));
  assert.ok(grouped.every((region, index) => index === 0 || region.rect.y > grouped[index - 1].rect.y));
});

test("paragraph grouping preserves surrounding menu buttons and reduces cap pressure", () => {
  const menus = Array.from({ length: 31 }, (_, index) => ({
    text: `Menu ${index}`,
    rect: { x: 10, y: index * 24, width: 90, height: 18 },
    sourceLevel: "paragraph"
  }));
  const abstractLines = Array.from({ length: 12 }, (_, index) => ({
    text: `This abstract line ${index} contains several natural English words for paragraph grouping.`,
    rect: { x: 500, y: 180 + index * 25, width: 720, height: 20 },
    sourceLevel: "paragraph"
  }));
  const grouped = groupSpatialTextRegions([...menus, ...abstractLines]);
  const selection = selectTranslatableFullscreenRegions(grouped, "zh-CN");
  assert.equal(grouped.filter((region) => region.memberCount > 1).length, 2);
  assert.ok(selection.regions.some((region) => region.memberCount > 1));
  assert.ok(selection.regions.length <= FULLSCREEN_MAX_REGIONS);
});

test("two-column prose is grouped within each column and never across columns", () => {
  const regions = [];
  for (let row = 0; row < 5; row += 1) {
    regions.push(
      { text: `Left column sentence ${row} contains enough words to form one paragraph.`, rect: { x: 80, y: 100 + row * 28, width: 420, height: 22 }, sourceLevel: "paragraph" },
      { text: `Right column sentence ${row} contains enough words to form another paragraph.`, rect: { x: 620, y: 100 + row * 28, width: 420, height: 22 }, sourceLevel: "paragraph" }
    );
  }
  const grouped = groupSpatialTextRegions(regions);
  assert.equal(grouped.length, 2);
  assert.ok(grouped[0].text.includes("Left column sentence 4"));
  assert.ok(!grouped[0].text.includes("Right column"));
  assert.ok(grouped[1].text.includes("Right column sentence 4"));
});

test("titles formulas and short game UI remain separate from body prose", () => {
  const grouped = groupSpatialTextRegions([
    { text: "RESULTS", rect: { x: 100, y: 50, width: 180, height: 34 }, sourceLevel: "paragraph" },
    { text: "The first body line contains enough natural English words for grouping.", rect: { x: 100, y: 92, width: 560, height: 20 }, sourceLevel: "paragraph" },
    { text: "The second body line continues the same natural paragraph without a break.", rect: { x: 100, y: 117, width: 570, height: 20 }, sourceLevel: "paragraph" },
    { text: "E = mc^2 + 4x", rect: { x: 100, y: 145, width: 180, height: 20 }, sourceLevel: "paragraph" },
    { text: "Inventory", rect: { x: 900, y: 92, width: 100, height: 20 }, sourceLevel: "paragraph" },
    { text: "Settings", rect: { x: 900, y: 117, width: 100, height: 20 }, sourceLevel: "paragraph" }
  ]);
  assert.equal(grouped.length, 5);
  const body = grouped.find((region) => region.memberCount === 2);
  assert.ok(body.text.startsWith("The first body line"));
  assert.ok(!body.text.includes("RESULTS"));
  assert.ok(!body.text.includes("mc^2"));
});

test("mixed Chinese and English prose can group while short game subtitles remain independent", () => {
  const grouped = groupSpatialTextRegions([
    { text: "任务提示 Press the button to open the secured door.", rect: { x: 200, y: 200, width: 500, height: 24 }, sourceLevel: "paragraph" },
    { text: "Then return to the village and speak with the guard.", rect: { x: 200, y: 229, width: 510, height: 24 }, sourceLevel: "paragraph" },
    { text: "Attack", rect: { x: 50, y: 600, width: 90, height: 20 }, sourceLevel: "paragraph" },
    { text: "Defend", rect: { x: 50, y: 625, width: 90, height: 20 }, sourceLevel: "paragraph" }
  ]);
  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].memberCount, 2);
  assert.match(grouped[0].text, /任务提示 Press/);
});

test("long translated text receives enough overlay height instead of using the source line height", () => {
  const short = estimateOverlaySize("短译文", { width: 120, height: 20 }, { fontSize: 17 });
  const long = estimateOverlaySize("这是一段需要完整显示的较长游戏译文。".repeat(40), { width: 120, height: 20 }, { fontSize: 17 });
  assert.ok(long.height > short.height);
  assert.ok(long.width >= short.width);
  assert.ok(long.height > 300);
  assert.ok(long.height <= 720);
});

test("overlay placement selects a non-overlapping nearby position when space exists", () => {
  const area = { x: 0, y: 0, width: 1200, height: 800 };
  const initial = { x: 300, y: 300, width: 420, height: 120 };
  const occupied = [
    { x: 300, y: 300, width: 420, height: 120 },
    { x: 300, y: 426, width: 420, height: 120 }
  ];
  const placed = findAvailableOverlayBounds(initial, occupied, area);
  const overlaps = (left, right) => left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
  assert.ok(occupied.every((other) => !overlaps(placed, other)));
  assert.ok(placed.x >= area.x && placed.x + placed.width <= area.width);
  assert.ok(placed.y >= area.y && placed.y + placed.height <= area.height);
});

test("fullscreen extraction reports filters without recording OCR text", () => {
  const diagnostics = {};
  const regions = extractSpatialText([
    { text: "", bbox: { x0: 0, y0: 0, x1: 100, y1: 20 } },
    { text: "Valid English paragraph", bbox: { x0: 10, y0: 30, x1: 300, y1: 80 } },
    { text: "Invalid bounds", bbox: { x0: 0, y0: 90, x1: 1, y1: 91 } },
    { text: "Valid English paragraph", bbox: { x0: 10, y0: 30, x1: 300, y1: 80 } }
  ], { maxRegions: Number.POSITIVE_INFINITY, diagnostics });
  assert.equal(regions.length, 1);
  assert.equal(diagnostics.lengthFiltered, 1);
  assert.equal(diagnostics.invalidBoundsFiltered, 1);
  assert.equal(diagnostics.duplicateFiltered, 1);
  assert.equal(diagnostics.confidenceFiltered, 0);
  assert.equal(Object.values(diagnostics).some((value) => typeof value === "string"), false);
});

test("all seven overlay positions use source bounds, offsets, and screen clamping", () => {
  const area = { x: 0, y: 0, width: 800, height: 600 };
  const source = { x: 300, y: 250, width: 120, height: 40 };
  const size = { width: 180, height: 60 };
  const above = calculateOverlayBounds(source, area, size, { position: "above-source" });
  const below = calculateOverlayBounds(source, area, size, { position: "below-source" });
  const left = calculateOverlayBounds(source, area, size, { position: "left-source" });
  const right = calculateOverlayBounds(source, area, size, { position: "right-source" });
  const near = calculateOverlayBounds(source, area, size, { position: "near-source", offsetX: 10, offsetY: -5 });
  const top = calculateOverlayBounds(source, area, size, { position: "top-center" });
  const custom = calculateOverlayBounds(source, area, size, { position: "custom", offsetX: 22, offsetY: -12 });
  assert.ok(above.y < source.y);
  assert.ok(below.y > source.y);
  assert.ok(left.x < source.x);
  assert.ok(right.x > source.x);
  assert.equal(near.x, source.x + 10);
  assert.equal(top.x, 310);
  assert.equal(custom.x, 22);
  assert.equal(custom.y, 0);
  const edge = calculateOverlayBounds({ x: 790, y: 590, width: 20, height: 20 }, area, size, { position: "right-source" });
  assert.ok(edge.x >= 0 && edge.x + edge.width <= 800);
  assert.ok(edge.y >= 0 && edge.y + edge.height <= 600);
});

test("fullscreen OCR blocks retain positions and discard nested duplicates", () => {
  const blocks = [{
    text: "Hello world", bbox: { x0: 10, y0: 20, x1: 210, y1: 60 },
    lines: [{ text: "Hello world", bbox: { x0: 10, y0: 20, x1: 210, y1: 60 } }]
  }, { text: "第二处", bbox: { x0: 400, y0: 300, x1: 500, y1: 340 } }];
  const regions = extractSpatialText(blocks);
  assert.equal(regions.length, 2);
  assert.deepEqual(regions.map((item) => item.text), ["Hello world", "第二处"]);
  assert.deepEqual(
    mapPixelRectToScreen(regions[1].rect, { width: 1000, height: 500 }, { x: 100, y: 50, width: 500, height: 250 }),
    { x: 300, y: 200, width: 50, height: 20 }
  );
});

test("fullscreen extraction keeps OCR paragraphs intact instead of creating one overlay per line", () => {
  const blocks = [{
    text: "Block text",
    bbox: { x0: 10, y0: 20, x1: 410, y1: 140 },
    paragraphs: [{
      text: "Hold the button to charge the attack. Release it when the enemy approaches.",
      bbox: { x0: 20, y0: 30, x1: 400, y1: 120 },
      lines: [
        { text: "Hold the button to charge the attack.", bbox: { x0: 20, y0: 30, x1: 390, y1: 65 } },
        { text: "Release it when the enemy approaches.", bbox: { x0: 20, y0: 75, x1: 400, y1: 110 } }
      ]
    }]
  }];
  const regions = extractSpatialText(blocks);
  assert.deepEqual(regions, [{
    text: "Hold the button to charge the attack. Release it when the enemy approaches.",
    rect: { x: 20, y: 30, width: 380, height: 90 },
    sourceLevel: "paragraph"
  }]);
});

test("fullscreen extraction preserves short independent UI lines when OCR has no paragraph", () => {
  const regions = extractSpatialText([{
    text: "Menu block",
    bbox: { x0: 0, y0: 0, x1: 200, y1: 90 },
    lines: [
      { text: "Skills", bbox: { x0: 10, y0: 10, x1: 90, y1: 35 } },
      { text: "Items", bbox: { x0: 10, y0: 50, x1: 80, y1: 75 } }
    ]
  }]);
  assert.deepEqual(regions.map(({ text, sourceLevel }) => [text, sourceLevel]), [
    ["Skills", "line"],
    ["Items", "line"]
  ]);
});

test("fullscreen English filtering preserves English and removes Chinese text", () => {
  assert.equal(extractEnglishText("Attack Power increases by 20%."), "Attack Power increases by 20%");
  assert.equal(extractEnglishText("技能说明 Attack Power 提升 20% 持续 30 seconds。"), "Attack Power 20% 30 seconds");
  assert.equal(extractEnglishText("技能说明：攻击力提升。"), "");
});

test("Alt+1 sends only English spatial regions to translation", () => {
  const rect = { x: 10, y: 20, width: 100, height: 30 };
  const filtered = filterEnglishSpatialRegions([
    { text: "Deflect incoming attacks.", rect },
    { text: "技能说明 Attack Power 提升 20%", rect: { ...rect, y: 60 } },
    { text: "攻击力与架势恢复速度提升", rect: { ...rect, y: 100 } }
  ]);

  assert.deepEqual(filtered.map((region) => region.text), [
    "Deflect incoming attacks",
    "Attack Power 20%"
  ]);
  assert.deepEqual(filtered.map((region) => region.rect.y), [20, 60]);
});

test("game language policy translates only content needed by the Chinese target", () => {
  assert.equal(decideGameTranslation("Attack power increased.", "zh-CN").action, "translate");
  assert.equal(decideGameTranslation("攻击力提升。", "zh-CN").action, "skip");
  const mixed = decideGameTranslation("按 E to interact with the door", "zh-CN");
  assert.equal(mixed.action, "translate");
  assert.equal(mixed.text, "按 E to interact with the door");
  for (const text of ["12345", "ESC", "L1", "---"]) {
    assert.equal(decideGameTranslation(text, "zh-CN").action, "skip");
  }
});

test("game language policy translates only content needed by the English target", () => {
  assert.equal(decideGameTranslation("打开技能菜单。", "en").action, "translate");
  assert.equal(decideGameTranslation("Open the skill menu.", "en").action, "skip");
  const mixed = decideGameTranslation("按 E to interact with the door", "en");
  assert.equal(mixed.action, "translate");
  assert.equal(mixed.text, "按 E to interact with the door");
  assert.equal(decideGameTranslation("123 / ESC", "en").action, "skip");
});

test("spatial regions are judged independently and mixed sentences retain context", () => {
  const regions = filterSpatialRegionsForTarget([
    { text: "Open inventory", rect: { x: 1 } },
    { text: "物品栏", rect: { x: 2 } },
    { text: "按 E to open", rect: { x: 3 } },
    { text: "123", rect: { x: 4 } }
  ], "zh-CN");
  assert.deepEqual(regions.map((item) => [item.text, item.rect.x]), [
    ["Open inventory", 1],
    ["按 E to open", 3]
  ]);
});

test("uncertain Japanese or Korean text is handled conservatively", () => {
  assert.equal(decideGameTranslation("設定を開く", "zh-CN").reason, "uncertain-language");
  assert.equal(decideGameTranslation("설정을 엽니다", "en").reason, "uncertain-language");
});

test("continuous game text skips duplicate translation and clears obsolete overlays", async () => {
  let calls = 0;
  const translate = async (text) => { calls += 1; return `译:${text}`; };
  const first = await resolveGameText({ sourceText: "Open inventory", targetLanguage: "zh-CN", translate });
  assert.equal(first.translatedText, "译:Open inventory");
  const duplicate = await resolveGameText({
    sourceText: "Open inventory",
    targetLanguage: "zh-CN",
    lastKey: first.contentKey,
    lastResult: first,
    translate
  });
  assert.equal(duplicate.cached, true);
  assert.equal(calls, 1);
  const targetText = await resolveGameText({ sourceText: "打开物品栏", targetLanguage: "zh-CN", translate });
  assert.equal(targetText.clearOverlay, true);
  assert.equal(targetText.translatedText, "");
  assert.equal(calls, 1);

  const englishTarget = await resolveGameText({ sourceText: "打开物品栏", targetLanguage: "en", translate });
  assert.equal(englishTarget.translatedText, "译:打开物品栏");
  const englishAlready = await resolveGameText({ sourceText: "Open inventory", targetLanguage: "en", translate });
  assert.equal(englishAlready.clearOverlay, true);
});

test("continuous manager honors a target-aware content key supplied before translation", async () => {
  const updates = [];
  let revision = "target:zh:first";
  const manager = new ContinuousRegionManager({
    intervalMs: 100000,
    inspectRegion: async () => ({ sourceText: "same OCR", translatedText: revision, contentKey: revision }),
    onUpdate: (_region, result) => updates.push(result.translatedText)
  });
  manager.add({ id: "target-aware" });
  await manager.tick();
  revision = "target:en:second";
  await manager.tick();
  assert.deepEqual(updates, ["target:zh:first", "target:en:second"]);
  manager.clear();
});

test("continuous regions reuse a cached translation when OCR content is unchanged", async () => {
  const updates = [];
  let sourceText = "first";
  const manager = new ContinuousRegionManager({
    intervalMs: 100000,
    inspectRegion: async () => ({ sourceText, translatedText: `T:${sourceText}` }),
    onUpdate: (region, result) => updates.push([region.id, result.translatedText])
  });
  assert.equal(manager.add({ id: "a", screenRect: {} }), true);
  await manager.tick();
  await manager.tick();
  sourceText = "second";
  await manager.tick();
  assert.deepEqual(updates, [["a", "T:first"], ["a", "T:first"], ["a", "T:second"]]);
  manager.dispose();
});

test("continuous region manager enforces three regions and supports pause resume clear", () => {
  const manager = new ContinuousRegionManager({ inspectRegion: async () => ({}) });
  assert.equal(manager.add({ id: "1" }), true);
  assert.equal(manager.add({ id: "2" }), true);
  assert.equal(manager.add({ id: "3" }), true);
  assert.equal(manager.add({ id: "4" }), false);
  manager.pause();
  assert.equal(manager.paused, true);
  manager.resume();
  assert.equal(manager.paused, false);
  manager.clear();
  assert.equal(manager.snapshot().length, 0);
});

test("pausing continuous regions aborts the in-flight inspection and suppresses late updates", async () => {
  const updates = [];
  let observedSignal;
  const manager = new ContinuousRegionManager({
    inspectRegion: (_region, { signal }) => new Promise((_resolve, reject) => {
      observedSignal = signal;
      signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { code: "ocr-cancelled" })), { once: true });
    }),
    onUpdate: (region) => updates.push(region.id)
  });
  manager.add({ id: "active" });
  const running = manager.tick();
  await new Promise(setImmediate);
  manager.pause();
  await running;
  assert.equal(observedSignal.aborted, true);
  assert.deepEqual(updates, []);
  assert.equal(manager.timer, null);
});

test("continuous regions use the latest configured interval without overlapping tasks", async () => {
  const scheduled = [];
  let intervalMs = 900;
  let running = 0;
  let peak = 0;
  const manager = new ContinuousRegionManager({
    getIntervalMs: () => intervalMs,
    setTimer: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
    clearTimer: () => {},
    inspectRegion: async () => { running += 1; peak = Math.max(peak, running); await new Promise(setImmediate); running -= 1; return { sourceText: "same", translatedText: "相同" }; }
  });
  manager.add({ id: "one" });
  scheduled.shift().callback();
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  assert.equal(peak, 1);
  assert.equal(scheduled.at(-1).delay, 1000);
  intervalMs = 2400;
  scheduled.pop().callback();
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  assert.equal(scheduled.at(-1).delay, 2400);
  manager.clear();
});

test("unchanged regional text can refresh its timed overlay without retranslating", async () => {
  const updates = [];
  let inspections = 0;
  const manager = new ContinuousRegionManager({
    intervalMs: 100000,
    inspectRegion: async () => { inspections += 1; return { sourceText: "same", translatedText: "相同" }; },
    onUpdate: (_region, result) => updates.push(result)
  });
  manager.add({ id: "same" });
  await manager.tick();
  await manager.tick();
  assert.equal(inspections, 2);
  assert.equal(updates.length, 2);
  assert.equal(updates[1].unchanged, true);
  manager.clear();
});

test("game translation overlays render text only and never use card chrome", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/services/region-capture/translation-overlay-manager.js"), "utf8");
  assert.match(source, /class=\"text\"/);
  assert.match(source, /text-shadow:/);
  assert.match(source, /overflow:hidden/);
  assert.match(source, /focusable: false/);
  assert.match(source, /showInactive\(\)/);
  assert.doesNotMatch(source, /class=\"card\"/);
  assert.doesNotMatch(source, /border:1px/);
  assert.doesNotMatch(source, /background:rgba\(/);
  assert.match(source, /this\.getStyle\(kind\)/);
  assert.match(source, /style\.fontFamily/);
  assert.match(source, /style\.backgroundOpacity/);
  assert.match(source, /durationMs/);
  assert.match(source, /setTimeout\(\(\) => this\.remove\(id\)/);
});
