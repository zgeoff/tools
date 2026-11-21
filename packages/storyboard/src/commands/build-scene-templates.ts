export interface SceneTemplates {
  readonly tokens: string;
  readonly kit: string;
  readonly scene: string;
}

export const UNIT_SUITE = `import { describeSceneChecks } from '@zgeoff/storyboard/checks';

describeSceneChecks(import.meta.dir);
`;

export const BROWSER_SUITE = `import { describeFrameChecks } from '@zgeoff/storyboard/browser';

describeFrameChecks(import.meta.dir);
`;

// The files of a new scene: two terminals, a prompt that is typed and sent, and a flight between
// them. The scene builds and passes both suites as it stands.
export function buildSceneTemplates(sceneName: string): SceneTemplates {
  return {
    tokens: `import { defineTokens } from '@zgeoff/storyboard';

export default defineTokens({
  sky: '#151b33',
});
`,
    kit: `import { buildSceneKit } from '@zgeoff/storyboard';
import tokens from './tokens.ts';

export const {
  Stage,
  Beat,
  buildTerminal,
  Line,
  Type,
  Status,
  Alert,
  Flight,
  Pulse,
  Cursor,
  Stamp,
  Def,
  Animate,
  Ambient,
  getColor,
  getID,
  getURL,
  defineHost,
  defineEffect,
} = buildSceneKit(tokens);
`,
    scene: `/** @jsxImportSource @zgeoff/storyboard */
import { defineScene } from '@zgeoff/storyboard';
import { Beat, buildTerminal, Flight, getColor, Line, Stage, Status, Type } from './kit.ts';

const agent = buildTerminal({
  title: 'agent',
  box: { x: 40, y: 130, width: 340 },
  status: 'ready',
});
const helper = buildTerminal({
  title: 'helper',
  box: { x: 440, y: 130, width: 320 },
  status: 'idle',
});

export default defineScene({
  out: 'docs/assets/${sceneName}',
  stageS: 6,
  card: { width: 800, height: 360, cornerRadius: 12 },
  description: 'An animated diagram: you give an agent a task, and it hands part of it to a helper.',
  render: () => (
    <>
      <rect width="800" height="360" fill={getColor('sky')} />
      {agent}
      {helper}

      <Stage caption="You give the agent a task.">
        <Type id="prompt" on={agent} typing={{ steps: 2 }} sends={{ steps: 3 }}>
          write a short summary
        </Type>
        <Status on={agent} at="prompt.sent" tone="amber">
          thinking
        </Status>
        <Beat>
          <Line on={agent}>On it.</Line>
          <Status on={agent} tone="teal">
            working
          </Status>
        </Beat>
      </Stage>

      <Stage caption="It hands part of the work to a helper.">
        <Beat>
          <Flight from={agent} to={helper} tone="blue" />
          <Line on={helper} head="← agent: " tone="blue">
            summarise the notes
          </Line>
          <Status on={helper} tone="blue">
            working
          </Status>
        </Beat>
        <Line on={agent} head="→ helper: " tone="blue">
          summarise the notes
        </Line>
      </Stage>
    </>
  ),
});
`,
  };
}
