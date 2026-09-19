import { describe, it, expect } from "@jest/globals";
import {
  extractApplicationSecurityCode,
  isGreenhouseSecurityMessage,
  hasApplicationConfirmation,
} from "../application-security-code";

describe("extractApplicationSecurityCode", () => {
  it("extracts code from real Greenhouse email body", () => {
    const body = `Security code for your application to SumUp

Hi,

You're receiving this email because you (or someone pretending to be you) recently requested a security code while applying to one of our jobs.

Copy and paste this code on the application page to continue your application:

 2Oy2H4pU

After you enter the code, you can return to the application and finish.

Best,
SumUp Recruiting`;

    expect(extractApplicationSecurityCode(body)).toBe("2Oy2H4pU");
  });

  it("extracts code from Italian Greenhouse email", () => {
    const body = `Codice di sicurezza per la tua candidatura a Acme Corp

Ciao,

Il tuo codice di verifica è:

 A1B2C3D4

Inseriscilo nella pagina di candidatura per continuare.`;

    expect(extractApplicationSecurityCode(body)).toBe("A1B2C3D4");
  });

  it("extracts code with alternative phrasing", () => {
    const body = `Your security code is: XyZ789Qw

After entering the code you can continue.`;

    expect(extractApplicationSecurityCode(body)).toBe("XyZ789Qw");
  });

  it("returns null when no code is found", () => {
    const body = `This is just a regular email without any security code.`;
    expect(extractApplicationSecurityCode(body)).toBeNull();
  });

  it("does not extract job IDs or dates from subject", () => {
    const body = `Job ID 12345678 - no code here`;
    expect(extractApplicationSecurityCode(body)).toBeNull();
  });

  it("handles 6-12 character alphanumeric codes", () => {
    const sixChar = "Copy and paste this code: AbC123";
    expect(extractApplicationSecurityCode(sixChar)).toBe("AbC123");

    const twelveChar = "Security code: XyZ123456789";
    expect(extractApplicationSecurityCode(twelveChar)).toBe("XyZ123456789");
  });
});

describe("isGreenhouseSecurityMessage", () => {
  it("recognizes Greenhouse security emails", () => {
    expect(
      isGreenhouseSecurityMessage({
        fromAddress: "no-reply@greenhouse.io",
        subject: "Security code for your application",
        bodyText: "Your verification code is 2Oy2H4pU",
      }),
    ).toBe(true);

    expect(
      isGreenhouseSecurityMessage({
        fromAddress: "notifications@boards.greenhouse.io",
        subject: "Verification required",
        bodyText: "Security code: ABC123",
      }),
    ).toBe(true);
  });

  it("rejects non-Greenhouse domains", () => {
    expect(
      isGreenhouseSecurityMessage({
        fromAddress: "hr@company.com",
        subject: "Security code",
        bodyText: "Your code is 123456",
      }),
    ).toBe(false);
  });

  it("rejects Greenhouse emails without security keywords", () => {
    expect(
      isGreenhouseSecurityMessage({
        fromAddress: "no-reply@greenhouse.io",
        subject: "Application received",
        bodyText: "Thank you for applying",
      }),
    ).toBe(false);
  });
});

describe("hasApplicationConfirmation", () => {
  it("detects confirmation in body text", () => {
    expect(
      hasApplicationConfirmation(
        "Thank you! Your application has been received.",
        "https://example.com/apply",
      ),
    ).toBe(true);

    expect(
      hasApplicationConfirmation(
        "We received your application and will be in touch.",
        "https://example.com/apply",
      ),
    ).toBe(true);
  });

  it("detects confirmation in URL", () => {
    expect(
      hasApplicationConfirmation("", "https://example.com/thank-you"),
    ).toBe(true);

    expect(
      hasApplicationConfirmation("", "https://example.com/confirmation"),
    ).toBe(true);
  });

  it("returns false when no confirmation found", () => {
    expect(
      hasApplicationConfirmation(
        "Please fill out all fields",
        "https://example.com/apply",
      ),
    ).toBe(false);
  });
});
