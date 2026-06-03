describe('Jest setup', () => {
  it('can run TypeScript tests', () => {
    const value: string = 'hello';
    expect(value).toBe('hello');
  });

  it('supports ES module syntax', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });
});
