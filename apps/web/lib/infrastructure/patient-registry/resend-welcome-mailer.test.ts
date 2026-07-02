import { afterEach, describe, expect, it, vi } from "vitest";
import type { WelcomeMailInput } from "@evzla/core";

// Mock del SDK de Resend (hoisted: la factory de vi.mock no puede ver vars normales).
// La impl debe ser `function` (no arrow) para poder construirse con `new`.
const { sendMock, ResendCtor } = vi.hoisted(() => {
  const sendMock = vi.fn();
  const ResendCtor = vi.fn(function (this: { emails: { send: typeof sendMock } }) {
    this.emails = { send: sendMock };
  });
  return { sendMock, ResendCtor };
});
vi.mock("resend", () => ({ Resend: ResendCtor }));

import { ResendWelcomeMailer } from "./resend-welcome-mailer";

const input: WelcomeMailInput = {
  email: "nuevo@hosp.test",
  hospitalName: "Hospital Central",
  role: "uploader",
  loginUrl: "https://encuentramevzla.com/admin/login",
  manualUrl: null,
};

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("ResendWelcomeMailer", () => {
  it("sin API key hace no-op: no construye cliente ni envía (no bloquea el alta)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await new ResendWelcomeMailer("", "EncuéntrameVzla <no-reply@x.test>").sendWelcome(input);
    expect(ResendCtor).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("con API key envía el correo (from, to, subject y html)", async () => {
    sendMock.mockResolvedValue({ error: null });
    await new ResendWelcomeMailer("re_key", "EncuéntrameVzla <no-reply@x.test>").sendWelcome(input);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0]![0] as {
      from: string;
      to: string;
      subject: string;
      html: string;
    };
    expect(arg.from).toBe("EncuéntrameVzla <no-reply@x.test>");
    expect(arg.to).toBe("nuevo@hosp.test");
    expect(typeof arg.subject).toBe("string");
    expect(arg.html).toContain("Hospital Central"); // el template interpola el hospital
  });

  it("propaga el error de la API de Resend (best-effort lo captura arriba)", async () => {
    sendMock.mockResolvedValue({ error: { name: "validation_error" } });
    await expect(
      new ResendWelcomeMailer("re_key", "from@x.test").sendWelcome(input),
    ).rejects.toThrow(/resend send failed/);
  });
});
