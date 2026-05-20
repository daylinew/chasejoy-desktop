import { app, BrowserWindow, shell } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { registerIpc } from "./ipc.js";
import { closeDb, getDb } from "./db/index.js";
import { getSettingsStore } from "./stores/settings-store.js";
import { closeAgentCheckpointer } from "./agent/checkpointer.js";
import { createLogger, installGlobalCrashHandlers } from "./utils/logger.js";

const log = createLogger("main");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let teardownIpc: (() => void) | null = null;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: "#0f1115",
    title: "ChaseJoy",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on("ready-to-show", () => {
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: "detach" });
  });

  win.webContents.on("preload-error", (_e, preloadPath, error) => {
    log.error("preload-error", preloadPath, error);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    installGlobalCrashHandlers();
    log.info("ChaseJoy main process ready", { isDev });

    /* Open DB before anything else (runs migrations) */
    getDb();

    /* Seed settings from env if first run */
    getSettingsStore().bootstrapFromEnv();

    mainWindow = createMainWindow();
    teardownIpc = registerIpc(mainWindow);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
        if (teardownIpc) teardownIpc();
        teardownIpc = registerIpc(mainWindow);
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    if (teardownIpc) {
      teardownIpc();
      teardownIpc = null;
    }
    closeAgentCheckpointer();
    closeDb();
  });
}
