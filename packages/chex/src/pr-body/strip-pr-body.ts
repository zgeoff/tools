export interface StrippedBody {
  readonly text: string;

  // Whether the body holds a closed wringer:report span, which the Verification section fills.
  readonly hasReport: boolean;
}

const reportSpan = /<!--\s*wringer:report\s*-->[\s\S]*?<!--\s*\/wringer:report\s*-->/gu;
const htmlComment = /<!--[\s\S]*?-->/gu;

// The template's comments hold headings and code fences, and the verify report holds a table, so
// none of them may count as the author's text.
export function stripPrBody(body: string): StrippedBody {
  const withoutReport = body.replaceAll(reportSpan, '');

  return {
    text: withoutReport.replaceAll(htmlComment, ''),
    hasReport: withoutReport !== body,
  };
}
