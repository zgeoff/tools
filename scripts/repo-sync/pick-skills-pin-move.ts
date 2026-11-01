// Each field holds the status of GitHub's compare API for base...head: `ahead` when head descends
// from base, `identical`, `behind`, `diverged`, or empty when the API refused, such as for a commit
// it does not know.
export interface SkillsPinFacts {
  // The commit of zgeoff/skills that the dispatch names.
  readonly commit: string;

  // The commit against the pin on main of zgeoff/tools.
  readonly sincePin: string;

  // The commit against the pin of the open pin branch; null when no branch is open.
  readonly sinceProposed: string | null;

  // Main of zgeoff/skills against the commit.
  readonly mainSinceCommit: string;
}

export type SkillsPinMove =
  | { readonly kind: 'move' }
  | { readonly kind: 'skip'; readonly reason: string }
  | { readonly kind: 'refused'; readonly message: string };

// Dispatches may arrive in any order, so the pin only moves forward along main of zgeoff/skills,
// past both the pin on main and the one the open pull request proposes.
export function pickSkillsPinMove(facts: Readonly<SkillsPinFacts>): SkillsPinMove {
  if (facts.mainSinceCommit !== 'ahead' && facts.mainSinceCommit !== 'identical') {
    return { kind: 'refused', message: `${facts.commit} is not a commit on main of zgeoff/skills` };
  }

  if (facts.sincePin === 'identical' || facts.sincePin === 'behind') {
    return {
      kind: 'skip',
      reason: `main of zgeoff/tools already pins ${facts.commit} or a newer commit`,
    };
  }

  if (facts.sincePin !== 'ahead') {
    return {
      kind: 'refused',
      message: `${facts.commit} does not descend from the commit main of zgeoff/tools pins`,
    };
  }

  if (facts.sinceProposed !== null && facts.sinceProposed !== 'ahead') {
    return {
      kind: 'skip',
      reason: `the open pin pull request already pins ${facts.commit} or a newer commit`,
    };
  }

  return { kind: 'move' };
}
