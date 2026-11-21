/* @jsxImportSource @zgeoff/storyboard */
// oxlint-disable unicorn/no-array-callback-reference -- find looks up a reference, and is no array method
import { expect, test } from 'bun:test';
import { buildSceneKit } from '../components/build-scene-kit.ts';
import { defineTokens } from '../tokens/define-tokens.ts';
import { buildTimeline } from './build-timeline.ts';

function setupTest() {
  const kit = buildSceneKit(defineTokens({}));
  const Stage = kit.Stage;
  const Beat = kit.Beat;
  const Line = kit.Line;
  const Type = kit.Type;
  const Status = kit.Status;
  const Flight = kit.Flight;
  const Pulse = kit.Pulse;
  const Cursor = kit.Cursor;
  const buildTerminal = kit.buildTerminal;

  const orchestrator = buildTerminal({
    title: 'orchestrator',
    box: { x: 24, y: 400, width: 300 },
    status: 'ready',
  });

  const builderUI = buildTerminal({
    title: 'builder-ui',
    box: { x: 470, y: 448, width: 274 },
    opens: 'spawnLanded',
  });

  const builderAPI = buildTerminal({
    title: 'builder-api',
    box: { x: 724, y: 132, width: 256 },
    lines: ['› /orders API'],
  });

  const ask = '/orders shape?';
  const answer = '[{ id, total }]';

  const root = (
    <>
      {orchestrator}
      {builderUI}
      {builderAPI}
      <Stage caption="You ask for an orders page.">
        <Type id="prompt" on={orchestrator} typing={{ steps: 3 }} sends={{ steps: 4 }}>
          build the orders page on a sprite
        </Type>
        <Status on={orchestrator} at="prompt.sent">
          thinking
        </Status>
        <Beat id="working">
          <Line on={orchestrator}>On it.</Line>
          <Status on={orchestrator} tone="teal">
            working
          </Status>
        </Beat>
      </Stage>
      <Stage caption="It spawns a builder.">
        <Line id="spawnLanded" on={orchestrator}>
          spawned
        </Line>
      </Stage>
      <Stage caption="Agents talk to each other.">
        <Beat id="ask">
          <Line on={builderUI} head="→ builder-api: " tone="blue">
            {ask}
          </Line>
          <Status on={builderUI} tone="blue">
            asking
          </Status>
        </Beat>
        <Beat id="askLanded">
          <Flight from={builderUI} to={builderAPI} tone="blue" />
          <Line on={builderAPI} head="← builder-ui: " tone="blue">
            {ask}
          </Line>
          <Status on={builderAPI}>thinking</Status>
        </Beat>
        <Line id="answer" on={builderAPI} head="→ builder-ui: " tone="blue">
          {answer}
        </Line>
        <Beat id="answered">
          <Flight from={builderAPI} to={builderUI} tone="blue" />
          <Line on={builderUI} head="← builder-api: " tone="blue">
            {answer}
          </Line>
        </Beat>
      </Stage>
    </>
  );

  const host = kit.buildTerminal({ title: 'host', box: { x: 10, y: 10, width: 200 } });

  return {
    findTime: (reference: string) => buildTimeline(root, 6).find(reference),
    Stage,
    Beat,
    Line,
    Status,
    Pulse,
    Cursor,
    host,
    longText: Array.from({ length: 30 }, () => 'word').join(' '),
    stops: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
    buildAt: (tree: Parameters<typeof buildTimeline>[0], stageS: number) =>
      buildTimeline(tree, stageS),
  };
}

test.each([
  ['prompt', 0.5],
  ['prompt.typed', 2],
  ['prompt.sent', 2.5],
  ['working', 3],
  ['ask', 12.5],
  ['askLanded', 13.5],
  ['answer', 14.5],
  ['answered', 15.5],
])('#buildTimeline places the hero change %s at %f s', (reference, seconds) => {
  const ctx = setupTest();

  expect(ctx.findTime(reference)).toBe(seconds);
});

test('#buildTimeline fails a change that lands outside its stage window and names the smallest stageS', () => {
  const ctx = setupTest();

  const root = (
    <>
      {ctx.host}
      <ctx.Stage caption="One.">
        <ctx.Cursor
          from={{ x: 0, y: 0 }}
          target={{ x: 5, y: 5 }}
          glide={{ steps: 20 }}
          leaves="start"
        />
      </ctx.Stage>
    </>
  );

  expect(() => ctx.buildAt(root, 6)).toThrow(expect.objectContaining({ code: 'outside-window' }));
});

test('#buildTimeline fails a reading that runs past the end of its stage', () => {
  const ctx = setupTest();

  const root = (
    <>
      {ctx.host}
      <ctx.Stage caption="One.">
        <ctx.Line on={ctx.host}>{ctx.longText}</ctx.Line>
      </ctx.Stage>
    </>
  );

  expect(() => ctx.buildAt(root, 6)).toThrow(expect.objectContaining({ code: 'reading-too-long' }));
});

test('#buildTimeline fails a reference that matches no change, mark or built-in instant', () => {
  const ctx = setupTest();

  const root = (
    <>
      {ctx.host}
      <ctx.Stage caption="One.">
        <ctx.Status on={ctx.host} at="nothing">
          ready
        </ctx.Status>
      </ctx.Stage>
    </>
  );

  expect(() => ctx.buildAt(root, 6)).toThrow(
    expect.objectContaining({ code: 'unknown-reference' }),
  );
});

test('#buildTimeline fails an after that names a change below it', () => {
  const ctx = setupTest();

  const root = (
    <>
      {ctx.host}
      <ctx.Stage caption="One.">
        <ctx.Line on={ctx.host} after={{ change: 'later', steps: 1 }}>
          first
        </ctx.Line>
        <ctx.Line id="later" on={ctx.host}>
          second
        </ctx.Line>
      </ctx.Stage>
    </>
  );

  expect(() => ctx.buildAt(root, 12)).toThrow(expect.objectContaining({ code: 'after-below' }));
});

test('#buildTimeline fails two changes that share an id', () => {
  const ctx = setupTest();

  const root = (
    <>
      {ctx.host}
      <ctx.Stage caption="One.">
        <ctx.Line id="same" on={ctx.host}>
          first
        </ctx.Line>
        <ctx.Line id="same" on={ctx.host}>
          second
        </ctx.Line>
      </ctx.Stage>
    </>
  );

  expect(() => ctx.buildAt(root, 12)).toThrow(expect.objectContaining({ code: 'duplicate-id' }));
});

test('#buildTimeline fails a change that takes the name of a built-in instant', () => {
  const ctx = setupTest();

  const root = (
    <>
      {ctx.host}
      <ctx.Stage caption="One.">
        <ctx.Line id="reset" on={ctx.host}>
          first
        </ctx.Line>
      </ctx.Stage>
    </>
  );

  expect(() => ctx.buildAt(root, 12)).toThrow(expect.objectContaining({ code: 'reserved-id' }));
});

test('#buildTimeline fails a change that has two marks of one name', () => {
  const ctx = setupTest();

  const root = (
    <>
      {ctx.host}
      <ctx.Stage caption="One.">
        <ctx.Beat id="both">
          <ctx.Pulse stops={ctx.stops} tone="teal" />
          <ctx.Pulse stops={ctx.stops} tone="blue" />
        </ctx.Beat>
      </ctx.Stage>
    </>
  );

  expect(() => ctx.buildAt(root, 12)).toThrow(expect.objectContaining({ code: 'duplicate-mark' }));
});

test('#buildTimeline fails a part with at that sits below a later change', () => {
  const ctx = setupTest();

  const root = (
    <>
      {ctx.host}
      <ctx.Stage caption="One.">
        <ctx.Line id="first" on={ctx.host}>
          first
        </ctx.Line>
        <ctx.Line id="second" on={ctx.host}>
          second
        </ctx.Line>
        <ctx.Status on={ctx.host} at="first">
          {ctx.longText}
        </ctx.Status>
      </ctx.Stage>
    </>
  );

  expect(() => ctx.buildAt(root, 30)).toThrow(expect.objectContaining({ code: 'at-below-change' }));
});

test('#buildTimeline fails an effect that sits outside every stage', () => {
  const ctx = setupTest();

  const root = (
    <>
      {ctx.host}
      <ctx.Line on={ctx.host}>loose</ctx.Line>
    </>
  );

  expect(() => ctx.buildAt(root, 6)).toThrow(
    expect.objectContaining({ code: 'effect-outside-stage' }),
  );
});

test('#buildTimeline fails a stage that sits inside another', () => {
  const ctx = setupTest();

  const root = (
    <>
      {ctx.host}
      <ctx.Stage caption="Outer.">
        <ctx.Stage caption="Inner.">
          <ctx.Line on={ctx.host}>x</ctx.Line>
        </ctx.Stage>
      </ctx.Stage>
    </>
  );

  expect(() => ctx.buildAt(root, 6)).toThrow(expect.objectContaining({ code: 'nested-stage' }));
});
