/* @jsxImportSource @zgeoff/storyboard */
import { expect, test } from 'bun:test';
import { buildSceneKit } from '../components/build-scene-kit.ts';
import { defineScene } from '../render/define-scene.ts';
import { renderSceneFiles } from '../render/render-scene-files.ts';
import { defineTokens } from '../tokens/define-tokens.ts';

interface StatusOptions {
  readonly flash?: boolean;
}

function setupTest() {
  const kit = buildSceneKit(defineTokens({}));
  const Stage = kit.Stage;
  const Line = kit.Line;
  const Status = kit.Status;
  const Beat = kit.Beat;
  const host = kit.buildTerminal({ title: 'host', box: { x: 20, y: 100, width: 300 } });
  const other = kit.buildTerminal({ title: 'other', box: { x: 400, y: 100, width: 300 } });

  const render = (status: StatusOptions): string => {
    const scene = defineScene({
      out: 'docs/assets/demo',
      stageS: 6,
      card: { width: 800, height: 300, cornerRadius: 8 },
      description: 'A demo scene.',
      render: () => (
        <>
          {host}
          {other}
          <Stage caption="One.">
            <Line on={host}>first</Line>
            <Line on={other}>other</Line>
            <Beat id="done">
              <Status on={host} tone="green" {...status}>
                cleared
              </Status>
            </Beat>
          </Stage>
        </>
      ),
    });

    return renderSceneFiles(scene, 'demo').dark;
  };

  return { render };
}

test('#renderTerminal sets the first baseline 18 under the title bar', () => {
  const ctx = setupTest();

  expect(ctx.render({})).toInclude('<text x="34" y="143" class="sb-line"');
});

test('#renderTerminal opens a terminal with no lines at one row high', () => {
  const ctx = setupTest();

  expect(ctx.render({})).toInclude('<rect x="20" y="100" width="300" height="78"');
});

test('#renderTerminal draws the three title bar dots in their window colours', () => {
  const ctx = setupTest();
  const svg = ctx.render({});

  expect(svg).toInclude('cx="35" cy="113" r="2.6" fill="#ff7b7b" opacity="0.6"');
  expect(svg).toInclude('cx="44" cy="113" r="2.6" fill="#ffd36b" opacity="0.6"');
  expect(svg).toInclude('cx="53" cy="113" r="2.6" fill="#5fd4b0" opacity="0.6"');
});

test('#renderTerminal pulses the status dot through its fill opacity', () => {
  const ctx = setupTest();
  const svg = ctx.render({});

  expect(svg).toInclude('attributeName="fill-opacity" dur="1.2s"');
  expect(svg).toInclude('values="1;0.35;1"');
});

test('#renderTerminal flashes a green border when a green status lands', () => {
  const ctx = setupTest();

  expect(ctx.render({})).toInclude('stroke="#7ee787" stroke-width="1.8"');
});

test('#renderTerminal draws no border for a green status that turns the flash off', () => {
  const ctx = setupTest();

  expect(ctx.render({ flash: false })).not.toInclude('stroke-width="1.8"');
});
