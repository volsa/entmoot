# Guidelines

Guidelines for agents working in this project, which MUST be followed.

## Conversation

- Keep your responses short, unless asked to be more specific
- Avoid mannered prose, writing natural flowing sentences.
- End each response with a TL;DR of at most 5 sentences, fewer being better

## Code

- Make code self-explanatory, choosing the simplest approach
- Avoid any abstraction unless it is absolutely necessary or explicitly requested
- Group related statements, separating each group from the next with a blank line
- Never widen the scope of a change beyond what was asked
- Read files in full before making any edits

## Comments

Code being self-explanatory, comments are avoided except in these three cases:

1. Module Overview: summarizes the file in technical English without being overly specific, leaving details
   in the code.
2. Step Header: names in a short phrase what a group of statements does. Consecutive statements that form no
   natural group take one shared header naming their common purpose, rather than a header each or none at all.
3. Inline Note: trails a line whose intent cannot be read off the code itself.

```ts
/**
 * (1: Module Overview) Retries transient provider failures with exponential backoff, so that a single
 * rate limit does not fail an entire review run.
 */

export async function withRetry<T>(call: () => Promise<T>): Promise<T> {
    // (2: Step Header) One attempt, abandoned on a permanent failure or on the last try
    for (let attempt = 0; ; attempt++) {
        try {
            return await call();
        } catch (error) {
            if (!isTransient(error) || attempt === MAX_ATTEMPTS - 1) throw error;
        }

        // (2: Step Header) Full-jitter backoff before the next attempt
        const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
        const delay = Math.random() * ceiling;   // (3: Inline Note) spreads concurrent agents apart
        await sleep(delay);
    }
}
```

A comment is prose, so the rules under Conversation apply to it.