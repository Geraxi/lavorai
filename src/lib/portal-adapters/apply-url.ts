/** Apply and posting URLs with search parameters preserved and fragments
 * removed. Mutate pathname only: appending to a URL string corrupts queries. */
export function publicApplyUrls(jobUrl: string): [string, string] {
  try {
    const posting = new URL(jobUrl);
    posting.hash = "";
    posting.pathname = posting.pathname.replace(/\/+$/, "").replace(/\/apply$/i, "");
    const apply = new URL(posting.toString());
    apply.pathname = `${posting.pathname.replace(/\/+$/, "")}/apply`;
    return [apply.toString(), posting.toString()];
  } catch {
    // URL ownership/validity remains the adapter's responsibility. Do not turn
    // malformed input into a different destination or introduce a new throw.
    return [jobUrl, jobUrl];
  }
}
