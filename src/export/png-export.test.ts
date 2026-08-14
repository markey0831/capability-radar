import { describe, expect, it } from 'vitest'
import { makePngFilename } from './png-export'

describe('PNG 文件名', () => {
  it('按姓名职位日期生成文件名', () => expect(makePngFilename('张三', '项目经理', '2026-08-13')).toBe('张三-项目经理-2026-08-13-能力图.png'))
  it('清理 Windows 非法字符并合并短横线', () => expect(makePngFilename('张/三:*', '项目|经理?', '2026-08-13')).toBe('张-三-项目-经理-2026-08-13-能力图.png'))
})
