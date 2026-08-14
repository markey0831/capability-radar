import { describe, expect, it } from 'vitest'
import { CAPABILITY_CATEGORIES } from '../domain/types'
import { ROLE_MODELS } from './role-models'

const expectedNames: Record<string, string[]> = {
  sales: ['市场判断', '沟通执行', '拓展客户', '推动成交', '诚信服务', '抗压担当'],
  business: ['逻辑表达', '沟通协调', '挖掘需求', '方案签约', '严谨风控', '客户意识'],
  'project-manager': ['计划统筹', '协调推进', '进度质量', '资源成本', '结果负责', '抗压复盘'],
  'technical-delivery': ['理解执行', '响应改进', '技术制作', '质量交付', '专注负责', '协作成长'],
  'offline-operations': ['现场统筹', '沟通应变', '开店带队', '运营增收', '服务意识', '抗压改进'],
  'ip-operations': ['创意策划', '统筹分析', 'IP运营', '产品变现', '审美创新', '客户意识'],
  'content-distribution': ['市场判断', '资源沟通', '内容适配', '渠道落地', '目标执行', '长期经营'],
}

describe('岗位六维配置', () => {
  it('包含七个稳定且唯一的职位', () => {
    expect(ROLE_MODELS).toHaveLength(7)
    expect(new Set(ROLE_MODELS.map((role) => role.id)).size).toBe(7)
  })

  it.each(ROLE_MODELS)('$name 包含正确的六维结构', (role) => {
    expect(role.dimensions.map((dimension) => dimension.name)).toEqual(expectedNames[role.id])
    expect(role.dimensions).toHaveLength(6)
    expect(new Set(role.dimensions.map((dimension) => dimension.id)).size).toBe(6)
    for (const category of CAPABILITY_CATEGORIES) {
      expect(role.dimensions.filter((dimension) => dimension.category === category)).toHaveLength(2)
    }
  })
})
