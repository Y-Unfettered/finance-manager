export const CUSTOM_ICON_MAX_FILE_BYTES = 5 * 1024 * 1024
export const CUSTOM_ICON_OUTPUT_SIZE = 256

const SUPPORTED_CUSTOM_ICON_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export function validateCustomIconFile(file: File): void {
  if (!SUPPORTED_CUSTOM_ICON_TYPES.has(file.type)) {
    throw new Error('请选择 PNG、JPG 或 WebP 图片')
  }
  if (file.size <= 0) throw new Error('图片文件为空')
  if (file.size > CUSTOM_ICON_MAX_FILE_BYTES) throw new Error('图片不能超过 5 MB')
}

export async function prepareCustomIconDataUri(file: File): Promise<string> {
  validateCustomIconFile(file)
  const source = await readFileAsDataUri(file)
  const image = await loadImage(source)
  const canvas = document.createElement('canvas')
  canvas.width = CUSTOM_ICON_OUTPUT_SIZE
  canvas.height = CUSTOM_ICON_OUTPUT_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前设备无法处理图片')

  const contentSize = Math.round(CUSTOM_ICON_OUTPUT_SIZE * 0.88)
  const scale = Math.min(contentSize / image.naturalWidth, contentSize / image.naturalHeight)
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  context.clearRect(0, 0, CUSTOM_ICON_OUTPUT_SIZE, CUSTOM_ICON_OUTPUT_SIZE)
  context.drawImage(
    image,
    Math.round((CUSTOM_ICON_OUTPUT_SIZE - width) / 2),
    Math.round((CUSTOM_ICON_OUTPUT_SIZE - height) / 2),
    width,
    height,
  )
  return canvas.toDataURL('image/png')
}

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片格式损坏或无法读取'))
    image.src = source
  })
}
