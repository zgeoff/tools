// oxlint-disable zgeoff/file-named-for-export -- one file holds the functions that run in the page
// oxlint-disable unicorn/consistent-function-scoping -- the page runs this function alone, so it cannot reach an outer scope
// oxlint-disable zgeoff/no-abbreviated-names -- src is the DOM's name for an image's address
// The page code runs in Chrome, so it type-checks against the DOM.
/// <reference lib="dom" />

// Each function here runs in the page, so it sees only its argument and the page's globals.

export interface FrameArgument {
  readonly timesS: readonly number[];
}

export interface FrameProblems {
  readonly overlaps: { timeS: number; first: string; second: string }[];
  readonly outside: { timeS: number; text: string }[];
}

export interface LoadArgument {
  readonly svg: string;
}

export interface ShowArgument {
  readonly timeS: number;
  readonly isAmbientRemoved: boolean;
}

export interface CompareArgument {
  readonly first: string;
  readonly second: string;
}

export interface CompareResult {
  readonly differing: number;
  readonly total: number;
}

export function loadSVG(argument: LoadArgument): boolean {
  document.body.style.margin = '0';
  document.body.innerHTML = argument.svg;

  const root = document.querySelector('svg');

  if (root === null) {
    return false;
  }

  root.style.display = 'block';

  root.pauseAnimations();

  return true;
}

export function readPageProblems(argument: FrameArgument): FrameProblems {
  const root = document.querySelector('svg');
  const result: FrameProblems = { overlaps: [], outside: [] };

  if (root === null) {
    return result;
  }

  const view = root.viewBox.baseVal;
  const texts = [...root.querySelectorAll('text')];

  const findClip = (node: Element): DOMRect | null => {
    const reference = /url\(["']?#(?<id>[^"')]+)["']?\)/u.exec(getComputedStyle(node).clipPath);

    const clip =
      reference?.groups?.['id'] === undefined
        ? null
        : root.querySelector(`#${reference.groups['id']}`);

    const shape = clip?.querySelector('rect');
    const matrix = node instanceof SVGGraphicsElement ? node.getScreenCTM() : null;

    if (shape === null || shape === undefined || matrix === null) {
      return null;
    }

    const left = shape.x.animVal.value;
    const top = shape.y.animVal.value;

    const corners = [
      new DOMPoint(left, top),
      new DOMPoint(left + shape.width.animVal.value, top),
      new DOMPoint(left, top + shape.height.animVal.value),
      new DOMPoint(left + shape.width.animVal.value, top + shape.height.animVal.value),
    ].map((corner) => corner.matrixTransform(matrix));

    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);

    return new DOMRect(
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
    );
  };

  const readVisibleBox = (text: SVGTextElement): DOMRect | null => {
    const box = text.getBoundingClientRect();
    let opacity = 1;
    let clipped = false;

    for (let node: Element | null = text; node !== null; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity);

      const clip = findClip(node);

      if (clip !== null) {
        const width = Math.min(box.right, clip.right) - Math.max(box.left, clip.left);
        const height = Math.min(box.bottom, clip.bottom) - Math.max(box.top, clip.top);

        clipped ||= !(width > 0.01 && height > 0.01);
      }
    }

    return opacity > 0.01 && !clipped && box.width > 0 && box.height > 0 ? box : null;
  };

  for (const timeS of argument.timesS) {
    root.setCurrentTime(timeS);

    const visible = texts.flatMap((text) => {
      const box = readVisibleBox(text);

      return box === null ? [] : [{ box, label: (text.textContent ?? '').trim().slice(0, 40) }];
    });

    visible.forEach((first, index) => {
      if (
        first.box.left < view.x - 0.5 ||
        first.box.top < view.y - 0.5 ||
        first.box.right > view.x + view.width + 0.5 ||
        first.box.bottom > view.y + view.height + 0.5
      ) {
        result.outside.push({ timeS, text: first.label });
      }

      for (const second of visible.slice(index + 1)) {
        const width =
          Math.min(first.box.right, second.box.right) - Math.max(first.box.left, second.box.left);

        const height =
          Math.min(first.box.bottom, second.box.bottom) - Math.max(first.box.top, second.box.top);

        if (width > 0 && height > 0 && width * height > 1) {
          result.overlaps.push({ timeS, first: first.label, second: second.label });
        }
      }
    });
  }

  return result;
}

export async function showFrame(argument: ShowArgument): Promise<number> {
  const root = document.querySelector('svg');

  if (root === null) {
    throw new Error('the page holds no <svg>');
  }

  if (argument.isAmbientRemoved) {
    for (const ambient of root.querySelectorAll('[data-ambient]')) {
      ambient.remove();
    }
  }

  root.setCurrentTime(argument.timeS);

  // The screenshot needs a painted frame, and a paused animation paints one only after a tick.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

  return argument.timeS;
}

export async function compareFrames(argument: CompareArgument): Promise<CompareResult> {
  const load = (base64: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();

      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', () => reject(new Error('a frame did not decode')));

      image.src = `data:image/png;base64,${base64}`;
    });

  const [first, second] = await Promise.all([load(argument.first), load(argument.second)]);

  const canvas = document.createElement('canvas');

  canvas.width = first.naturalWidth;
  canvas.height = first.naturalHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (context === null) {
    throw new Error('the page has no canvas');
  }

  context.drawImage(first, 0, 0);

  const firstPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(second, 0, 0);

  const secondPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let differing = 0;

  for (let offset = 0; offset < firstPixels.length; offset += 4) {
    const gap = Math.max(
      Math.abs((firstPixels[offset] ?? 0) - (secondPixels[offset] ?? 0)),
      Math.abs((firstPixels[offset + 1] ?? 0) - (secondPixels[offset + 1] ?? 0)),
      Math.abs((firstPixels[offset + 2] ?? 0) - (secondPixels[offset + 2] ?? 0)),
    );

    if (gap > 25.5) {
      differing += 1;
    }
  }

  return { differing, total: firstPixels.length / 4 };
}
