/** Only translate known error categories; never render provider error text. */
export function authErrorMessageKey(params: Pick<URLSearchParams, "getAll">) {
  const errors = params.getAll("error");
  if (!errors.length) return null;
  // Support old /login?error=1&error=... callback URLs too.
  const error = errors.find((value) => value !== "1") ?? errors[0];
  if (error === "Verification" || error === "1") return "errorLinkInvalid";
  if (error === "OAuthAccountNotLinked" || error === "AccountNotLinked") return "errorAccountNotLinked";
  if (error === "AccessDenied") return "errorAccessDenied";
  return "errorSignInFailed";
}
