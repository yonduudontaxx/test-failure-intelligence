import { describe, it, expect } from '@jest/globals';
import { junitXmlAdapter } from '../../../../../src/application/ingestion/adapters/junit-xml.adapter.js';
import { IngestionFailedError } from '../../../../../src/application/ingestion/errors.js';

describe('junitXmlAdapter', () => {
  describe('happy path', () => {
    it('parses a <testsuites> wrapper with one suite and mixed cases', () => {
      const xml = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="AuthService" timestamp="2026-06-01T12:00:00Z">
    <testcase name="should authenticate" time="0.12"/>
    <testcase name="should reject" time="0.088">
      <failure message="Expected 401 but got 200" type="AssertionError">stack trace here</failure>
    </testcase>
  </testsuite>
</testsuites>`;

      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });

      expect(result.executedAt).toEqual(new Date('2026-06-01T12:00:00Z'));
      expect(result.metadata).toEqual({});
      expect(result.cases).toHaveLength(2);
      expect(result.cases[0]).toEqual({
        suiteName: 'AuthService',
        testName: 'should authenticate',
        fullName: 'AuthService > should authenticate',
        status: 'PASSED',
        durationMs: 120,
        retryCount: 0,
        metadata: {},
      });
      expect(result.cases[1]).toMatchObject({
        suiteName: 'AuthService',
        testName: 'should reject',
        status: 'FAILED',
        durationMs: 88,
        failureType: 'AssertionError',
      });
      expect(result.cases[1].failureMessage).toBeDefined();
    });
  });

  describe('root format variants', () => {
    it('accepts a single <testsuite> as the root (no wrapper)', () => {
      const xml = `<?xml version="1.0"?>
<testsuite name="Solo">
  <testcase name="t1"/>
</testsuite>`;
      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });
      expect(result.cases).toHaveLength(1);
      expect(result.cases[0].suiteName).toBe('Solo');
      expect(result.cases[0].fullName).toBe('Solo > t1');
    });

    it('flattens multiple <testsuite> elements within <testsuites>', () => {
      const xml = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="A"><testcase name="a1"/></testsuite>
  <testsuite name="B"><testcase name="b1"/></testsuite>
</testsuites>`;
      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });
      expect(result.cases.map((c) => c.fullName)).toEqual(['A > a1', 'B > b1']);
    });
  });

  describe('status mapping', () => {
    it('maps a testcase with no failure/error/skipped to PASSED', () => {
      const xml = `<testsuite name="S"><testcase name="t"/></testsuite>`;
      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });
      expect(result.cases[0].status).toBe('PASSED');
    });

    it('maps a <failure> child element to FAILED', () => {
      const xml = `<testsuite name="S"><testcase name="t"><failure message="m" type="T"/></testcase></testsuite>`;
      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });
      expect(result.cases[0].status).toBe('FAILED');
    });

    it('maps an <error> child element to FAILED', () => {
      const xml = `<testsuite name="S"><testcase name="t"><error message="boom" type="Exception"/></testcase></testsuite>`;
      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });
      expect(result.cases[0].status).toBe('FAILED');
    });

    it('maps a <skipped/> child element to SKIPPED', () => {
      const xml = `<testsuite name="S"><testcase name="t"><skipped/></testcase></testsuite>`;
      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });
      expect(result.cases[0].status).toBe('SKIPPED');
    });
  });

  describe('failure and error extraction', () => {
    it('extracts failureMessage from <failure> element text content', () => {
      const xml = `<testsuite name="S"><testcase name="t"><failure type="Error">stack trace content</failure></testcase></testsuite>`;
      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });
      expect(result.cases[0].failureMessage).toBe('stack trace content');
      expect(result.cases[0].failureType).toBe('Error');
    });

    it('falls back to the message attribute when element text is absent', () => {
      const xml = `<testsuite name="S"><testcase name="t"><failure message="Boom!" type="AssertionError"/></testcase></testsuite>`;
      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });
      expect(result.cases[0].failureMessage).toBe('Boom!');
      expect(result.cases[0].failureType).toBe('AssertionError');
    });

    it('extracts failureType from <error type=...> as well', () => {
      const xml = `<testsuite name="S"><testcase name="t"><error type="RuntimeException">oops</error></testcase></testsuite>`;
      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });
      expect(result.cases[0].failureMessage).toBe('oops');
      expect(result.cases[0].failureType).toBe('RuntimeException');
    });
  });

  describe('suiteName and fullName', () => {
    it('uses the testsuite name attribute as suiteName', () => {
      const xml = `<testsuite name="MySuite"><testcase name="my test"/></testsuite>`;
      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });
      expect(result.cases[0].suiteName).toBe('MySuite');
      expect(result.cases[0].fullName).toBe('MySuite > my test');
    });

    it('omits suiteName when testsuite has no name attribute', () => {
      const xml = `<testsuite><testcase name="solo"/></testsuite>`;
      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });
      expect(result.cases[0].suiteName).toBeUndefined();
      expect(result.cases[0].fullName).toBe('solo');
    });
  });

  describe('duration', () => {
    it('converts time attribute (seconds) to durationMs (ms, rounded)', () => {
      const xml = `<testsuite name="S"><testcase name="t" time="0.123"/></testsuite>`;
      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });
      expect(result.cases[0].durationMs).toBe(123);
    });

    it('omits durationMs when time is absent', () => {
      const xml = `<testsuite name="S"><testcase name="t"/></testsuite>`;
      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });
      expect(result.cases[0].durationMs).toBeUndefined();
    });
  });

  describe('empty inputs', () => {
    it('returns cases: [] for an empty testsuite (no testcases)', () => {
      const xml = `<testsuite name="Empty"/>`;
      const result = junitXmlAdapter.parse({ kind: 'xml', text: xml });
      expect(result.cases).toEqual([]);
    });
  });

  describe('error cases', () => {
    it('throws IngestionFailedError when input.kind is json', () => {
      expect(() => junitXmlAdapter.parse({ kind: 'json', body: {} })).toThrow(IngestionFailedError);
    });

    it('throws IngestionFailedError on malformed XML', () => {
      const xml = `<testsuite name="S"><testcase name="t"</testsuite>`;
      expect(() => junitXmlAdapter.parse({ kind: 'xml', text: xml })).toThrow(IngestionFailedError);
    });

    it('throws IngestionFailedError when no testsuite or testsuites root is present', () => {
      const xml = `<?xml version="1.0"?><other/>`;
      expect(() => junitXmlAdapter.parse({ kind: 'xml', text: xml })).toThrow(IngestionFailedError);
    });

    it('throws IngestionFailedError when a testcase has no name attribute', () => {
      const xml = `<testsuite name="S"><testcase/></testsuite>`;
      expect(() => junitXmlAdapter.parse({ kind: 'xml', text: xml })).toThrow(IngestionFailedError);
    });
  });
});
