import { onTestFinished } from 'bun:test';

export interface StubFileResponse {
  readonly status: number;

  readonly body: string | Uint8Array;
}

export interface StubFileServer {
  readonly url: string;

  // The path of each request, in the order the server got them.
  readonly requests: readonly string[];
}

// Serves each path the responses listed for it, in order, then its last response again, and 404
// for a path it does not list. The test's cleanup stops the server.
export function createStubFileServer(
  responses: Readonly<Record<string, readonly StubFileResponse[]>>,
): StubFileServer {
  const requests: string[] = [];

  const answerRequest = (request: Request) => {
    const path = new URL(request.url).pathname;

    const listed = responses[path] ?? [];
    const count = requests.filter((requested) => requested === path).length;
    const response = listed[Math.min(count, listed.length - 1)] ?? { status: 404, body: '' };

    requests.push(path);

    return new Response(response.body, { status: response.status });
  };

  const server = Bun.serve({ port: 0, fetch: answerRequest });

  onTestFinished(() => server.stop(true));

  return { url: `http://localhost:${server.port}`, requests };
}
