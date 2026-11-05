export class GrowthReadInterrupted extends Error {
  constructor(cause) {
    super('The connection or browser was interrupted before a relationship change was dispatched.', {cause});
    this.name = 'GrowthReadInterrupted';
    this.code = 'READ_INTERRUPTED';
  }
}

export function isTransientBrowserError(error) {
  // Locator timeouts and unknown UI are not evidence of a connection failure.
  if (error?.code) return false;
  if (error?.name === 'TimeoutError') return /^page\.(goto|reload|waitForLoadState):/.test(error.message);
  return (
    error?.name === 'TargetClosedError' ||
    /net::ERR_(?:INTERNET_DISCONNECTED|NETWORK_CHANGED|CONNECTION_RESET|CONNECTION_CLOSED|CONNECTION_REFUSED|TIMED_OUT|NAME_NOT_RESOLVED)\b|Target (?:page, context or browser|closed).*closed|Target page, context or browser has been closed|Execution context was destroyed|Cannot find context with specified id/i.test(
      error?.message || ''
    )
  );
}

export async function interruptedRead(browser, error, {allowLogin = false} = {}) {
  if (!isTransientBrowserError(error)) return null;
  if (browser.networkStop) throw browser.networkStop;
  try {
    await browser.guard({allowLogin});
  } catch (guardError) {
    // A failed browser transport may prevent reading its DOM. The replacement
    // browser must pass all account and restriction checks before continuing.
    const internalNetworkError =
      guardError.code === 'unexpected_domain' && browser.page?.url() === 'chrome-error://chromewebdata/' && /net::ERR_/.test(error.message);
    if (!isTransientBrowserError(guardError) && !internalNetworkError) throw guardError;
  }
  return new GrowthReadInterrupted(error);
}
