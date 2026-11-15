const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const {
  DOCKED_BALL_VISUAL_CONFIG
} = require("../src/services/floating-ball/docked-ball-visual-config");

const root = path.join(__dirname, "..");

async function getAlphaBounds(filePath) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let alphaPixels = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha > 8) {
        alphaPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    alphaPixels
  };
}

test("visual timing waits five seconds after a real docked pointer leave", () => {
  assert.equal(DOCKED_BALL_VISUAL_CONFIG.hideDelayMs, 5000);
  assert.equal(DOCKED_BALL_VISUAL_CONFIG.hideDollMs, 840);
  assert.equal(DOCKED_BALL_VISUAL_CONFIG.hideOffscreenPauseMs, 80);
  assert.equal(DOCKED_BALL_VISUAL_CONFIG.hidePeekMs, 700);
  assert.equal(DOCKED_BALL_VISUAL_CONFIG.hideAnimationMs, 1620);
  assert.equal(
    DOCKED_BALL_VISUAL_CONFIG.hideDollMs +
      DOCKED_BALL_VISUAL_CONFIG.hideOffscreenPauseMs +
      DOCKED_BALL_VISUAL_CONFIG.hidePeekMs,
    DOCKED_BALL_VISUAL_CONFIG.hideAnimationMs
  );
  assert.equal(DOCKED_BALL_VISUAL_CONFIG.revealHandoffMs, 120);
  assert.equal(DOCKED_BALL_VISUAL_CONFIG.revealDollEntryMs, 720);
  assert.equal(DOCKED_BALL_VISUAL_CONFIG.revealEntryMs, 840);
  assert.equal(DOCKED_BALL_VISUAL_CONFIG.revealSettleMs, 880);
  assert.equal(DOCKED_BALL_VISUAL_CONFIG.revealAnimationMs, 1720);
  assert.equal(
    DOCKED_BALL_VISUAL_CONFIG.revealEntryMs + DOCKED_BALL_VISUAL_CONFIG.revealSettleMs,
    DOCKED_BALL_VISUAL_CONFIG.revealAnimationMs
  );
  assert.equal(
    DOCKED_BALL_VISUAL_CONFIG.revealHandoffMs + DOCKED_BALL_VISUAL_CONFIG.revealDollEntryMs,
    DOCKED_BALL_VISUAL_CONFIG.revealEntryMs
  );
});

test("animation markup uses complementary back, doll, and front layers", () => {
  const html = fs.readFileSync(path.join(root, "src/renderer/index.html"), "utf8");
  const back = html.indexOf('class="animation-bag animation-bag-back"');
  const motion = html.indexOf('class="animation-doll-motion"');
  const doll = html.indexOf('id="animationDoll"');
  const front = html.indexOf('class="animation-bag animation-bag-front"');

  assert.ok(back >= 0 && motion > back && doll > motion && front > doll);
  assert.equal((html.match(/translator-bag-back\.png/g) || []).length, 1);
  assert.equal((html.match(/translator-bag-front\.png/g) || []).length, 1);
  assert.doesNotMatch(html, /translator-empty-bag\.png/);
  assert.match(html, /translator-jump-doll\.png/g);
  assert.doesNotMatch(html, /left-doll\.png|right-doll\.png/);
});

test("left and right edge animation poses mirror one shared doll", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");

  assert.match(css, /\.edge-left[\s\S]*--edge-jump-x:\s*-72px/);
  assert.match(css, /\.edge-right[\s\S]*--edge-jump-x:\s*72px/);
  assert.match(css, /\.edge-left[\s\S]*--edge-turn:\s*-90deg/);
  assert.match(css, /\.edge-right[\s\S]*--edge-turn:\s*90deg/);
});

test("bag layers stay spatially fixed and use explicit visibility timing", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const bagRule = css.match(/\.animation-bag\s*\{([^}]*)\}/)?.[1] || "";

  assert.doesNotMatch(bagRule, /clip-path|mask|overflow/);
  assert.match(css, /\.animation-bag-back\s*\{[\s\S]*z-index:\s*1/);
  assert.match(css, /\.animation-bag-front\s*\{[\s\S]*z-index:\s*3/);
  assert.doesNotMatch(css, /bag-mouth|bag-mask|dock-bag-(?:hide|reveal)/);
  assert.match(css, /\.ball-state-hiding \.animation-bag\s*\{[\s\S]*hide-static-bag[\s\S]*var\(--hide-bag-delay\)/);
  assert.match(css, /@keyframes hide-static-bag\s*\{[\s\S]*visibility:\s*visible[\s\S]*visibility:\s*hidden/);
  assert.match(css, /show-static-bag/);
});

test("the doll uses edge-specific reveal handoff paths plus a separate landing bounce", () => {
  const html = fs.readFileSync(path.join(root, "src/renderer/index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");

  assert.match(html, /class="animation-doll-motion"[\s\S]*id="animationDoll"/);
  assert.match(css, /@keyframes dock-doll-edge-path/);
  assert.match(css, /\.ball-state-hiding \.animation-doll-motion[\s\S]*dock-doll-edge-path/);
  assert.match(css, /@keyframes dock-doll-side-reveal-path/);
  assert.match(css, /@keyframes dock-doll-top-reveal-path/);
  assert.match(css, /\.ball-state-revealing \.animation-doll-motion[\s\S]*dock-doll-side-reveal-path/);
  assert.match(css, /--reveal-settle-delay:\s*var\(--reveal-entry-duration\)/);
  assert.match(css, /dock-doll-settle[\s\S]*var\(--reveal-settle-delay\)/);
  assert.doesNotMatch(css, /bag-mouth-cutoff|bag-interior-clip|contain-doll-in-bag|release-doll-from-bag/);
});

test("character animations keep the full doll visible while the bag front provides masking", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const hideVisibility = css.match(/@keyframes dock-doll-hide-visibility \{[\s\S]*?\n\}/)?.[0] || "";
  const settle = css.match(/@keyframes dock-doll-settle \{[\s\S]*?\n\}/)?.[0] || "";

  assert.doesNotMatch(hideVisibility, /calc\(100% - var\(--doll-visible/);
  assert.doesNotMatch(settle, /calc\(100% - var\(--doll-visible/);
  assert.match(hideVisibility, /clip-path:\s*inset\(0\)/);
  assert.match(settle, /clip-path:\s*inset\(0\)/);
  assert.match(css, /\.animation-bag-front\s*\{[\s\S]*z-index:\s*3/);
  assert.match(css, /\.animation-doll-motion\s*\{[\s\S]*z-index:\s*2/);
});

test("a hide interrupted by pointer return resumes the shared path in reverse", () => {
  const renderer = fs.readFileSync(path.join(root, "src/renderer/renderer.js"), "utf8");

  assert.match(renderer, /previousBallState === "hiding" && currentBallState === "revealing"/);
  assert.match(renderer, /--reveal-handoff-duration",\s*"0ms"/);
  assert.match(renderer, /dock-doll-side-reveal-path/);
  assert.match(renderer, /dock-doll-top-reveal-path/);
  assert.match(renderer, /dock-doll-bottom-spring-reveal-path/);
  assert.match(renderer, /reversePath\.currentTime = entryDuration - traversed/);
  assert.match(renderer, /--reveal-settle-delay/);
});

test("complete visibility animation is isolated from the shell drag surface", () => {
  const html = fs.readFileSync(path.join(root, "src/renderer/index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");

  assert.match(html, /id="visibilityFrame" class="visibility-frame"/);
  assert.match(css, /\.visibility-frame\s*\{[\s\S]*position:\s*absolute/);
  assert.match(css, /\.shell\.visibility-hiding \.visibility-frame[\s\S]*floating-ui-hide/);
  assert.match(css, /\.shell\.visibility-showing \.visibility-frame[\s\S]*floating-ui-show/);
  assert.doesNotMatch(css, /\.shell\.visibility-hiding\s*\{[\s\S]*animation:\s*floating-ui-hide/);
  assert.doesNotMatch(css, /\.shell\.visibility-showing\s*\{[\s\S]*animation:\s*floating-ui-show/);
});

test("visibility temporary classes are cleared before dragging can start", () => {
  const renderer = fs.readFileSync(path.join(root, "src/renderer/renderer.js"), "utf8");
  const prepareDrag = renderer.match(/function prepareDrag\(event,[\s\S]*?\n\}/)?.[0] || "";
  const moveDrag = renderer.match(/function moveDrag\(event\) \{[\s\S]*?\n\}/)?.[0] || "";
  const finishVisibility = renderer.match(/function finishVisibilityAnimation\(payload\) \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(renderer, /function stabilizeVisibilityAnimation/);
  assert.match(prepareDrag, /event\.preventDefault\(\)/);
  assert.match(moveDrag, /stabilizeVisibilityAnimation\(\{ resetVars: true \}\)/);
  assert.match(moveDrag, /window\.translatorShell\.startDrag\(point, pendingDragContext\)/);
  assert.match(finishVisibility, /payload\.type === "show"[\s\S]*stabilizeVisibilityAnimation\(\{ resetVars: true \}\)/);
  assert.match(renderer, /payload\.type === "stable"[\s\S]*stabilizeVisibilityAnimation\(\{ resetVars: true \}\)/);
});

test("hidden-window cleanup sends a stable renderer state after the browser window hides", () => {
  const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");

  assert.match(main, /mainWindow\.hide\(\);[\s\S]*type:\s*"stable"/);
});

test("floating shell disables Chromium native image dragging", () => {
  const html = fs.readFileSync(path.join(root, "src/renderer/index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "src/renderer/renderer.js"), "utf8");
  const imgCount = (html.match(/<img\b/g) || []).length;
  const disabledDragCount = (html.match(/draggable="false"/g) || []).length;

  assert.ok(imgCount > 0);
  assert.equal(disabledDragCount, imgCount);
  assert.match(css, /img,\s*[\s\S]*-webkit-user-drag:\s*none/);
  assert.match(renderer, /appEl\.addEventListener\("dragstart", preventNativeDrag, true\)/);
  assert.match(renderer, /document\.querySelectorAll\("img"\)[\s\S]*image\.draggable = false/);
});

test("floating shell uses custom pointer dragging without app-region drag", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "src/renderer/renderer.js"), "utf8");

  assert.doesNotMatch(css, /-webkit-app-region/);
  assert.match(renderer, /ballEl\.addEventListener\("pointerdown", beginDrag\)/);
  assert.match(renderer, /window\.translatorShell\.startDrag/);
});

test("top and bottom use edge-specific character paths without replacing left/right", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");

  assert.match(css, /\.ball-state-hiding \.animation-doll-motion[\s\S]*dock-doll-edge-path/);
  assert.match(css, /\.edge-top\.ball-state-hiding \.animation-doll-motion[\s\S]*animation-name:\s*dock-doll-top-hide-path/);
  assert.match(css, /\.edge-top\.ball-state-revealing \.animation-doll-motion[\s\S]*dock-doll-top-reveal-path/);
  assert.match(css, /\.edge-bottom\.ball-state-hiding \.animation-doll-motion[\s\S]*animation-name:\s*dock-doll-bottom-dive-hide-path/);
  assert.match(css, /\.edge-bottom\.ball-state-revealing \.animation-doll-motion[\s\S]*dock-doll-bottom-spring-reveal-path/);
});

test("top dock keeps physical geometry but lowers the visible character inside the window", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");

  assert.match(css, /\.collapsed\.edge-top \.ball\s*\{[\s\S]*top:\s*10px/);
  assert.match(css, /\.expanded\.edge-top \.ball\s*\{[\s\S]*top:\s*10px/);
  assert.match(css, /\.animation-scene\s*\{[\s\S]*top:\s*var\(--animation-scene-top\)/);
});

test("top hide has a short anticipation and ends in the upside-down hidden pose", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const keyframes = css.match(/@keyframes dock-doll-top-hide-path \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(keyframes, /14%\s*\{[\s\S]*translate\(0,\s*9px\)[\s\S]*scale\(1\.045,\s*0\.92\)/);
  assert.match(keyframes, /38%\s*\{[\s\S]*translate\(0,\s*-38px\)[\s\S]*rotate\(0deg\)/);
  assert.match(keyframes, /66%\s*\{[\s\S]*translate\(0,\s*-62px\)[\s\S]*rotate\(96deg\)/);
  assert.match(keyframes, /100%\s*\{[\s\S]*translate\(0,\s*-86px\)[\s\S]*rotate\(180deg\)/);
});

test("bottom hide jumps clear of the bag before rotating into a dive", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const keyframes = css.match(/@keyframes dock-doll-bottom-dive-hide-path \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(keyframes, /14%\s*\{[\s\S]*translate\(0,\s*10px\)[\s\S]*scale\(1\.05,\s*0\.9\)/);
  assert.match(keyframes, /36%\s*\{[\s\S]*translate\(0,\s*-58px\)[\s\S]*rotate\(0deg\)/);
  assert.match(keyframes, /48%\s*\{[\s\S]*translate\(var\(--bottom-dive-lift-x\),\s*-68px\)[\s\S]*rotate\(12deg\)/);
  assert.match(keyframes, /58%\s*\{[\s\S]*translate\(var\(--bottom-dive-far-x\),\s*-48px\)[\s\S]*rotate\(var\(--bottom-dive-tilt\)\)/);
  assert.match(keyframes, /100%\s*\{[\s\S]*translate\(var\(--bottom-dive-drop-x\),\s*104px\)[\s\S]*rotate\(var\(--bottom-dive-final-turn\)\)/);
});

test("bottom dive mirrors left and right with opposite lateral movement", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "src/renderer/renderer.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");

  assert.match(css, /--bottom-dive-far-x:\s*62px/);
  assert.match(css, /--bottom-dive-drop-x:\s*54px/);
  assert.match(css, /\.bottom-dive-right\s*\{[\s\S]*--bottom-dive-far-x:\s*-62px/);
  assert.match(css, /\.bottom-dive-right\s*\{[\s\S]*--bottom-dive-drop-x:\s*-54px/);
  assert.match(css, /\.bottom-dive-right\s*\{[\s\S]*--bottom-dive-final-turn:\s*-180deg/);
  assert.match(renderer, /BOTTOM_DIVE_CLASSES/);
  assert.match(renderer, /bottom-dive-\$\{state\.bottomDiveSide === "right" \? "right" : "left"\}/);
  assert.match(main, /bottomDiveSide:\s*bottomDiveSideForBounds/);
});

test("all edge character animations expand the BrowserWindow stage without creating a persistent hit area", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "src/renderer/renderer.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");

  assert.match(main, /CHARACTER_ANIMATION_STAGE\s*=\s*\{\s*width:\s*220,\s*height:\s*190\s*\}/);
  assert.match(main, /setCharacterAnimationStageFromCollapsed/);
  assert.match(main, /collapsedBoundsFromCharacterAnimation/);
  assert.match(main, /isCharacterAnimationState/);
  assert.match(main, /setIgnoreMouseEvents\(true,\s*\{\s*forward:\s*true\s*\}\)/);
  assert.match(main, /setIgnoreMouseEvents\(false\)/);
  assert.match(main, /findAnimationHitRegion/);
  assert.match(main, /animation-hit-regions/);
  assert.match(renderer, /collectAnimationHitRegions/);
  assert.match(renderer, /setAnimationHitRegions/);
  assert.match(renderer, /--animation-scene-left/);
  assert.match(renderer, /--animation-scene-top/);
  assert.match(css, /\.animation-scene\s*\{[\s\S]*left:\s*var\(--animation-scene-left\)/);
});

test("animation completion rechecks the real cursor after restoring stable bounds", () => {
  const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
  assert.match(
    main,
    /wasAnimating\s*&&\s*nextState\s*===\s*BALL_STATES\.DOCKED_VISIBLE/
  );
  assert.match(main, /setImmediate\(syncDockedBallPointerPresence\)/);
});

test("capture restore resumes interaction before sampling the real cursor", () => {
  const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
  const hide = main.match(/async function hideFloatingBallForCapture\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  const restore = main.match(/function restoreFloatingBallAfterCapture\(\) \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(hide, /dockedBall\?\.suspend\(\);[\s\S]*setIgnoreMouseEvents\(true/);
  assert.match(restore, /setIgnoreMouseEvents\(false\);[\s\S]*dockedBall\?\.resume\(\{ deferHide: true \}\);[\s\S]*syncDockedBallPointerPresence\(\)/);
});

test("immediate reveal-to-hide handoff keeps the native animation stage", () => {
  const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
  const machine = fs.readFileSync(
    path.join(root, "src/services/floating-ball/docked-ball-state-machine.js"),
    "utf8"
  );
  const transition = main.match(/function handleDockedBallStateChange[\s\S]*?\n\}/)?.[0] || "";

  assert.match(machine, /hideDelayMs <= 0[\s\S]*canCompleteHide\(\)[\s\S]*transition\(BALL_STATES\.HIDING\)/);
  assert.match(transition, /if \(wasAnimating && !willAnimate\)/);
  assert.doesNotMatch(transition, /if \(wasAnimating && willAnimate\)[\s\S]*setBounds/);
});

test("animation layers are retired before the BrowserWindow collapses", () => {
  const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
  const transition = main.match(/function handleDockedBallStateChange[\s\S]*?\n\}/)?.[0] || "";
  const sendIndex = transition.indexOf("sendWindowState();");
  const collapseIndex = transition.indexOf("mainWindow.setBounds(currentBounds, false);");

  assert.ok(sendIndex >= 0);
  assert.ok(collapseIndex > sendIndex);
});

test("bottom reveal starts from a short handoff pose before springing out and landing stable", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const keyframes = css.match(/@keyframes dock-doll-bottom-spring-reveal-path \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(css, /--bottom-reveal-entry-x:\s*44px/);
  assert.match(css, /--bottom-reveal-handoff-y:\s*82px/);
  assert.match(css, /\.bottom-dive-right\s*\{[\s\S]*--bottom-reveal-entry-x:\s*-44px/);
  assert.match(keyframes, /0%\s*\{[\s\S]*translate\(var\(--bottom-reveal-entry-x\),\s*var\(--bottom-reveal-handoff-y\)\)[\s\S]*rotate\(0deg\)/);
  assert.match(keyframes, /22%\s*\{[\s\S]*translate\(var\(--bottom-reveal-entry-x\),\s*76px\)[\s\S]*rotate\(0deg\)/);
  assert.match(keyframes, /48%\s*\{[\s\S]*translate\(var\(--bottom-reveal-entry-x\),\s*36px\)[\s\S]*rotate\(var\(--bottom-reveal-tilt\)\)/);
  assert.match(keyframes, /68%\s*\{[\s\S]*translate\(var\(--bottom-reveal-rise-x\),\s*-48px\)[\s\S]*rotate\(var\(--bottom-reveal-counter-tilt\)\)/);
  assert.match(keyframes, /80%\s*\{[\s\S]*translate\(var\(--bottom-reveal-near-x\),\s*-24px\)[\s\S]*rotate\(0deg\)/);
  assert.match(keyframes, /91%\s*\{[\s\S]*translate\(0,\s*6px\)[\s\S]*rotate\(0deg\)/);
  assert.match(keyframes, /100%\s*\{[\s\S]*translate\(0,\s*0\)[\s\S]*rotate\(0deg\)[\s\S]*scale\(1\)/);
  assert.doesNotMatch(keyframes, /--bottom-dive-final-turn/);
  assert.doesNotMatch(keyframes, /--bottom-dive-near-turn/);
  assert.doesNotMatch(keyframes, /--bottom-dive-tilt/);
});

test("hide sends the full doll offscreen before edge peek emerges into stable hidden", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");

  assert.match(css, /--hide-doll-duration:\s*840ms/);
  assert.match(css, /--hide-bag-delay:\s*400ms/);
  assert.match(css, /--hide-offscreen-pause-duration:\s*80ms/);
  assert.match(css, /--hide-peek-duration:\s*700ms/);
  assert.match(css, /--hide-peek-delay:\s*calc\(var\(--hide-doll-duration\) \+ var\(--hide-offscreen-pause-duration\)\)/);
  assert.match(css, /\.ball-state-hiding \.animation-doll-motion\s*\{[\s\S]*var\(--hide-doll-duration\)/);
  assert.match(css, /\.ball-state-hiding \.animation-doll\s*\{[\s\S]*var\(--hide-duration\)/);
  assert.match(css, /\.ball-state-hiding \.edge-sensor\s*\{[\s\S]*display:\s*block/);
  for (const edge of ["top", "bottom", "left", "right"]) {
    const hideRule = css.match(new RegExp(`\\.edge-${edge}\\.ball-state-hiding \\.peek-art-${edge}\\s*\\{[^}]*\\}`))?.[0] || "";
    assert.match(hideRule, new RegExp(`hide-peek-${edge}-emerge`));
    assert.match(hideRule, /var\(--hide-peek-delay\) both/);
    assert.match(css, new RegExp(`@keyframes hide-peek-${edge}-emerge`));
  }
  assert.doesNotMatch(css, /reveal-peek-(?:top|bottom|left|right)-emerge/);
});

test("reveal uses only a short peek-to-doll handoff instead of replaying the long peek emerge", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");

  assert.match(css, /--reveal-handoff-duration:\s*120ms/);
  assert.match(css, /--reveal-doll-entry-duration:\s*720ms/);
  assert.match(css, /--reveal-entry-duration:\s*840ms/);
  assert.match(css, /\.ball-state-revealing \.edge-sensor\s*\{[\s\S]*display:\s*block/);
  assert.match(css, /\.ball-state-revealing \.animation-scene\s*\{[\s\S]*reveal-full-doll-enter/);
  for (const edge of ["top", "bottom", "left", "right"]) {
    const revealRule = css.match(new RegExp(`\\.edge-${edge}\\.ball-state-revealing \\.peek-art-${edge}\\s*\\{[^}]*\\}`))?.[0] || "";
    assert.match(revealRule, /reveal-peek-handoff-fade/);
    assert.doesNotMatch(revealRule, new RegExp(`hide-peek-${edge}-emerge`));
  }
  assert.match(css, /@keyframes reveal-peek-handoff-fade/);
  assert.match(css, /\.ball-state-revealing \.animation-doll-motion\s*\{[\s\S]*dock-doll-side-reveal-path[\s\S]*var\(--reveal-handoff-duration\)\s*both/);
  assert.match(css, /\.edge-bottom\.ball-state-revealing \.animation-doll-motion\s*\{[\s\S]*var\(--reveal-handoff-duration\)\s*both/);
});

test("full doll reveal begins from edge-specific handoff poses instead of a default reset", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const side = css.match(/@keyframes dock-doll-side-reveal-path \{[\s\S]*?\n\}/)?.[0] || "";
  const top = css.match(/@keyframes dock-doll-top-reveal-path \{[\s\S]*?\n\}/)?.[0] || "";
  const bottom = css.match(/@keyframes dock-doll-bottom-spring-reveal-path \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(css, /--edge-reveal-start-x:\s*54px/);
  assert.match(css, /--edge-reveal-start-turn:\s*18deg/);
  assert.match(css, /\.edge-left\s*\{[\s\S]*--edge-reveal-start-x:\s*-54px[\s\S]*--edge-reveal-start-turn:\s*-18deg/);
  assert.match(side, /0%\s*\{[\s\S]*translate\(var\(--edge-reveal-start-x\),\s*-2px\)[\s\S]*rotate\(var\(--edge-reveal-start-turn\)\)/);
  assert.match(top, /0%\s*\{[\s\S]*translate\(0,\s*-64px\)[\s\S]*rotate\(180deg\)/);
  assert.match(bottom, /0%\s*\{[\s\S]*translate\(var\(--bottom-reveal-entry-x\),\s*var\(--bottom-reveal-handoff-y\)\)[\s\S]*rotate\(0deg\)/);
  for (const keyframes of [side, top, bottom]) {
    const firstFrame = keyframes.match(/0%\s*\{[\s\S]*?\n\s*\}/)?.[0] || "";
    assert.doesNotMatch(firstFrame, /translate\(0,\s*0\)/);
  }
});

test("docked-hidden uses independent edge peek assets without the bag or full doll", () => {
  const html = fs.readFileSync(path.join(root, "src/renderer/index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const peekArtRule = css.match(/\.peek-art\s*\{[^}]*\}/)?.[0] || "";

  const edgeSensor = html.match(/<button id="edgeSensor"[\s\S]*?<\/button>/)?.[0] || "";
  for (const edge of ["top", "bottom", "left", "right"]) {
    assert.match(edgeSensor, new RegExp(`class="peek-art peek-art-${edge}"[\\s\\S]*peek-${edge}\\.png`));
  }
  assert.doesNotMatch(edgeSensor, /translator-jump-doll\.png/);
  assert.doesNotMatch(edgeSensor, /translator-bag/);
  assert.match(css, /\.ball-state-docked-hidden \.ball,\s*\n\.ball-state-docked-hidden \.edge-animation\s*\{[\s\S]*display:\s*none/);
  assert.match(css, /\.ball-state-docked-hidden \.edge-sensor\s*\{[\s\S]*display:\s*block/);
  assert.match(css, /\.ball-state-docked-hidden \.peek-art\s*\{[\s\S]*animation:\s*none/);
  assert.match(css, /\.peek-anchor\s*\{[\s\S]*overflow:\s*visible/);
  assert.match(peekArtRule, /animation:\s*none/);
  assert.doesNotMatch(peekArtRule, /rotate|translate|scale|dock-doll/);
});

test("four docked-hidden stable poses use edge-specific assets instead of runtime rotation", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const left = css.match(/\.edge-left\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const right = css.match(/\.edge-right\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const top = css.match(/\.edge-top\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const bottom = css.match(/\.edge-bottom\s*\{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(top, /--peek-width:\s*90px/);
  assert.match(top, /--peek-height:\s*90px/);
  assert.match(bottom, /--peek-width:\s*90px/);
  assert.match(bottom, /--peek-height:\s*90px/);
  assert.match(left, /--peek-width:\s*90px/);
  assert.match(left, /--peek-height:\s*90px/);
  assert.match(right, /--peek-width:\s*90px/);
  assert.match(right, /--peek-height:\s*90px/);
  assert.match(css, /\.edge-top \.peek-art-top,\s*\n\.edge-bottom \.peek-art-bottom,\s*\n\.edge-left \.peek-art-left,\s*\n\.edge-right \.peek-art-right\s*\{[\s\S]*display:\s*block/);
  assert.doesNotMatch(css, /--peek-(?:doll|rotate|scale|flip|origin|box)/);
});

test("stable hidden window remains small without cropping the dedicated peeks twice", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");

  assert.equal(DOCKED_BALL_VISUAL_CONFIG.hiddenWindowWidth, 92);
  assert.equal(DOCKED_BALL_VISUAL_CONFIG.hiddenWindowHeight, 118);
  assert.match(css, /\.edge-top \.peek-anchor\s*\{[\s\S]*top:\s*-6px/);
  assert.match(css, /\.edge-bottom \.peek-anchor\s*\{[\s\S]*bottom:\s*-6px/);
  assert.match(css, /\.edge-left \.peek-anchor\s*\{[\s\S]*left:\s*-6px/);
  assert.match(css, /\.edge-right \.peek-anchor\s*\{[\s\S]*right:\s*-6px/);
  assert.match(css, /\.edge-left \.peek-anchor\s*\{[\s\S]*top:\s*0/);
  assert.match(css, /\.edge-right \.peek-anchor\s*\{[\s\S]*top:\s*0/);
  assert.match(
    css,
    /\.ball-state-hiding\.edge-left \.peek-anchor,[\s\S]*\.ball-state-revealing\.edge-right \.peek-anchor\s*\{[\s\S]*top:\s*calc\(var\(--animation-scene-top\) - 27px\)/
  );
});

test("top docked-hidden peek is a dedicated inward-facing asset", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const top = css.match(/\.edge-top\s*\{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(top, /--peek-height:\s*90px/);
  assert.match(css, /peek-art-top[\s\S]*display:\s*block/);
  assert.doesNotMatch(top, /rotate|--peek-doll|--peek-box/);
});

test("peek assets are generated head-only stable states from the real doll source", async () => {
  const script = fs.readFileSync(path.join(root, "scripts/generate-peek-assets.js"), "utf8");
  const assets = {
    "peek-top.png": { width: 90, height: 90, minBodyWidth: 47, minBodyHeight: 37 },
    "peek-bottom.png": { width: 90, height: 90, minBodyWidth: 47, minBodyHeight: 37 },
    "peek-left.png": { width: 90, height: 90, minBodyWidth: 38, minBodyHeight: 48 },
    "peek-right.png": { width: 90, height: 90, minBodyWidth: 38, minBodyHeight: 48 }
  };

  assert.match(script, /translator-jump-doll\.png/);
  assert.match(script, /extract\(\{\s*left:\s*0,\s*top:\s*0,\s*width:\s*917,\s*height:\s*735\s*\}\)/);
  assert.match(script, /PEEK_HEAD_SOURCE_WIDTH\s*=\s*48/);
  assert.match(script, /PEEK_CANVAS\s*=\s*Object\.freeze\(\{\s*width:\s*90,\s*height:\s*90\s*\}\)/);
  assert.match(script, /SIDE_PEEK_ROTATION_DEG\s*=\s*88/);
  assert.match(script, /resize\(\{\s*width:\s*PEEK_HEAD_SOURCE_WIDTH\s*\}\)/);
  assert.match(script, /rotate\(180/);
  assert.doesNotMatch(script, /BOTTOM_PEEK_ART|TOP_PEEK_ART/);
  assert.doesNotMatch(script, /height:\s*1344/);

  for (const [file, expected] of Object.entries(assets)) {
    const assetPath = path.join(root, "src/renderer/assets", file);
    const metadata = await sharp(assetPath).metadata();
    const body = await getAlphaBounds(assetPath);
    assert.equal(metadata.width, expected.width);
    assert.equal(metadata.height, expected.height);
    assert.equal(metadata.hasAlpha, true);
    assert.ok(body.width >= expected.minBodyWidth);
    assert.ok(body.height >= expected.minBodyHeight);
    assert.ok(body.width <= expected.width && body.height <= expected.height);
  }
});

test("bottom landing bounce stays shallow enough to avoid passing through the bag front", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const settle = css.match(/@keyframes dock-doll-settle \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(css, /--doll-deep-one-y:\s*9px/);
  assert.match(css, /--doll-deep-two-y:\s*3px/);
  assert.match(settle, /0%\s*\{[\s\S]*translate\(0,\s*0\)/);
  assert.match(settle, /100%\s*\{[\s\S]*translate\(0,\s*0\)/);
  assert.doesNotMatch(settle, /translate\(0,\s*(?:1[6-9]|[2-9]\d)px\)/);
});

test("reveal ends by aligning to the normal static mascot before the state switch", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const staticAlign = css.match(/@keyframes reveal-static-ball-align \{[\s\S]*?\n\}/)?.[0] || "";
  const animationAlign = css.match(/@keyframes reveal-animation-layer-align \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(css, /--reveal-static-align-duration:\s*80ms/);
  assert.match(css, /--reveal-static-align-delay:\s*calc\(var\(--reveal-duration\) - var\(--reveal-static-align-duration\)\)/);
  assert.match(css, /\.shell\.collapsed\.ball-state-revealing \.ball\s*\{[\s\S]*visibility:\s*visible[\s\S]*reveal-static-ball-align/);
  assert.match(css, /\.ball-state-revealing \.edge-animation\s*\{[\s\S]*reveal-animation-layer-align/);
  assert.match(staticAlign, /to\s*\{[\s\S]*opacity:\s*1[\s\S]*translate\(0,\s*0\) rotate\(0deg\) scale\(1\)/);
  assert.match(animationAlign, /to\s*\{[\s\S]*opacity:\s*0[\s\S]*translate\(0,\s*0\) rotate\(0deg\) scale\(1\)/);
});

test("reveal crossfade keeps the static mascot on the animation scene anchor", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const staticRule = Array.from(css.matchAll(/\.shell\.collapsed\.ball-state-revealing \.ball\s*\{[\s\S]*?\n\}/g))
    .map((match) => match[0])
    .find((rule) => /reveal-static-ball-align/.test(rule)) || "";
  const animationRule = Array.from(css.matchAll(/\.ball-state-revealing \.edge-animation\s*\{[\s\S]*?\n\}/g))
    .map((match) => match[0])
    .find((rule) => /reveal-animation-layer-align/.test(rule)) || "";

  assert.match(staticRule, /visibility:\s*visible/);
  assert.match(staticRule, /opacity:\s*0/);
  assert.match(staticRule, /left:\s*var\(--animation-scene-left\)/);
  assert.match(staticRule, /top:\s*var\(--animation-scene-top\)/);
  assert.match(staticRule, /right:\s*auto/);
  assert.match(staticRule, /bottom:\s*auto/);
  assert.match(staticRule, /var\(--reveal-static-align-duration\)[\s\S]*var\(--reveal-static-align-delay\)\s*both/);
  assert.match(animationRule, /var\(--reveal-static-align-duration\)[\s\S]*var\(--reveal-static-align-delay\)\s*both/);
  assert.doesNotMatch(staticRule + animationRule, /display:\s*none|visibility:\s*hidden/);
});

test("direct reveal-to-hide handoff restores the animation layers to full opacity", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");

  assert.match(
    css,
    /\.ball-state-hiding \.edge-animation,\s*\.ball-state-hiding \.animation-scene\s*\{[\s\S]*?opacity:\s*1/
  );
});

test("animation completion ignores stale animationend events from the previous state", () => {
  const renderer = fs.readFileSync(path.join(root, "src/renderer/renderer.js"), "utf8");

  assert.match(renderer, /currentBallState === "hiding"[\s\S]*"dock-doll-hide-visibility"/);
  assert.match(renderer, /currentBallState === "revealing"[\s\S]*"dock-doll-settle"/);
  assert.match(renderer, /event\.animationName !== terminalAnimation[\s\S]*return/);
  assert.match(renderer, /animationFinished\(currentBallState\)/);
});

test("settle keeps the doll upright before static alignment takes over", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const settle = css.match(/@keyframes dock-doll-settle \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(settle, /76%\s*\{[\s\S]*translate\(0,\s*-1px\)[\s\S]*rotate\(-6deg\)/);
  assert.match(settle, /100%\s*\{[\s\S]*rotate\(0deg\)[\s\S]*scale\(1\)/);
});

test("settle has two visible rebounds and the final one tilts the whole scene briefly", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const settle = css.match(/@keyframes dock-doll-settle \{[\s\S]*?\n\}/)?.[0] || "";
  const sceneTilt = css.match(/@keyframes dock-scene-final-tilt \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(settle, /18%\s*\{[\s\S]*var\(--doll-deep-one-y\)/);
  assert.match(settle, /38%\s*\{[\s\S]*var\(--doll-high-one-y\)/);
  assert.match(settle, /58%\s*\{[\s\S]*var\(--doll-deep-two-y\)/);
  assert.match(settle, /76%\s*\{[\s\S]*rotate\(-6deg\)/);
  assert.doesNotMatch(settle, /78%/);
  assert.match(css, /\.ball-state-revealing \.animation-scene\s*\{[\s\S]*dock-scene-final-tilt/);
  assert.match(sceneTilt, /76%\s*\{[\s\S]*rotate\(-6deg\)/);
  assert.match(sceneTilt, /100%\s*\{[\s\S]*rotate\(0deg\)/);
});

test("startup timing diagnostics are opt-in and cover the visible UI milestones", () => {
  const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
  const startupTiming = fs.readFileSync(path.join(root, "src/startup-timing.js"), "utf8");

  assert.match(startupTiming, /TRANSLATOR_STARTUP_TIMING === "1"/);
  assert.match(main, /T0 main process start/);
  assert.match(main, /T3 floating BrowserWindow created/);
  assert.match(main, /T4 renderer did-finish-load/);
  assert.match(main, /T5 floating BrowserWindow showInactive/);
  assert.match(main, /T6 global hotkeys registered/);
  assert.match(main, /T7 OCR runtime object created/);
  assert.match(main, /T9 bootstrap complete/);
});

test("character edge animation remains separate from whole-ui visibility animation", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const visibilityRules = [
    css.match(/\.visibility-frame\s*\{[^}]*\}/)?.[0] || "",
    css.match(/\.shell\.visibility-hiding \.visibility-frame\s*\{[^}]*\}/)?.[0] || "",
    css.match(/\.shell\.visibility-showing \.visibility-frame\s*\{[^}]*\}/)?.[0] || ""
  ].join("\n");
  const characterRules = [
    css.match(/\.ball-state-hiding \.animation-doll-motion\s*\{[^}]*\}/)?.[0] || "",
    css.match(/\.edge-top\.ball-state-hiding \.animation-doll-motion\s*\{[^}]*\}/)?.[0] || "",
    css.match(/\.edge-bottom\.ball-state-hiding \.animation-doll-motion\s*\{[^}]*\}/)?.[0] || ""
  ].join("\n");

  assert.match(css, /\.shell\.visibility-hiding \.visibility-frame[\s\S]*floating-ui-hide/);
  assert.match(css, /\.ball-state-hiding \.animation-doll-motion[\s\S]*dock-doll-edge-path/);
  assert.doesNotMatch(visibilityRules, /dock-doll-(?:top|bottom|edge)/);
  assert.doesNotMatch(characterRules, /floating-ui-(?:hide|show)/);
});
