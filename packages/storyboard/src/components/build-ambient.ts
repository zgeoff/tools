import type { AmbientNode, AmbientProps } from '../types.ts';
import { SceneError } from '../utils/scene-error.ts';

export function buildAmbient(props: AmbientProps): AmbientNode {
  if (!(props.periodS > 0)) {
    throw new SceneError(
      'bad-component',
      `an <Ambient> on "${props.attribute}" needs a period over 0`,
    );
  }

  if (props.keyFractions !== undefined && props.keyFractions.length !== props.values.length) {
    throw new SceneError(
      'bad-component',
      `an <Ambient> on "${props.attribute}" has ${props.values.length} values and ${props.keyFractions.length} keyFractions`,
    );
  }

  return { node: 'ambient', props };
}
