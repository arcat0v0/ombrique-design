const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const MODE = process.env.PROTO_MODE || "manual";
const OUT_DIR = path.join(__dirname, "out");
fs.mkdirSync(path.join(OUT_DIR, "shots"), { recursive: true });

app.commandLine.appendSwitch("enable-blink-features", "CanvasDrawElement");
app.commandLine.appendSwitch("enable-unsafe-webgpu");
app.commandLine.appendSwitch("enable-features", "Vulkan");
app.commandLine.appendSwitch("use-webgpu-adapter", "vulkan");

const isolated = [];

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
    fs.writeFileSync(
      path.join(OUT_DIR, "results.json"),
      JSON.stringify({ mode: MODE, isolatedReports: isolated, ...data }, null, 2),
    );
    console.log("RESULTS written to out/results.json");
    setTimeout(() => app.quit(), 300);
  });

  if (MODE === "probe") win.loadFile("probe.html");
  else win.loadFile("index.html", { query: MODE === "test" ? { auto: "1" } : {} });
  console.log(`[proto] window created, mode=${MODE}`);
  if (MODE === "manual") {
    setTimeout(async () => {
      const image = await win.webContents.capturePage();
      fs.writeFileSync(path.join(OUT_DIR, "shots", "manual-boot.png"), image.toPNG());
      console.log("[proto] boot screenshot saved");
    }, 6000);
  }
});

app.on("window-all-closed", () => app.quit());
