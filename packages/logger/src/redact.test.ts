import { describe, expect, it } from "vitest";

import { redactSensitive } from "./redact";

describe("redactSensitive", () => {
  it("masks secrets in the shapes the request logs produce", () => {
    expect(
      redactSensitive({
        input: { secret: "s", newPassword: "p", inviteCode: "i", name: "Hook" },
      }),
    ).toEqual({
      input: {
        secret: "[Redacted]",
        newPassword: "[Redacted]",
        inviteCode: "[Redacted]",
        name: "Hook",
      },
    });

    expect(
      redactSensitive({
        input: {
          body: { token: "t" },
          query: { code: "c", license_key: "l", page: "2" },
        },
      }),
    ).toEqual({
      input: {
        body: { token: "[Redacted]" },
        query: { code: "[Redacted]", license_key: "[Redacted]", page: "2" },
      },
    });

    expect(
      redactSensitive({ payload: [{ prev_license_key: "k", tier: "pro" }] }),
    ).toEqual({ payload: [{ prev_license_key: "[Redacted]", tier: "pro" }] });
  });

  it("keeps keys that only contain 'code'", () => {
    const obj = { colourCode: "#ffffff", statusCode: 200, errorCode: "E" };

    expect(redactSensitive(obj)).toEqual(obj);
  });

  it("passes class instances through for pino's serializers", () => {
    const err = new Error("boom");
    const date = new Date();
    const result = redactSensitive({ err, date }) as Record<string, unknown>;

    expect(result.err).toBe(err);
    expect(result.date).toBe(date);
  });

  it("does not mutate the original and survives cycles", () => {
    const obj: Record<string, unknown> = { token: "t" };
    obj.self = obj;

    expect(() => redactSensitive(obj)).not.toThrow();
    expect(obj.token).toBe("t");
  });
});
