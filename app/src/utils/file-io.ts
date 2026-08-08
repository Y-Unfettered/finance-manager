import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'

/**
 * 读取用户选择的文件为文本。
 * 通过 input[type=file] 触发，兼容 WebView 与浏览器。
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'))
    reader.readAsText(file)
  })
}

/**
 * 读取用户选择的文件为 ArrayBuffer（用于二进制格式如 XLSX）。
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'))
    reader.readAsArrayBuffer(file)
  })
}

export interface SaveResult {
  /** 已保存的文件名（含扩展名）。 */
  fileName: string
  /** 原生平台上文件所在的可读路径或目录说明。 */
  location?: string
  /** 是否通过浏览器下载方式保存（web 平台）。 */
  downloaded: boolean
}

/**
 * 将文本内容保存为文件。原生平台写入应用 Documents 目录并返回位置说明，
 * web 平台触发浏览器下载。
 */
export async function saveTextFile(
  fileName: string,
  content: string,
  mimeType = 'text/plain',
): Promise<SaveResult> {
  if (Capacitor.isNativePlatform()) {
    const result = await Filesystem.writeFile({
      path: fileName,
      data: content,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    return {
      fileName,
      location: result.uri,
      downloaded: false,
    }
  }

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
  return { fileName, downloaded: true }
}
