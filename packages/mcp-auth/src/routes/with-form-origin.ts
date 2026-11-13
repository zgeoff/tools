import type { Requester } from '../types.ts';
import { buildPageResponse } from '../utils/build-page-response.ts';

type Route = (request: Request, requester: Requester) => Promise<Response>;

// A form posts from the server's own pages, so a post with no Origin header or
// another one is a forged form.
export function withFormOrigin(origin: string, route: Route): Route {
  return (request, requester) => {
    if (request.method === 'POST' && request.headers.get('origin') !== origin) {
      return Promise.resolve(
        buildPageResponse(403, { message: 'The form came from an unexpected origin.' }),
      );
    }

    return route(request, requester);
  };
}
