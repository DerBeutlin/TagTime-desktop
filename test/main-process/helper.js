/**
 * Helper module for tests
 */
"use strict";

// Don't pollute test output with normal logs
// This will get called prior to the standard log config on app startup,
// so just need to ensure that doesn't overwrite this config.
const winston = require("winston");
const tmp = require("tmp");
let logfile = tmp.tmpNameSync();
winston.info(
  "Test mode log config - only errors to console, all to " + logfile
);
winston.configure({
  transports: [
    new winston.transports.File({
      level: "debug",
      filename: logfile,
      json: false
    }),
    new winston.transports.Console({ level: "error" })
  ]
});
