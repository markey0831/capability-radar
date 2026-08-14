import html2canvas from 'html2canvas'

export function makePngFilename(name: string, role: string, assessmentDate: string): string {
  const clean = (value: string) => value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return `${clean(name)}-${clean(role)}-${clean(assessmentDate)}-能力图.png`
}

export async function exportElementToPng(element: HTMLElement, filename: string): Promise<void> {
  await document.fonts?.ready
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: Math.max(2, window.devicePixelRatio || 1),
    logging: false,
    useCORS: true,
  })
  const pngBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG生成失败')), 'image/png'))
  const pngUrl = URL.createObjectURL(pngBlob)
  const anchor = document.createElement('a')
  anchor.href = pngUrl
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(pngUrl), 1000)
}
