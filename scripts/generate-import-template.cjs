const ExcelJS = require('../cloudfunctions/api/node_modules/exceljs')
const fs = require('fs')
const path = require('path')

const roles = [
  ['sales', '销售'],
  ['business', '商务'],
  ['project-manager', '项目经理'],
  ['technical-delivery', '技术交付'],
  ['offline-operations', '线下运营'],
  ['ip-operations', 'IP运营'],
  ['content-distribution', '内容发行'],
]

const workbook = new ExcelJS.Workbook()
workbook.creator = 'Capability Radar'
workbook.created = new Date()

const importSheet = workbook.addWorksheet('人员导入模板', { views: [{ state: 'frozen', ySplit: 1 }] })
importSheet.columns = [
  { header: '姓名', key: 'name', width: 14 },
  { header: '部门', key: 'department', width: 18 },
  { header: '职位ID', key: 'roleId', width: 18 },
  { header: '可被评', key: 'evaluatee', width: 10 },
  { header: '可评分', key: 'rater', width: 10 },
]
importSheet.getRow(1).font = { bold: true }
importSheet.autoFilter = { from: 'A1', to: 'E1' }
importSheet.dataValidations.add('C2:C200', {
  type: 'list',
  allowBlank: true,
  formulae: ["'职位对照表'!$A$2:$A$8"],
})
importSheet.dataValidations.add('D2:E200', {
  type: 'list',
  allowBlank: true,
  formulae: ['"是,否"'],
})

const mapping = workbook.addWorksheet('职位对照表')
mapping.columns = [
  { header: '职位ID', key: 'id', width: 18 },
  { header: '职位名称', key: 'name', width: 14 },
]
mapping.getRow(1).font = { bold: true }
for (const [id, name] of roles) mapping.addRow({ id, name })

const guide = workbook.addWorksheet('填写说明')
guide.columns = [{ header: '说明', key: 'text', width: 80 }]
const guideLines = [
  '人员名单导入说明',
  '1. 请在本工作簿第一个工作表“人员导入模板”中填写，不要改动第一行表头。',
  '2. 姓名、部门为必填；职位ID请从下拉列表选择。',
  '3. “可被评”填写“是”表示该人员可以作为被评估人；“可评分”填写“是”表示该人员可以作为评分人。',
  '4. 职位ID对应关系见“职位对照表”。',
  '5. 填好后直接保存，然后在管理员后台“人员”页面点击“批量导入 Excel/CSV”选择本文件即可。',
]
for (const line of guideLines) guide.addRow({ text: line })

const outDir = path.resolve(__dirname, '..', 'docs')
fs.mkdirSync(outDir, { recursive: true })
async function writeTemplate() {
  await workbook.xlsx.writeFile(path.join(outDir, '人员导入模板.xlsx'))

  const csv = '\uFEFF' + [['姓名', '部门', '职位ID', '可被评', '可评分']].map((row) => row.join(',')).join('\r\n') + '\r\n'
  fs.writeFileSync(path.join(outDir, '人员导入模板.csv'), csv, 'utf8')
  console.log('generated docs/人员导入模板.xlsx and docs/人员导入模板.csv')
}

writeTemplate().catch((error) => {
  console.error(error)
  process.exit(1)
})
