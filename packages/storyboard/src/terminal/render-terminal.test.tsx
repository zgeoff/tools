/* @jsxImportSource @zgeoff/storyboard */
import { expect, test } from 'bun:test';
import { buildSceneKit } from '../components/build-scene-kit.ts';
import { defineScene } from '../render/define-scene.ts';
import { renderSceneFiles } from '../render/render-scene-files.ts';
import { defineTokens } from '../tokens/define-tokens.ts';

interface StatusOptions {
  readonly flash?: boolean;
}

interface SceneOptions {
  readonly lateStatus?: boolean;
  readonly alertUntilReset?: boolean;
  readonly typed?: boolean;
}

function setupTest() {
  const kit = buildSceneKit(defineTokens({}));
  const Stage = kit.Stage;
  const Line = kit.Line;
  const Status = kit.Status;
  const Beat = kit.Beat;
  const Type = kit.Type;
  const Alert = kit.Alert;
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

  const renderScene = (options: SceneOptions): string => {
    const scene = defineScene({
      out: 'docs/assets/demo',
      stageS: 6,
      card: { width: 800, height: 300, cornerRadius: 8 },
      description: 'A demo scene.',
      render: () => (
        <>
          {host}
          <Stage caption="One.">
            <Line on={host}>first</Line>
            {options.typed === true ? (
              <Type on={host} typing={{ steps: 2 }} sends={{ steps: 3 }}>
                go
              </Type>
            ) : null}
            {options.lateStatus === true ? (
              <Status on={host} tone="green" after={{ change: 'start', steps: 8 }}>
                late
              </Status>
            ) : null}
            {options.alertUntilReset === true ? (
              <Alert on={host} tone="amber" until="reset" />
            ) : null}
          </Stage>
        </>
      ),
    });

    return renderSceneFiles(scene, 'demo').dark;
  };

  return { render, renderScene };
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

test('#renderTerminal cuts a flash that would run past the reset off at the reset', () => {
  const ctx = setupTest();

  expect(() => ctx.renderScene({ lateStatus: true })).not.toThrow();
});

test('#renderTerminal holds an alert that lasts until the reset up to the reset', () => {
  const ctx = setupTest();

  expect(() => ctx.renderScene({ alertUntilReset: true })).not.toThrow();
});

test('#renderTerminal shows the prompt of a typed row only once its row enters', () => {
  const ctx = setupTest();
  const svg = ctx.renderScene({ typed: true });

  expect(svg).toMatch(/<text x="34" y="\d+" class="sb-caret" fill="[^"]+" opacity="0">/u);
});
