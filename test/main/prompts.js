'use strict';
require('should');
const sinon = require('sinon');

require('./helper');

const prompts = require('../../src/prompts');

describe('Prompts', function() {
  it('should save a ping correctly', function() {
    global.pingFile = {push : sinon.spy()};
    var ping = {
      time : 1234567890,
      tags : [ 'tag1', 'tag2' ],
      comment : 'comment'
    };

    // Note: doesn't test the ipc component, not obvious how to send a message
    // from here to ipcMain. Maybe mock ipcMain?
    prompts.savePing(null, ping);

    global.pingFile.push.calledOnce.should.be.true();
    global.pingFile.push.calledWith(ping).should.be.true();
  });

  describe('should trigger a prompt at the right time', function() {
    // We don't test this end-to-end. Spectron just isn't well
    // suited to it. Instead we have unit tests to check the right
    // looking calls are made at the right time.

    var start, sandbox;

    /**
     * Create the spectron instance
     */
    beforeEach(function() {
      sandbox = sinon.sandbox.create();
      sandbox.useFakeTimers(start);
    });

    /**
     * Clean up the spectron instance
     */
    afterEach(function() { sandbox.restore(); });

    /**
     * Control when pings occur
     */
    before(function() {
      // pings ~= [<now throw(), now+1000, now+3000, now+4000, throw()]
      start = Date.now();

      global.pings = {};
      global.pings.next = sinon.stub().callsFake(function(time) {
        if (time < start) {
          throw("ping.next called with a time before start (" + start +
                "): " + time);
        } else if (time < start + 1000) {
          return start + 1000;
        } else if (time < start + 3000) {
          return start + 3000;
        } else if (time < start + 4000) {
          return start + 4000;
        } else {
          throw("ping.next called with a time after start+4000:" + time);
        }
      });
    });

    it('should not prompt before the first ping', function() {
      var promptsMock = sandbox.mock(prompts);
      var expectation = promptsMock.expects('openPrompt');
      expectation.never();

      prompts.schedulePings();
      sandbox.clock.tick(999);

      promptsMock.verify();
    });

    it('should prompt on the first ping', function() {
      var promptsMock = sandbox.mock(prompts);
      var expectation = promptsMock.expects('openPrompt');
      expectation.once();

      prompts.schedulePings();
      sandbox.clock.tick(1000);

      promptsMock.verify();
    });

    it('should prompt on each ping in the series', function() {
      var openPromptsStub = sandbox.stub(prompts, 'openPrompt');

      prompts.schedulePings();
      sandbox.clock.tick(1000);
      openPromptsStub.callCount.should.equal(1);
      sandbox.clock.tick(1000);
      openPromptsStub.callCount.should.equal(1);
      sandbox.clock.tick(1500);
      openPromptsStub.callCount.should.equal(2);
    });
  });
});