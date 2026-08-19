import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

export function makePdfFilename(name: string, role: string, assessmentDate: string): string {
  const clean = (value: string) => value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return `${clean(name)}-${clean(role)}-${clean(assessmentDate)}-能力报告.pdf`
}

export async function exportElementsToPdf(pages: HTMLElement[], filename: string): Promise<void> {
  await document.fonts?.ready
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  for (let index = 0; index < pages.length; index += 1) {
    if (index > 0) pdf.addPage()
    const canvas = await html2canvas(pages[index], {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true,
    })
    const image = canvas.toDataURL('image/png')
    const imageHeight = canvas.height * pageWidth / canvas.width
    pdf.addImage(image, 'PNG', 0, 0, pageWidth, Math.min(imageHeight, pageHeight))
  }

  pdf.save(filename)
}
