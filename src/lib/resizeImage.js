// Downscale an image in the browser before upload: long side capped at
// `maxSize`, re-encoded as JPEG. Turns a 5 MB phone photo into ~300 KB and
// normalizes HEIC (which Safari can decode but nobody can display) to JPEG.
// Throws if the browser can't decode the file at all.

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies EXIF rotation so portrait phone photos don't
      // come out sideways.
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Fall through to the <img> path.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function resizeImage(file, { maxSize = 1200, quality = 0.85 } = {}) {
  const source = await decode(file)
  const srcW = source.width
  const srcH = source.height
  if (!srcW || !srcH) throw new Error('Could not read image dimensions')

  const scale = Math.min(1, maxSize / Math.max(srcW, srcH))
  const w = Math.round(srcW * scale)
  const h = Math.round(srcH * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  // JPEG has no alpha — give transparent PNGs a white backdrop instead of black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(source, 0, 0, w, h)
  if (typeof source.close === 'function') source.close()

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', quality)
  })

  const base = file.name.replace(/\.[^.]+$/, '') || 'headshot'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}
