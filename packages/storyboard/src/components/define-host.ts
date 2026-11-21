import type { Delivery, Host, HostDefinition, Session } from '../types.ts';

// Makes a function that makes a host. Each handle it returns keeps its own mail for each build.
export function defineHost<P, M>(definition: HostDefinition<P, M>): (props: P) => Host<M> {
  return (props) => {
    const mailboxes = new WeakMap<Session, Delivery<M>[]>();

    return {
      node: 'host',
      kind: { name: definition.name },
      deliverTo(session, delivery) {
        const mailbox = mailboxes.get(session) ?? [];

        mailbox.push(delivery);
        mailboxes.set(session, mailbox);
      },
      renderFor(session, time) {
        const mailbox = mailboxes.get(session) ?? [];

        return definition.render(
          props,
          mailbox.toSorted((first, second) => first.at - second.at),
          time,
        );
      },
      findAnchor: () => definition.anchor?.(props),
    };
  };
}
