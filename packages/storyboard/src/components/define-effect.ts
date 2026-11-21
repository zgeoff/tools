import type { EffectDefinition, Host, HostNode, StoryNode, TimedProps } from '../types.ts';
import { SceneError } from '../utils/scene-error.ts';

export function defineEffect<P, M>(
  definition: EffectDefinition<P, M> & { host: (props: never) => Host<M> },
): (props: TimedProps<P & { on: Host<M> }>) => StoryNode;

export function defineEffect<P>(
  definition: EffectDefinition<P, never>,
): (props: TimedProps<P>) => StoryNode;

// An effect is one part of a change. Its `need` runs before any time exists, and its `render` or
// the host it writes to runs with the times.
export function defineEffect<P, M>(
  definition: EffectDefinition<P, M>,
): (props: TimedProps<P> & { on?: unknown }) => StoryNode {
  return (props) => {
    const host = pickHost(definition, props.on);
    const children: unknown = Reflect.get(props, 'children');

    return {
      node: 'effect',
      name: definition.name,
      label: `<${definition.name}>${typeof children === 'string' ? ` "${children}"` : ''}`,
      timing: { id: props.id, after: props.after, at: props.at },
      host,
      getNeed: () => definition.need(props),
      deliverAt(session, at) {
        if (host !== undefined && definition.deliver !== undefined) {
          host.deliverTo(session, { at, payload: definition.deliver(props) });
        }
      },
      renderPlaced: (placed, time) => definition.render?.(props, placed, time) ?? null,
    };
  };
}

function pickHost<P, M>(
  definition: EffectDefinition<P, M>,
  on: unknown,
): HostNode<unknown> | undefined {
  if (definition.host === undefined) {
    return undefined;
  }

  if (!isHostNode(on)) {
    throw new SceneError('bad-component', `<${definition.name}> takes a host in its on prop`);
  }

  return on;
}

function isHostNode(value: unknown): value is HostNode<unknown> {
  return typeof value === 'object' && value !== null && 'node' in value && value.node === 'host';
}
