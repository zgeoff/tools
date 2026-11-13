import { toHTMLText } from '../utils/to-html-text.ts';

interface ConsentPageView {
  readonly consentPath: string;

  // The signed authorization query the page posts back.
  readonly oauthQuery: string;
  readonly clientName: string;
  readonly redirectURI: string;
  readonly scopes: readonly string[];

  // The app's own form fields, as HTML it has escaped.
  readonly extraFields: string;
  readonly error: string | null;
}

export function renderConsentPage(view: ConsentPageView): string {
  const scopeRows = view.scopes
    .map(
      (scope) =>
        `<label><input type="checkbox" name="scope" value="${toHTMLText(scope)}"> ${toHTMLText(scope)}</label>`,
    )
    .join('\n');

  const error = view.error === null ? '' : `<p class="error">${toHTMLText(view.error)}</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Choose what to allow</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
label { display: block; margin: 0.25rem 0; }
.error { color: #b00020; }
code { word-break: break-all; }
button { font: inherit; margin-right: 0.5rem; }
</style>
</head>
<body>
<h1>Choose what to allow</h1>
<p><strong>${toHTMLText(view.clientName)}</strong> returns to <code>${toHTMLText(view.redirectURI)}</code> with the access you allow here.</p>
${error}
<form method="post" action="${toHTMLText(view.consentPath)}">
<input type="hidden" name="oauth_query" value="${toHTMLText(view.oauthQuery)}">
<fieldset>
<legend>Allow it to use these scopes</legend>
${scopeRows}
</fieldset>
${view.extraFields}
<p><button type="submit" name="decision" value="approve">Allow</button><button type="submit" name="decision" value="deny">Deny</button></p>
</form>
</body>
</html>
`;
}
