import { z } from 'zod';
import type { ParsedServiceTokenFile } from '../types.ts';

interface ServiceTokenRules<Scope extends string> {
  // Every service token starts with this, so a bearer is routed to the token
  // file or to the database by its first characters.
  readonly prefix: string;
  readonly scopes: readonly Scope[];
}

// None of these messages holds the value it judges, because a value in the
// file may be a token.
const NAME_MESSAGE = 'a client name must match [a-z][a-z0-9-]{0,31}';
const NameSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/u, NAME_MESSAGE);
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const DIGEST_MESSAGE = 'a secret digest must be 64 lowercase hex characters';

export function parseServiceTokenFile<Scope extends string>(
  text: string,
  rules: ServiceTokenRules<Scope>,
): ParsedServiceTokenFile<Scope> {
  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch {
    // The parser's own message quotes the text.
    return { ok: false, reason: 'the file is not valid JSON' };
  }

  const tokenMessage = `a token must be ${rules.prefix} followed by 32 or more of A-Z, a-z, 0-9, _ and -`;

  const tokenPattern = new RegExp(`^${escapePattern(rules.prefix)}[A-Za-z0-9_-]{32,}$`, 'u');

  const ClientSchema = z
    .strictObject({
      scopes: z
        .array(
          z
            .string()
            .refine((scope): scope is Scope => rules.scopes.some((known) => known === scope), {
              message: 'a scope must be one the server knows',
            }),
        )
        .min(1, 'must name at least one scope'),
      tokens: z
        .array(z.string().regex(tokenPattern, tokenMessage))
        .max(2, 'must hold 1 or 2 tokens')
        .default([]),
      secretDigests: z
        .array(z.string().regex(DIGEST_PATTERN, DIGEST_MESSAGE))
        .min(1, 'must hold 1 or 2 secret digests')
        .max(2, 'must hold 1 or 2 secret digests')
        .optional(),
    })
    .refine(
      (client) => client.tokens.length > 0 || client.secretDigests !== undefined,
      'must hold 1 or 2 tokens, or 1 or 2 secret digests',
    );

  const FileSchema = z.strictObject({
    resource: z.string().min(1, 'must be the resource URL the server serves'),
    clients: z
      .record(NameSchema, ClientSchema)
      .refine((clients) => Object.keys(clients).length > 0, 'must name at least one client'),
  });

  const parsed = FileSchema.safeParse(raw);

  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.map((issue) => formatIssue(issue)).join('; ') };
  }

  const clients = Object.entries(parsed.data.clients).map(([name, client]) => {
    const scopes = [...new Set(client.scopes)];

    return client.secretDigests === undefined
      ? { name, scopes, tokens: client.tokens }
      : { name, scopes, tokens: client.tokens, secretDigests: client.secretDigests };
  });

  const tokens = clients.flatMap((client) => client.tokens);

  if (new Set(tokens).size !== tokens.length) {
    return { ok: false, reason: 'the same token appears more than once' };
  }

  const digests = clients.flatMap((client) => client.secretDigests ?? []);

  if (new Set(digests).size !== digests.length) {
    return { ok: false, reason: 'the same secret digest appears more than once' };
  }

  return { ok: true, file: { resource: parsed.data.resource, clients } };
}

function escapePattern(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function formatIssue(issue: z.core.$ZodIssue): string {
  // A rejected key may be a misplaced token, so the message leaves it out.
  if (issue.code === 'unrecognized_keys') {
    return `${formatPath(issue.path)}has a field the file does not take`;
  }

  if (issue.code === 'invalid_key') {
    return NAME_MESSAGE;
  }

  return `${formatPath(issue.path)}${issue.message}`;
}

function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return 'the file: ';
  }

  const text = path
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : `.${String(segment)}`))
    .join('');

  return `${text.replace(/^\./u, '')}: `;
}
