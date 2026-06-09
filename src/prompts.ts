import { ExitPromptError } from "@inquirer/core";

/** Returned by the prompt helpers when the user aborts (Esc / Ctrl-C). */
export const CANCELLED = Symbol("prompt-cancelled");

/**
 * Await an @inquirer prompt and translate an Esc/Ctrl-C abort into the
 * CANCELLED sentinel instead of a thrown ExitPromptError. Lets callers write:
 *
 *   const choice = await orCancel(select({ ... }));
 *   if (choice === CANCELLED) return;   // narrows `choice` to its value type
 */
export async function orCancel<T>(prompt: Promise<T>): Promise<T | typeof CANCELLED> {
  try {
    return await prompt;
  } catch (err) {
    if (err instanceof ExitPromptError) return CANCELLED;
    throw err;
  }
}
