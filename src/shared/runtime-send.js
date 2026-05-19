const RECEIVING_END_RE = /receiving end does not exist/i;

function isReceivingEndError(err) {
  if (!err) return false;
  const msg = String(err.message || err);
  if (RECEIVING_END_RE.test(msg)) return true;
  try {
    const last = chrome.runtime.lastError;
    if (last?.message && RECEIVING_END_RE.test(last.message)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {object} message
 * @param {{ retries?: number, delayMs?: number }} [opts]
 */
export async function runtimeSend(message, opts = {}) {
  const retries = opts.retries ?? 3;
  const delayMs = opts.delayMs ?? 100;
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (err) {
      lastErr = err;
      if (!isReceivingEndError(err) || attempt >= retries) throw err;
      await sleep(delayMs * (attempt + 1));
    }
  }

  throw lastErr;
}
