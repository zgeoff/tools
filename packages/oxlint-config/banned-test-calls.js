const bannedTestCalls = new Set([
  'describe',
  'it',
  'beforeAll',
  'beforeEach',
  'afterAll',
  'afterEach',
]);

export default bannedTestCalls;
