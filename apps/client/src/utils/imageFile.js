const DEFAULT_MAX_INPUT_BYTES = 8 * 1024 * 1024

const loadImage = (url) => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error('无法读取图片'))
  image.src = url
})

export async function readOptimizedImage(
  file,
  { maxDimension = 1600, quality = 0.86 } = {},
) {
  if (!file) throw new Error('请选择图片')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('仅支持 JPG、PNG 或 WebP 图片')
  }
  if (file.size > DEFAULT_MAX_INPUT_BYTES) {
    throw new Error('图片不能超过 8 MB')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法处理这张图片')
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/webp', quality)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
