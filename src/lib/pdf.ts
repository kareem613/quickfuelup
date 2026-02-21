import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerSrc

export async function pdfToTextAndImages(file: Blob, opts?: { maxPages?: number; scale?: number }) {
  const maxPages = opts?.maxPages ?? 3
  const scale = opts?.scale ?? 1.6

  const data = await file.arrayBuffer()
  const pdf = await getDocument({ data }).promise

  const count = Math.max(0, Math.min(pdf.numPages || 0, maxPages))
  const images: Blob[] = []
  const textParts: string[] = []

  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i)

    try {
      const content = await page.getTextContent()
      const pageText = (content.items as unknown[])
        .map((it) => (typeof it === 'object' && it !== null && typeof (it as Record<string, unknown>).str === 'string' ? String((it as Record<string, unknown>).str) : null))
        .filter((s): s is string => Boolean(s))
        .join(' ')
        .trim()
      if (pageText) textParts.push(pageText)

      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D context unavailable')

      await page.render({ canvasContext: ctx, viewport }).promise
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (!b) reject(new Error('Failed to render PDF page'))
            else resolve(b)
          },
          'image/jpeg',
          0.88,
        )
      })
      images.push(blob)
    } finally {
      page.cleanup()
    }
  }

  return {
    text: textParts.join('\n\n').trim(),
    images,
    pageCount: count,
    totalPages: pdf.numPages || 0,
  }
}

