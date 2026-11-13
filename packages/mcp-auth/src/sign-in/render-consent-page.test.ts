import { expect, test } from 'bun:test';
import { renderConsentPage } from './render-consent-page.ts';

test('it escapes a client name that carries markup', () => {
  const page = renderConsentPage({
    consentPath: '/consent',
    oauthQuery: 'q=1',
    clientName: '<script>alert(1)</script>',
    redirectURI: 'https://dots.example/cb',
    scopes: ['read'],
    extraFields: '',
    error: null,
  });

  expect(page).not.toInclude('<script>alert(1)</script>');
  expect(page).toInclude('&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('it escapes the signed query it posts back', () => {
  const page = renderConsentPage({
    consentPath: '/consent',
    oauthQuery: 'a="><b>',
    clientName: 'dots',
    redirectURI: 'https://dots.example/cb',
    scopes: ['read'],
    extraFields: '',
    error: null,
  });

  expect(page).toInclude('name="oauth_query" value="a=&quot;&gt;&lt;b&gt;"');
});

test('it offers each scope unticked, so the owner grants only what they pick', () => {
  const page = renderConsentPage({
    consentPath: '/consent',
    oauthQuery: 'q=1',
    clientName: 'dots',
    redirectURI: 'https://dots.example/cb',
    scopes: ['read', 'write'],
    extraFields: '',
    error: null,
  });

  expect(page).toInclude('<input type="checkbox" name="scope" value="read"> read');
  expect(page).toInclude('<input type="checkbox" name="scope" value="write"> write');
});

test('it places the fields of the app inside the form, before the buttons', () => {
  const page = renderConsentPage({
    consentPath: '/consent',
    oauthQuery: 'q=1',
    clientName: 'dots',
    redirectURI: 'https://dots.example/cb',
    scopes: ['read'],
    extraFields: '<input name="imp" value="web-*">',
    error: null,
  });

  expect(page.indexOf('<input name="imp" value="web-*">')).toBeLessThan(page.indexOf('<button'));
});

test('it shows the error it was given, escaped', () => {
  const page = renderConsentPage({
    consentPath: '/consent',
    oauthQuery: 'q=1',
    clientName: 'dots',
    redirectURI: 'https://dots.example/cb',
    scopes: ['read'],
    extraFields: '',
    error: 'pick <one>',
  });

  expect(page).toInclude('<p class="error">pick &lt;one&gt;</p>');
});
