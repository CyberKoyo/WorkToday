/** `addedAt`: when it was uploaded (ms); files stored before it was kept have none. */
export interface StoredFile { name: string; type: string; dataBase64: string; addedAt?: number }

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function fileToStored(file: File): Promise<StoredFile> {
  return { name: file.name, type: file.type, dataBase64: bytesToBase64(new Uint8Array(await file.arrayBuffer())), addedAt: Date.now() };
}

export function storedToFile(s: StoredFile): File {
  return new File([base64ToBytes(s.dataBase64)], s.name, { type: s.type });
}
