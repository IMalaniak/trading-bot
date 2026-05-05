export type WaitCondition = () => Promise<boolean> | boolean;

export const waitForCondition = async (
  condition: WaitCondition,
  timeoutMs: number,
  errorMessage: string,
  intervalMs = 100,
): Promise<void> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(errorMessage);
};
