// Regenerates the iPhone launch screens in public/startup/ (icon + app name
// on the app background, light and dark) and prints the <link> tags for
// index.html. Run from client/ after changing the icon, the name, or the
// --color-bg / --color-text tokens:  node scripts/startup-images.mjs
// Needs Google Chrome (headless). Portrait only: the app is used upright.
/* global URL, setTimeout, fetch, WebSocket, Buffer */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9850;
const client = fileURLToPath(new URL("..", import.meta.url));
const outDir = `${client}public/startup`;

// [CSS width, CSS height, device pixel ratio] for every iPhone on a current iOS.
const SIZES = [
  [375, 667, 2], // SE 2nd/3rd gen
  [414, 896, 2], // XR, 11
  [375, 812, 3], // X, XS, 11 Pro, 12 mini, 13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [390, 844, 3], // 12, 12 Pro, 13, 13 Pro, 14, 16e
  [428, 926, 3], // 12 Pro Max, 13 Pro Max, 14 Plus
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [430, 932, 3], // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [420, 912, 3], // Air
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
];

const css = readFileSync(`${client}src/styles/index.css`, "utf8");
const token = (name) => css.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"))[1];
const SCHEMES = {
  light: { bg: token("--color-bg"), text: token("--color-text") },
  dark: { bg: token("--_dark-color-bg"), text: token("--_dark-color-text") },
};
const font = `file://${require.resolve("@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2")}`;
const icon = `file://${client}public/favicon.svg`;
const page = ({
  bg,
  text,
}) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
@font-face { font-family: Fraunces; src: url("${font}") format("woff2"); font-weight: 100 900; }
html, body { margin: 0; height: 100%; background: ${bg}; }
body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; }
img { width: 112px; height: 112px; }
p { margin: 0 0 40px; font: 700 34px/1.1 Fraunces, Georgia, serif; color: ${text}; }
</style><img src="${icon}"><p>Little Meals</p>`;

mkdirSync(outDir, { recursive: true });
const tmp = `${tmpdir()}/startup-page-${port}.html`;
const chrome = spawn(
  CH,
  [
    `--remote-debugging-port=${port}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--allow-file-access-from-files",
    `--user-data-dir=${tmpdir()}/startup-images-${port}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
try {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let list = null;
  for (let i = 0; i < 40 && !list; i++) {
    await sleep(500);
    try {
      list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {
      /* not up yet */
    }
  }
  if (!list) throw new Error("Chrome never opened its debug port");
  const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (m) => {
    const d = JSON.parse(m.data);
    pending.get(d.id)?.(d);
    pending.delete(d.id);
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const links = [];
  for (const [scheme, colors] of Object.entries(SCHEMES)) {
    writeFileSync(tmp, page(colors));
    for (const [w, h, dpr] of SIZES) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: w,
        height: h,
        deviceScaleFactor: dpr,
        mobile: true,
      });
      await send("Page.navigate", { url: `file://${tmp}` });
      await sleep(400);
      await send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
      const name = `${scheme}-${w * dpr}x${h * dpr}.png`;
      const shot = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(`${outDir}/${name}`, Buffer.from(shot.result.data, "base64"));
      links.push(
        `    <link rel="apple-touch-startup-image" href="/startup/${name}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})" />`,
      );
    }
  }
  ws.close();
  console.log(links.join("\n"));
} finally {
  chrome.kill();
}
