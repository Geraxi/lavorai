/** Application aliases preserve exact reply attribution; personal Gmail is not a prerequisite. */
export function portalRecipient(input: {
  userEmail: string;
  applicationAlias: string | null;
  userInbox: string | null;
}): string {
  return input.applicationAlias ?? input.userInbox ?? input.userEmail;
}
