export interface StoredFile { name: string; type: string; dataBase64: string }

export async function fileToStored(file: File): Promise<StoredFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { name: file.name, type: file.type, dataBase64: btoa(bin) };
}

export function storedToFile(s: StoredFile): File {
  const bin = atob(s.dataBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], s.name, { type: s.type });
}
