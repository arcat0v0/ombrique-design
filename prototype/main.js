const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const MODE = process.env.PROTO_MODE || "manual";
const OUT_DIR = path.join(__dirname, "out");
fs.mkdirSync(path.join(OUT_DIR, "shots"), { recursive: true });

app.commandLine.appendSwitch("enable-blink-features", "CanvasDrawElement");
app.commandLine.appendSwitch("enable-unsafe-webgpu");
app.commandLine.appendSwitch("use-webgpu-adapter", "vulkan");

if (MODE.startsWith("shader-")) {
  app.commandLine.appendSwitch("disable-background-timer-throttling");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
}

const isolated = [];
let resultsReceived = false;

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1680,
    height: 1050,
    useContentSize: true,
    backgroundColor: "#101014",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on("console-message", (_e, _l, message) => {
    console.log("[renderer]", message);
  });

  ipcMain.on("proto-probe", (_e, data) => {
    console.log("PROBE " + JSON.stringify(data, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, "probe.json"), JSON.stringify(data, null, 2));
    if (MODE === "probe") setTimeout(() => app.quit(), 300);
  });
  ipcMain.on("proto-isolated", (_e, data) => {
    isolated.push(data);
    console.log("[isolated-world]", JSON.stringify(data));
  });
  ipcMain.handle("proto-shot", async (_e, name) => {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT_DIR, "shots", `${name}.png`), image.toPNG());
    return true;
  });
  ipcMain.on("proto-results", (_e, data) => {
    resultsReceived = true;
    const file = MODE.startsWith("shader-") ? `${MODE}-results.json` : "results.json";
    fs.writeFileSync(
      path.join(OUT_DIR, file),
      JSON.stringify({ mode: MODE, isolatedReports: isolated, ...data }, null, 2),
    );
    if (MODE.startsWith("shader-")) console.log(`RESULTS ${JSON.stringify(data, null, 2)}`);
    console.log(`RESULTS written to out/${file}`);
    setTimeout(() => app.quit(), 300);
  });

  if (MODE === "probe") win.loadFile("probe.html");
  else if (MODE.startsWith("shader-")) win.loadFile("shader.html", { query: { mode: MODE } });
  else win.loadFile("index.html", { query: MODE === "test" ? { auto: "1" } : {} });
  console.log(`[proto] window created, mode=${MODE}`);
  if (MODE.startsWith("shader-")) {
    setTimeout(() => {
      if (!resultsReceived) {
        console.error(`[proto] no results within 180s for ${MODE}; GPU or rAF stalled`);
        app.exit(2);
      }
    }, 180000);
  }
  if (MODE === "manual") {
    setTimeout(async () => {
      const image = await win.webContents.capturePage();
      fs.writeFileSync(path.join(OUT_DIR, "shots", "manual-boot.png"), image.toPNG());
      console.log("[proto] boot screenshot saved");
    }, 6000);
  }
});

app.on("window-all-closed", () => app.quit());
