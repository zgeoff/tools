import { buildIDReference } from '../components/build-id-reference.ts';
import { defineEffect } from '../components/define-effect.ts';
import { defineHost } from '../components/define-host.ts';
import type { Host, Steps, StoryNode, TerminalMail, TimedProps, TokenReference } from '../types.ts';
import { countReadingWords } from '../utils/count-reading-words.ts';
import { renderTerminal } from './render-terminal.ts';
import type { TerminalProps } from './terminal-context.ts';

export interface TerminalParts {
  readonly buildTerminal: (props: TerminalProps) => Host<TerminalMail>;
  readonly Line: (
    props: TimedProps<{
      on: Host<TerminalMail>;
      head?: string;
      tone?: string;
      children: string;
    }>,
  ) => StoryNode;
  readonly Type: (
    props: TimedProps<{ on: Host<TerminalMail>; typing: Steps; sends: Steps; children: string }>,
  ) => StoryNode;
  readonly Status: (
    props: TimedProps<{
      on: Host<TerminalMail>;
      tone?: string;
      read?: boolean;
      flash?: boolean;
      children: string;
    }>,
  ) => StoryNode;
  readonly Alert: (
    props: TimedProps<{ on: Host<TerminalMail>; tone: string; until: string }>,
  ) => StoryNode;
}

const STEP_S = 0.5;

// The terminal and the parts that write to it, built with defineHost and defineEffect like any
// part a scene defines for itself.
export function makeTerminalParts(color: (name: string) => TokenReference): TerminalParts {
  const helpers = {
    color,
    id: (name: string) => buildIDReference(name, false),
    url: (name: string) => buildIDReference(name, true),
  };

  const buildTerminal = defineHost<TerminalProps, TerminalMail>({
    name: 'Terminal',
    render: (props, deliveries, time) => renderTerminal(props, deliveries, time, helpers),
    anchor: (props) => ({ x: props.box.x + props.box.width / 2, y: props.box.y + 14 }),
  });

  const Line = defineEffect<{ head?: string; tone?: string; children: string }, TerminalMail>({
    name: 'Line',
    host: buildTerminal,
    need: (props) => ({ words: countReadingWords(props.children) }),
    deliver: (props) => ({
      form: 'line',
      head: props.head ?? '',
      text: props.children,
      tone: props.tone,
    }),
  });

  const Type = defineEffect<{ typing: Steps; sends: Steps; children: string }, TerminalMail>({
    name: 'Type',
    host: buildTerminal,
    need: (props) => ({
      words: countReadingWords(props.children),
      marks: { typed: props.typing.steps * STEP_S, sent: props.sends.steps * STEP_S },
    }),
    deliver: (props) => ({
      form: 'type',
      text: props.children,
      typingS: props.typing.steps * STEP_S,
      sendsS: props.sends.steps * STEP_S,
    }),
  });

  const Status = defineEffect<
    { tone?: string; read?: boolean; flash?: boolean; children: string },
    TerminalMail
  >({
    name: 'Status',
    host: buildTerminal,
    need: (props) => ({ words: props.read === true ? countReadingWords(props.children) : 0 }),

    // A status in the green tone flashes the frame, unless it says otherwise.
    deliver: (props) => ({
      form: 'status',
      text: props.children,
      tone: props.tone,
      flash: props.flash ?? props.tone === 'green',
    }),
  });

  const Alert = defineEffect<{ tone: string; until: string }, TerminalMail>({
    name: 'Alert',
    host: buildTerminal,
    need: () => ({}),
    deliver: (props) => ({ form: 'alert', tone: props.tone, until: props.until }),
  });

  return { buildTerminal, Line, Type, Status, Alert };
}
