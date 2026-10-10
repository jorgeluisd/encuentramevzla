import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { XLSX_CONTENT_TYPE } from "./xlsx-content-type";

export type S3Sender = Pick<S3Client, "send">;
type Presigner = (client: S3Sender, command: PutObjectCommand, options?: { expiresIn?: number }) => Promise<string>;

const PUT_URL_TTL_SECONDS = 300;

export function newUploadKey(memberId: string, uuid: string): string {
  return `ingesta/${memberId}/${uuid}.xlsx`;
}

// Un miembro solo puede pedir que se procese un objeto que él mismo subió.
export function isOwnUploadKey(key: string, memberId: string): boolean {
  const prefix = `ingesta/${memberId}/`;
  return key.startsWith(prefix) && /^[A-Za-z0-9-]+\.xlsx$/.test(key.slice(prefix.length));
}

// El navegador sube directo a S3: Lambda no acepta cuerpos de más de ~6 MB.
export class S3UploadStore {
  constructor(
    private readonly client: S3Sender,
    private readonly bucket: string,
    private readonly presign: Presigner = getSignedUrl as unknown as Presigner,
  ) {}

  // ContentLength firmado: S3 rechaza un PUT de otro tamaño que el declarado.
  presignPut(key: string, size: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentLength: size,
      ContentType: XLSX_CONTENT_TYPE,
    });
    return this.presign(this.client, command, { expiresIn: PUT_URL_TTL_SECONDS });
  }

  async read(key: string, maxBytes: number): Promise<Uint8Array> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!out.Body || (out.ContentLength ?? 0) > maxBytes) {
      throw new Error("El archivo subido no es válido o supera el tamaño máximo.");
    }
    return out.Body.transformToByteArray();
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
