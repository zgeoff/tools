import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { Element, Node } from 'happy-dom';

interface InspectableNode {
  readonly nodeName: string;
  readonly nodeValue: null | string;
}

const INSPECT_SYMBOL = Symbol.for('nodejs.util.inspect.custom');

export function registerHappyDOM(): void {
  const nativeFetchStack = {
    AbortController: globalThis.AbortController,
    AbortSignal: globalThis.AbortSignal,
    Blob: globalThis.Blob,
    fetch: globalThis.fetch,
    Headers: globalThis.Headers,
    ReadableStream: globalThis.ReadableStream,
    Request: globalThis.Request,
    Response: globalThis.Response,
    TransformStream: globalThis.TransformStream,
    WritableStream: globalThis.WritableStream,
  };

  GlobalRegistrator.register();

  registerCompactNodeInspection();

  // The whole fetch stack must come from one implementation: Bun's ReadableStream.pipeTo rejects
  // happy-dom's WritableStream, and a happy-dom AbortSignal fails Bun's Request constructor check.
  Object.assign(globalThis, nativeFetchStack);
}

// A failed matcher prints the received node through Bun.inspect, whose default walk of a
// happy-dom node's internal graph takes hundreds of milliseconds; the node prints as its opening
// tag instead.
function registerCompactNodeInspection(): void {
  Object.defineProperty(Node.prototype, INSPECT_SYMBOL, {
    configurable: true,
    value(this: InspectableNode): string {
      return formatNode(this);
    },
  });
}

function formatNode(node: InspectableNode): string {
  if (node instanceof Element) {
    let attributes = '';

    for (const attribute of node.attributes) {
      attributes += ` ${attribute.name}="${formatAttributeValue(attribute.value ?? '')}"`;
    }

    return `<${node.localName}${attributes}>`;
  }

  return node.nodeValue === null
    ? node.nodeName
    : `${node.nodeName} ${JSON.stringify(node.nodeValue)}`;
}

function formatAttributeValue(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
}
