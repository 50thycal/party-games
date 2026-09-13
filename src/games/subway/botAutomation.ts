export function recoverableBotError(error:unknown):boolean {
  return error instanceof TypeError || (error instanceof Error &&
    /table changed|waiting for a human company|wait for the current action|failed to fetch|network|load failed/i.test(error.message));
}
