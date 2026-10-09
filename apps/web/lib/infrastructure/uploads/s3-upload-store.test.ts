import { describe, expect, it } from "vitest";
import { isOwnUploadKey, newUploadKey, S3UploadStore, type S3Sender } from "./s3-upload-store";

const MEMBER = "6f1c2a9e-0000-4000-8000-000000000001";

describe("upload keys", () => {
  it("la clave queda bajo el prefijo del miembro", () => {
    expect(newUploadKey(MEMBER, "abc-123")).toBe(`ingesta/${MEMBER}/abc-123.xlsx`);
  });

  it("solo acepta claves propias, sin path traversal ni otros prefijos", () => {
    expect(isOwnUploadKey(`ingesta/${MEMBER}/abc-123.xlsx`, MEMBER)).toBe(true);
    expect(isOwnUploadKey(`ingesta/otro-miembro/abc-123.xlsx`, MEMBER)).toBe(false);
    expect(isOwnUploadKey(`ingesta/${MEMBER}/../otro/abc.xlsx`, MEMBER)).toBe(false);
    expect(isOwnUploadKey(`ingesta/${MEMBER}/abc.csv`, MEMBER)).toBe(false);
    expect(isOwnUploadKey(`backups/${MEMBER}/abc.xlsx`, MEMBER)).toBe(false);
  });
});

function fakeS3(response: unknown = {}) {
  const sent: { command: string; input: unknown }[] = [];
  const client = {
    send: async (cmd: { constructor: { name: string }; input: unknown }) => {
      sent.push({ command: cmd.constructor.name, input: cmd.input });
      return response;
    },
  } as unknown as S3Sender;
  return { client, sent };
}

describe("S3UploadStore", () => {
  it("firma un PUT con tamaño y tipo fijos y vencimiento corto", async () => {
    const { client } = fakeS3();
    const signed: { command: string; input: unknown; expiresIn: number | undefined }[] = [];
    const store = new S3UploadStore(client, "evzla-uploads-1", async (_c, cmd, opts) => {
      signed.push({ command: cmd.constructor.name, input: cmd.input, expiresIn: opts?.expiresIn });
      return "https://signed.example.com/put";
    });
    const url = await store.presignPut("ingesta/m/k.xlsx", 1234);
    expect(url).toBe("https://signed.example.com/put");
    expect(signed).toEqual([
      {
        command: "PutObjectCommand",
        input: {
          Bucket: "evzla-uploads-1",
          Key: "ingesta/m/k.xlsx",
          ContentLength: 1234,
          ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        expiresIn: 300,
      },
    ]);
  });

  it("lee el objeto completo como bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const { client, sent } = fakeS3({ ContentLength: 3, Body: { transformToByteArray: async () => bytes } });
    const store = new S3UploadStore(client, "b", async () => "");
    expect(await store.read("ingesta/m/k.xlsx", 10)).toEqual(bytes);
    expect(sent).toEqual([{ command: "GetObjectCommand", input: { Bucket: "b", Key: "ingesta/m/k.xlsx" } }]);
  });

  it("rechaza objetos que superan el tamaño máximo sin leerlos", async () => {
    let read = false;
    const { client } = fakeS3({
      ContentLength: 11,
      Body: {
        transformToByteArray: async () => {
          read = true;
          return new Uint8Array();
        },
      },
    });
    const store = new S3UploadStore(client, "b", async () => "");
    await expect(store.read("ingesta/m/k.xlsx", 10)).rejects.toThrow();
    expect(read).toBe(false);
  });

  it("borra el objeto procesado", async () => {
    const { client, sent } = fakeS3();
    await new S3UploadStore(client, "b", async () => "").delete("ingesta/m/k.xlsx");
    expect(sent).toEqual([{ command: "DeleteObjectCommand", input: { Bucket: "b", Key: "ingesta/m/k.xlsx" } }]);
  });
});
