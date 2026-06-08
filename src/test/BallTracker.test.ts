/**
 * BallTracker unit tests.
 *
 * Tests core ball tracking operations:
 * - acquire + get
 * - hold (only current holder can hold)
 * - hold conflict (deadlock detection)
 * - release
 * - transfer (from → to validation)
 * - transfer conflict detection
 * - isHolder check
 * - listAll
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ballTracker } from '../a2a/BallTracker.js';
import { createThreadId, createUserId } from '../types/thread.js';
import { createDogId } from '../types/ids.js';

const THREAD_1 = createThreadId('thread-test-1');
const THREAD_2 = createThreadId('thread-test-2');
const COLLIE = createDogId('collie');
const GSD = createDogId('gsd');
const CORGI = createDogId('corgi');

describe('BallTracker', () => {
  beforeEach(() => {
    // Reset all ball states by releasing every known thread
    ballTracker.release(THREAD_1);
    ballTracker.release(THREAD_2);
  });

  it('should acquire ball for a dog', () => {
    const state = ballTracker.acquire(THREAD_1, COLLIE, 'user mentioned collie');
    assert.equal(state.holder, COLLIE);
    assert.equal(state.reason, 'user mentioned collie');
  });

  it('should get ball state for a thread', () => {
    ballTracker.acquire(THREAD_1, COLLIE, 'test');
    const state = ballTracker.get(THREAD_1);
    assert.ok(state);
    assert.equal(state!.holder, COLLIE);
  });

  it('should return null for thread with no ball held', () => {
    assert.equal(ballTracker.get(THREAD_1), null);
  });

  it('should allow current holder to hold ball', () => {
    ballTracker.acquire(THREAD_1, COLLIE, 'invoked');
    const state = ballTracker.hold(THREAD_1, COLLIE, 'waiting for CI', 'check result', 60000);
    assert.equal(state.holder, COLLIE);
    assert.equal(state.reason, 'waiting for CI');
    assert.equal(state.nextStep, 'check result');
    assert.equal(state.wakeAfterMs, 60000);
  });

  it('should reject hold from non-holder (deadlock detection)', () => {
    ballTracker.acquire(THREAD_1, COLLIE, 'collie has ball');
    assert.throws(
      () => ballTracker.hold(THREAD_1, GSD, 'gsd tries to hold', 'fail', 60000),
      /Ball deadlock/,
    );
  });

  it('should release ball (drop to ground)', () => {
    ballTracker.acquire(THREAD_1, COLLIE, 'test');
    ballTracker.release(THREAD_1);
    assert.equal(ballTracker.get(THREAD_1), null);
  });

  it('should transfer ball between dogs', () => {
    ballTracker.acquire(THREAD_1, COLLIE, 'collie starts');
    const state = ballTracker.transfer(THREAD_1, COLLIE, GSD, 'collie passed to gsd');
    assert.equal(state.holder, GSD);
    assert.equal(state.reason, 'collie passed to gsd');
  });

  it('should reject transfer from non-holder', () => {
    ballTracker.acquire(THREAD_1, COLLIE, 'collie has ball');
    assert.throws(
      () => ballTracker.transfer(THREAD_1, GSD, CORGI, 'gsd tries to transfer'),
      /Ball transfer conflict/,
    );
  });

  it('should check isHolder correctly', () => {
    ballTracker.acquire(THREAD_1, COLLIE, 'test');
    assert.equal(ballTracker.isHolder(THREAD_1, COLLIE), true);
    assert.equal(ballTracker.isHolder(THREAD_1, GSD), false);
  });

  it('should list all active ball states', () => {
    ballTracker.acquire(THREAD_1, COLLIE, 'thread 1');
    ballTracker.acquire(THREAD_2, GSD, 'thread 2');
    const all = ballTracker.listAll();
    assert.equal(all.length, 2);
  });
});