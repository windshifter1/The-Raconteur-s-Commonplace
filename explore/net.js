/**
 * Request budgets for the book-search proxy. Upstream catalogues sometimes stall on a
 * single query, and one stalled request must not hold a whole batch.
 */

/**
 * Abort when the caller aborts or the budget runs out, whichever lands first, and
 * report which it was. Built by hand so older browsers need no AbortSignal.any.
 * @param {AbortSignal | undefined} external
 * @param {number} timeoutMs
 */
export function budgetedSignal(external, timeoutMs) {
  const ctrl = new AbortController();
  const state = { signal: ctrl.signal, timedOut: false };
  const timer = setTimeout(() => {
    state.timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const relay = () => ctrl.abort();
  if (external) {
    if (external.aborted) ctrl.abort();
    else external.addEventListener('abort', relay, { once: true });
  }
  state.release = () => {
    clearTimeout(timer);
    external?.removeEventListener('abort', relay);
  };
  return state;
}

export function timeoutError(timeoutMs, what = 'Lookup') {
  const err = new Error(`${what} timed out after ${Math.round(timeoutMs / 1000)}s.`);
  err.name = 'TimeoutError';
  return err;
}
