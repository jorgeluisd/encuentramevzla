"use server";

export async function echoLength(value: string): Promise<number> {
  return value.length;
}

export type UploadState = { name: string; size: number } | null;

export async function receiveUpload(_previous: UploadState, form: FormData): Promise<UploadState> {
  const file = form.get("file");
  const name = form.get("name");
  return {
    name: typeof name === "string" ? name : "",
    size: file instanceof File ? (await file.arrayBuffer()).byteLength : -1,
  };
}
