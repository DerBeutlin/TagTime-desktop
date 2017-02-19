/**
 * @module A continuous sequence of ping times
 */

'use strict';

var _ = require('lodash');
var Random = require('random-js');

var config = require('./config');

/**
 * The random number engine using this sequence's root seed
 */
var engine;
var rand;
/**
 * Re-initialise rand with the root seed
 */
var reseed = function() {
  engine = Random.engines.mt19937().seed(config.seed);
  /**
   * random number generator using the engine's seed
   * @returns {real} in [0,1]
   */
  rand = function() { return Random.real(0, 1)(engine); };
};

/**
 * Re-initialise module state, including config settings
 */
exports.reset = function() {
  period = config.period;
  reseed();
  _pings = undefined;
};

/**
 * The period for this sequence (independent of any changes to the config)
 * @type {minutes}
 */
var period;

/**
 * The list of pings since the earliest asked for.
 *
 * With a 45 minute period there have been roughly 100k pings since the tagtime
 * epoch. So we could store a list of all of them, but it's easy enough to only
 * store from the earliest we've been asked for (at the cost of having to
 * recompute them all if asked for an earlier one)
 */
var _pings;

/**
 * (side effect: updates the seed)
 * @param {pingtime} ping Previous ping
 * @returns {pingtime} The next ping time
 */
var next_ping = function(ping) {
  // Adds a random number drawn from an exponential distribution with mean
  // period
  // Round gaps of <1s up to 1s
  return ping + Math.round(Math.max(1, -1 * period * Math.log(rand())));
};

/**
 * @param {unixtime} time
 * @returns {int} the index into _pings of the ping preceding time
 * Side effect: the next ping is present at the next index in _pings
 */
var prev_ping_index = function(time) {
  if (!_pings || time < _pings[0]) {
    // we don't have a record of a ping this early
    exports.reset();
    var prev = config.epoch;
    var nxt = prev;
    while (nxt < time) {
      prev = nxt;
      nxt = next_ping(prev);
    }
    _pings = [ prev, nxt ];
  }

  // grow _pings as needed until we have a ping after time
  while (_pings[_pings.length - 1] <= time) {
    _pings.push(next_ping(_pings[_pings.length - 1]));
  }

  /**
   *  @returns {bool} true if e is not before time
   *  @param {unixtime} e
   */
  var time_or_later = function(e) { return e >= time; };

  // the index of the ping before the first ping later than time
  return _pings.findIndex(time_or_later) - 1;
};

/**
 * @param {unixtime} time - point in time after epoch
 * @return {pingtime} The ping that preceded time
 */
exports.prev = function(time) { return _pings[prev_ping_index(time)]; };

/**
 * @param {unixtime} time - reference point in time
 * @returns {pingtime} the ping that follows time
 */
exports.next = function(time) {
  var idx = prev_ping_index(time) + 1;
  // if time was a ping, then next(prev(ping)) == ping, which isn't what we want
  if (_pings[idx] == time) {
    idx += 1;
  }
  return _pings[idx];
};
