export async function matchesDeclaredFileType(file: File, contentType: string) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = String.fromCharCode(...bytes);
  switch (contentType) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
      );
    case "image/webp":
      return ascii.slice(0, 4) === "RIFF" && ascii.slice(8, 12) === "WEBP";
    case "image/gif":
      return ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a");
    case "application/pdf":
      return ascii.startsWith("%PDF-");
    case "audio/ogg":
      return ascii.startsWith("OggS");
    case "audio/webm":
      return (
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3
      );
    case "audio/mp4":
      return ascii.slice(4, 8) === "ftyp";
    case "audio/wav":
    case "audio/x-wav":
      return ascii.slice(0, 4) === "RIFF" && ascii.slice(8, 12) === "WAVE";
    case "audio/mpeg":
      return (
        ascii.startsWith("ID3") ||
        (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
      );
    default:
      return false;
  }
}
