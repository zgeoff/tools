import { Elysia } from 'elysia';
import type { Access, MCPAuth, MCPAuthRouteName, Requester, SecuritySink } from '../types.ts';
import { findBearerToken } from './find-bearer-token.ts';
import { isBesidePrefix } from './is-beside-prefix.ts';

export interface MCPHTTPAppOptions<Scope extends string, Limits> {
  readonly auth: MCPAuth<Scope, Limits>;

  // The Host header values the app answers to.
  readonly hosts: ReadonlySet<string>;

  // The Origin header values a POST may carry.
  readonly origins: ReadonlySet<string>;
  readonly readRequester: (request: Request) => Requester;
  readonly security: SecuritySink;
  readonly mcp: {
    readonly fetch: (request: Request, access: Access<Scope, Limits>) => Promise<Response>;
  };

  // Paths under this prefix belong to the app. The adapter serves none of
  // them, and checks neither their Host nor their Origin header.
  readonly besidePrefix: string;
}

interface RouteContext {
  readonly request: Request;
}

type RouteMethod = 'get' | 'post';

interface RouteSpec {
  readonly name: MCPAuthRouteName;
  readonly path: (auth: MCPAuth<string, unknown>) => string;
  readonly methods: readonly RouteMethod[];

  // A form page refuses a POST that carries no Origin header.
  readonly isPage: boolean;
}

const ROUTES: readonly RouteSpec[] = [
  {
    name: 'authorize',
    path: (auth) => auth.paths.browser.authorize,
    methods: ['get'],
    isPage: false,
  },
  {
    name: 'login',
    path: (auth) => auth.paths.browser.login,
    methods: ['get', 'post'],
    isPage: true,
  },
  {
    name: 'enroll',
    path: (auth) => auth.paths.browser.enroll,
    methods: ['get', 'post'],
    isPage: true,
  },
  {
    name: 'consent',
    path: (auth) => auth.paths.browser.consent,
    methods: ['get', 'post'],
    isPage: true,
  },
  { name: 'error', path: (auth) => auth.paths.browser.error, methods: ['get'], isPage: false },
  { name: 'token', path: (auth) => auth.paths.machine.token, methods: ['post'], isPage: false },
  { name: 'revoke', path: (auth) => auth.paths.machine.revoke, methods: ['post'], isPage: false },
  {
    name: 'authorizationServerMetadata',
    path: (auth) => auth.paths.machine.authorizationServerMetadata,
    methods: ['get'],
    isPage: false,
  },
  {
    name: 'resourceMetadata',
    path: (auth) => auth.paths.machine.resourceMetadata,
    methods: ['get'],
    isPage: false,
  },
];

export function createMCPHTTPApp<Scope extends string, Limits>(
  options: MCPHTTPAppOptions<Scope, Limits>,
) {
  const auth = options.auth;

  const app = new Elysia();

  const recordRefusal = (
    request: Request,
    kind: 'bad_host' | 'bad_origin',
    reason: string,
  ): void => {
    options.security.record({
      kind,
      outcome: 'rejected',
      reason,
      path: new URL(request.url).pathname,
      requester: options.readRequester(request),
    });
  };

  const isForeignOrigin = (request: Request, isPage: boolean): boolean => {
    if (request.method !== 'POST') {
      return false;
    }

    const origin = request.headers.get('origin');

    return origin === null ? isPage : !options.origins.has(origin);
  };

  const guard = (request: Request, isPage: boolean): Response | null => {
    if (isForeignOrigin(request, isPage)) {
      recordRefusal(request, 'bad_origin', 'origin_not_allowed');

      return new Response(null, { status: 403 });
    }

    return null;
  };

  app.onRequest((context: RouteContext): Response | undefined => {
    const path = new URL(context.request.url).pathname;

    const host = context.request.headers.get('host');

    const isRefused =
      !isBesidePrefix(path, options.besidePrefix) && (host === null || !options.hosts.has(host));

    if (!isRefused) {
      return undefined;
    }

    recordRefusal(context.request, 'bad_host', 'host_not_allowed');

    return new Response(null, { status: 403 });
  });

  for (const spec of ROUTES) {
    const path = spec.path(auth);

    if (isBesidePrefix(path, options.besidePrefix)) {
      continue;
    }

    const answer = (context: RouteContext): Response | Promise<Response> =>
      guard(context.request, spec.isPage) ??
      auth.routes[spec.name](context.request, options.readRequester(context.request));

    if (spec.methods.includes('get')) {
      app.get(path, answer);
    }

    if (spec.methods.includes('post')) {
      app.post(path, answer);
    }
  }

  const metadataURL = `${auth.issuer}${auth.paths.machine.mcpResourceMetadata}`;

  const answerMCP = async (request: Request): Promise<Response> => {
    const refused = guard(request, false);

    if (refused !== null) {
      return refused;
    }

    const authorization = request.headers.get('authorization');
    const token = findBearerToken(authorization);

    if (token === null) {
      const reason = authorization === null ? 'missing' : 'malformed';

      recordBearerRefusal(request, reason);

      return buildChallenge(`Bearer resource_metadata="${metadataURL}"`);
    }

    const access = await auth.verify(token);

    if (access === null) {
      recordBearerRefusal(request, 'invalid_token');

      return buildChallenge(`Bearer error="invalid_token", resource_metadata="${metadataURL}"`);
    }

    return options.mcp.fetch(request, access);
  };

  const recordBearerRefusal = (request: Request, reason: string): void => {
    options.security.record({
      kind: 'bearer',
      outcome: 'rejected',
      reason,
      path: new URL(request.url).pathname,
      requester: options.readRequester(request),
    });
  };

  for (const path of [auth.paths.machine.mcp, auth.paths.machine.root]) {
    if (!isBesidePrefix(path, options.besidePrefix)) {
      app.all(path, (context: RouteContext) => answerMCP(context.request));
    }
  }

  if (!isBesidePrefix(auth.paths.machine.mcpResourceMetadata, options.besidePrefix)) {
    app.get(auth.paths.machine.mcpResourceMetadata, (context: RouteContext) =>
      auth.routes.resourceMetadata(context.request, options.readRequester(context.request)),
    );
  }

  return app;
}

function buildChallenge(challenge: string): Response {
  return new Response(null, { status: 401, headers: { 'www-authenticate': challenge } });
}
