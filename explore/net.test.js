/**
 * Request budget checks — a stalled proxy call must give up, retry once, and report it
 * rather than holding a batch open.
 * Run: node explore/net.test.js
 */
import { budgetedSignal, timeoutError } from './net.js';
import { searchBooks } from './book-search.js';
import { lookupIsbn } from './book-lookup.js';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── budgetedSignal ── */

const timedOut = budgetedSignal(undefined, 20);
await wait(60);
assert(timedOut.signal.aborted, 'the budget aborts the request');
assert(timedOut.timedOut === true, 'a spent budget is reported as a timeout');
timedOut.release();

const outer = new AbortController();
const relayed = budgetedSignal(outer.signal, 5000);
outer.abort();
assert(relayed.signal.aborted, "a caller's abort is relayed");
assert(relayed.timedOut === false, 'a caller cancelling is not a timeout');
relayed.release();

const released = budgetedSignal(undefined, 20);
released.release();
await wait(60);
assert(!released.signal.aborted, 'a released budget cannot abort later');

const already = new AbortController();
already.abort();
const late = budgetedSignal(already.signal, 5000);
assert(late.signal.aborted, 'an already-cancelled caller aborts immediately');
late.release();

assert(timeoutError(9000, 'Search').name === 'TimeoutError', 'timeouts are named for the caller to spot');

/* ── searchBooks and lookupIsbn give up on a stalled proxy ── */

const realFetch = globalThis.fetch;
let attempts = 0;
globalThis.fetch = (_url, init) => {
  attempts += 1;
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    }, { once: true });
  });
};

try {
  const started = Date.now();
  const search = await searchBooks(`stalled query ${Date.now()}`, { timeoutMs: 120, tries: 2 });
  const elapsed = Date.now() - started;
  assert(attempts === 2, `a stalled search is tried twice, not ${attempts}`);
  assert(search.timedOut === true, 'the caller is told the search timed out');
  assert(search.results.length === 0, 'a timed-out search returns no results');
  assert(elapsed < 2000, `a stalled search gives up quickly, took ${elapsed}ms`);

  attempts = 0;
  const found = await lookupIsbn('9780306406157', { timeoutMs: 120, tries: 2 });
  assert(attempts === 2, `a stalled lookup is tried twice, not ${attempts}`);
  assert(found.kind === 'network' && found.timedOut === true, 'a stalled lookup reports a timeout');
  assert(found.book === null, 'a stalled lookup has no book');

  // A stall must not be remembered as an answer.
  attempts = 0;
  await lookupIsbn('9780306406157', { timeoutMs: 120, tries: 1 });
  assert(attempts === 1, 'a timed-out lookup is not cached');
} finally {
  globalThis.fetch = realFetch;
}

console.log('net.js checks passed');
