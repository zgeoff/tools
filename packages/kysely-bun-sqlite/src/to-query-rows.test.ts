import { expect, test } from 'bun:test';
import { toQueryRows } from './to-query-rows.ts';

interface Plant {
  readonly species: string;
}

test('it returns the rows it is given', () => {
  const rows: unknown[] = [{ species: 'fern' }];
  const plants: unknown[] = toQueryRows<Plant>(rows);

  expect(plants).toBe(rows);
});

test('it types the rows as the query row type', () => {
  const rows: unknown[] = [{ species: 'fern' }];
  const plants: Plant[] = toQueryRows<Plant>(rows);

  expect(plants.map((plant) => plant.species)).toStrictEqual(['fern']);
});
