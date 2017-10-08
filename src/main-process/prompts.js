"use strict";

const winston = require("winston");
const { ipcMain, BrowserWindow } = require("electron");
const windowStateKeeper = require("electron-window-state");

const helper = require("./helper");
const edit = require("./edit");
const Ping = require("../ping");

// Global reference to prevent garbage collection
let promptWindow;

/**
 * Open a ping prompt window
 */
exports.openPrompt = function(time) {
  winston.debug("Showing prompt");
  if (promptWindow) {
    winston.warn("Tried to open a prompt window but the old one wasn't cleaned up. Aborting.");
    return;
  }

  // Save & restore window position and dimensions
  let promptWindowState = windowStateKeeper({
    defaultWidth: 500,
    defaultHeight: 200,
    file: "promptWindowState.json"
  });

  promptWindow = new BrowserWindow({
    frame: true,
    minWidth: 205,
    minHeight: 185,
    width: promptWindowState.width,
    height: promptWindowState.height,
    x: promptWindowState.x,
    y: promptWindowState.y,
    maximizable: false,
    fullscreenable: false,
    // icon : path, // defaults to executable
    title: "TagTime",
    alwaysOnTop: global.config.user.get("alwaysOnTop"),
    show: false, // let it render first
    acceptFirstMouse: true, // ensure you can click direct onto the tag entry
    // on some platforms?
    autoHideMenuBar: true, // not an issue on ubuntu, could be a pain on win
    webPreferences: { defaultEncoding: "utf8", nodeIntegration: true }
  });

  // Have window state keeper register resize listeners
  promptWindowState.manage(promptWindow);

  promptWindow.loadURL(helper.getFileUrl("../prompt.html"));

  // Send data.
  // Everything gets converted to JSON, so Sets and Pings don't survive
  promptWindow.webContents.on("did-finish-load", () => {
    let pings, prevTags;
    if (global.pingFile.pings.length > 0) {
      pings = Array.from(global.pingFile.allTags);
      prevTags = global.pingFile.pings.slice(-1)[0].tags;
      if (prevTags) {
        prevTags = Array.from(prevTags);
      }
    }
    promptWindow.webContents.send("data", {
      time: time,
      pings: pings,
      prevTags: prevTags,
      cancelTags: ["afk", "RETRO"] // TODO make configurable
    });
  });

  // don't show until rendering complete
  // could do this once received an ack via IPC?
  promptWindow.once("ready-to-show", () => {
    promptWindow.show();

    promptWindow.flashFrame(true); // TODO this only works the first time?
    setTimeout(() => {
      if (promptWindow) {
        promptWindow.flashFrame(false);
      }
    }, 2500);

    promptWindow.on("closed", () => {
      promptWindow = null;
    });
  });
};

var _scheduleTimer;

/**
 * Schedules the creation of prompt windows at ping times in the future.
 * Won't launch a new prompt window if one is already open.
 * Doesn't handle missed past pings.
 * If a ping is due this second, it won't be scheduled.
 */
exports.schedulePings = function() {
  var now = Date.now();
  var next = global.pings.next(now);

  _scheduleTimer = setTimeout(() => {
    if (promptWindow) {
      winston.info("Skipping prompt because current prompt hasn't been answered");
    } else {
      exports.openPrompt(next);
    }
    exports.schedulePings();
  }, next - now);
};

/**
 * Cancel future pings set up by schedulePings
 */
exports.cancelSchedule = function() {
  clearTimeout(_scheduleTimer);
};

/**
 * Add missing pings to the ping file.
 * Only exported to support testing.
 * @returns {bool} whether there were any missing pings that were added.
 */
exports.catchUp = function(till) {
  if (global.pingFile.pings.length === 0) {
    return false;
  }
  var lastPingTime = global.pingFile.pings[global.pingFile.pings.length - 1].time;
  var missedPings = false;
  var p;
  while (till >= global.pings.next(lastPingTime)) {
    // Replace every missing ping with an afk RETRO ping
    missedPings = true;
    p = new Ping(global.pings.next(lastPingTime), ["afk", "RETRO"], "");
    global.pingFile.push(p);
    lastPingTime = p.time;
  }
  return missedPings;
};

/**
 * Show an editor if the time is after the next ping in the pingfile
 */
exports.editorIfMissed = function() {
  if (global.pingFile.pings.length === 0) {
    return;
  }

  if (exports.catchUp(Date.now()))
    if (promptWindow) {
      winston.info("Skipping editor because prompt hasn't been answered");
    } else {
      edit.openEditor();
    }
};

/* Handle events sent from the prompt window
 * Shouldn't be called directly - only exported so it can be tested :/ */
exports.savePing = function(evt, message) {
  var ping = message.ping;
  winston.debug("Saving ping @ " + ping.time + ": " + ping.tags + " [" + ping.comment + "]");
  global.pingFile.push(ping);

  // The prompt window might pass us coverage information to save
  // If it does, make sure to push it before closing the window, lest app.quit is fired first
  if (message.coverage && "coverage" in global) {
    global.coverage.push(message.coverage);
  }
};
ipcMain.on("save-ping", exports.savePing);