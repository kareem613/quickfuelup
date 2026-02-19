export async function compressImage(
  file: Blob,
  opts?: { maxDimension?: number; quality?: number; mimeType?: string },
): Promise<Blob> {
  const maxDimension = opts?.maxDimension ?? 1600
  const quality = opts?.quality ?? 0.85
  const mimeType = opts?.mimeType ?? 'image/jpeg'

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const targetW = Math.max(1, Math.round(bitmap.width * scale))
  const targetH = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  ctx.drawImage(bitmap, 0, 0, targetW, targetH)
  bitmap.close()

  const out = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error('Failed to encode image'))
        else resolve(b)
      },
      mimeType,
      quality,
    )
  })

  return out
}

