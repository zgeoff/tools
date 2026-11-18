import { isRecord } from './is-record.ts';

const concurrency = 8;

// One request per package name: the packument holds the publish time of every version. The map
// goes from a package name to its versions' publish times, as epoch milliseconds.
export async function readPublishTimes(
  names: readonly string[],
): Promise<Map<string, Map<string, number>>> {
  const times = new Map<string, Map<string, number>>();

  const queue = [...names];

  const work = async (): Promise<void> => {
    for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
      const packageTimes = await readPackageTimes(name);

      times.set(name, packageTimes);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, work));

  return times;
}

const registryURL = 'https://registry.npmjs.org/';

async function readPackageTimes(name: string): Promise<Map<string, number>> {
  const url = `${registryURL}${name.replace('/', '%2f')}`;
  let body: unknown;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`answered ${response.status}`);
    }

    body = await response.json();
  } catch (error) {
    throw new Error(
      `could not read the publish times of ${name} from ${url}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const time = isRecord(body) ? body['time'] : undefined;

  if (!isRecord(time)) {
    throw new TypeError(`the registry document for ${name} has no time map`);
  }

  return new Map(
    Object.entries(time).flatMap(([version, stamp]) =>
      typeof stamp === 'string' && !Number.isNaN(Date.parse(stamp))
        ? [[version, Date.parse(stamp)] as const]
        : [],
    ),
  );
}
