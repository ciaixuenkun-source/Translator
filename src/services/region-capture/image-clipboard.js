async function writePngImageToClipboard(
  pngBuffer,
  { clipboard, ClipboardItem, nativeImage, BlobType = Blob }
) {
  const image = nativeImage.createFromBuffer(pngBuffer);
  if (image.isEmpty()) throw new Error("image-decode-failed");

  const item = new ClipboardItem({
    "image/png": new BlobType([image.toPNG()], { type: "image/png" })
  });
  await clipboard.write([item]);
  if (!await clipboard.has("image/png")) throw new Error("clipboard-image-empty");
  return image.getSize();
}

module.exports = { writePngImageToClipboard };
