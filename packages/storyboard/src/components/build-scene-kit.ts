import { makeTerminalParts } from '../terminal/make-terminal-parts.ts';
import type { BaseTokenName, SceneKit, Tokens } from '../types.ts';
import { buildAmbient } from './build-ambient.ts';
import { buildAnimate } from './build-animate.ts';
import { buildBeat } from './build-beat.ts';
import { buildDef } from './build-def.ts';
import { buildIDReference } from './build-id-reference.ts';
import { buildStage } from './build-stage.ts';
import { buildTokenReference } from './build-token-reference.ts';
import { defineEffect } from './define-effect.ts';
import { defineHost } from './define-host.ts';
import { makeDrawingParts } from './make-drawing-parts.ts';

// Builds every component of one scene, typed by the scene's token names.
export function buildSceneKit<K extends string>(tokens: Tokens<K>): SceneKit<K | BaseTokenName> {
  const color = (name: string) => buildTokenReference(tokens.values, name);
  const terminalParts = makeTerminalParts(color);
  const drawingParts = makeDrawingParts(color);

  return {
    Stage: (props) => buildStage(tokens.values, props),
    Beat: buildBeat,
    ...terminalParts,
    ...drawingParts,
    Def: buildDef,
    Animate: buildAnimate,
    Ambient: buildAmbient,
    getColor: color,
    getID: (name) => buildIDReference(name, false),
    getURL: (name) => buildIDReference(name, true),
    defineHost,
    defineEffect,
  };
}
