const should = require('should');
const child_process = require('child_process');
const psTree = require('ps-tree');

const path = require('path');
var appPath = path.resolve(__dirname, '../');
var electronPath = path.resolve(__dirname, '../node_modules/.bin/electron');

var Application = require('spectron').Application;

process.env.NODE_ENV = 'test'; // suppress logging

/**
 * Kill a process and all of its children (SIGTERM)
 * The tree-kill module doesn't work for me in this context
 *  - the ps process never returns, it gets stuck as a defunct
 *  process.
 * @param {number} parentPid The root of the process tree to kill
 */
var tree_kill = function(parentPid) {
  psTree(parentPid, function(err, children) {
    children.forEach(function(child) { process.kill(child.PID); });
  });
};

describe('Application', function() {
  var app = new Application({path : electronPath, args : [ appPath ]});

  /**
   * Clean up the spectron instance
   */
  afterEach(function() {
    if (app && app.isRunning()) {
      return app.stop();
    }
  });

  it('should only allow one instance to run', function() {
    // Spectron doesn't work with apps that don't open a window,
    // so we use child_process instead.
    // See https://github.com/electron/spectron/issues/90
    this.timeout(5000);

    var app1, app2; // child_process

    // un-suppress logging, so we can track child progress
    // Requires the app to be logging in debug level
    process.env.NODE_ENV = undefined;
    app1 = child_process.spawn(electronPath, [ appPath ]);
    process.env.NODE_ENV = 'test';

    app1.on('exit', function() { app1 = null; });

    var kill_apps = function() {
      [app1, app2].forEach(function(a) {
        // a.kill doesn't work - it kills the node process, but its descendents
        // live on
        if (a) {
          tree_kill(a.pid);
        }
      });
    };

    return new Promise(function(fulfill, reject) {
             var app1startup = function(buffer) {
               if (buffer.toString().includes("Creating tray")) {
                 process.env.NODE_ENV = undefined;
                 app2 = child_process.spawn(electronPath, [ appPath ]);
                 process.env.NODE_ENV = 'test';

                 app2.on('exit', function(code) {
                   app2 = null;
                   fulfill(true);
                 });

                 // don't care which stream the notification will come on
                 app2.stdout.on('data', app2startup);
                 app2.stderr.on('data', app2startup);
               }
             };

             var app2startup = function(buffer) {
               if (buffer.toString().includes("starting up")) {
                 reject("Second instance is starting up");
               }
             };

             // don't care which stream the notification will come on
             app1.stdout.on('data', app1startup);
             app1.stderr.on('data', app1startup);
           })
        .then(kill_apps, kill_apps);
  });
});

