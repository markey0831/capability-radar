import type { CapabilityCategory, CapabilityDimension, RoleId, RoleModel } from '../domain/types'

const CATEGORY_ORDER: CapabilityCategory[] = ['通用基础能力', '通用基础能力', '专业核心能力', '专业核心能力', '职业素养能力', '职业素养能力']

function createRole(
  id: RoleId,
  name: string,
  titleEn: string,
  definitions: Array<[string, string]>,
): RoleModel {
  return {
    id,
    name,
    titleEn,
    dimensions: definitions.map(([dimensionName, description], index): CapabilityDimension => ({
      id: `${id}:dimension-${index + 1}`,
      name: dimensionName,
      category: CATEGORY_ORDER[index],
      description,
    })),
  }
}

export const ROLE_MODELS: readonly RoleModel[] = [
  createRole('sales', '销售', 'SALES', [
    ['市场判断', '识别行业趋势、市场机会、目标客户和有效线索。'],
    ['沟通执行', '清楚介绍公司和产品，理解客户反馈并持续跟进。'],
    ['拓展客户', '通过资源、渠道和拜访开发客户并维护关系。'],
    ['推动成交', '发现诉求、处理异议并推动合作进入成交阶段。'],
    ['诚信服务', '诚实守信，维护客户关系和公司品牌形象。'],
    ['抗压担当', '面对业绩压力仍能坚持行动并承担目标。'],
  ]),
  createRole('business', '商务', 'BUSINESS', [
    ['逻辑表达', '梳理复杂信息，清楚撰写、汇报和解释方案。'],
    ['沟通协调', '协调客户、销售、项目和技术团队。'],
    ['挖掘需求', '明确客户场景、预算、周期和真实诉求。'],
    ['方案签约', '完成方案、报价、谈判和合同签署。'],
    ['严谨风控', '关注合同、报价、承诺和交接风险。'],
    ['客户意识', '从客户角度平衡诉求与公司能力。'],
  ]),
  createRole('project-manager', '项目经理', 'PROJECT MANAGER', [
    ['计划统筹', '拆解需求，安排工期、任务、人员和资源。'],
    ['协调推进', '组织客户、技术、运营和供应商共同推进。'],
    ['进度质量', '控制项目节点、交付标准、验收和整改。'],
    ['资源成本', '合理使用预算、资源并管理供应商。'],
    ['结果负责', '对项目最终结果负责并确保工作闭环。'],
    ['抗压复盘', '应对多项目和变化，并通过复盘持续改进。'],
  ]),
  createRole('technical-delivery', '技术交付', 'TECHNICAL DELIVERY', [
    ['理解执行', '准确理解方案和需求，按规范和工期完成任务。'],
    ['响应改进', '及时响应调整和故障并主动优化方案。'],
    ['技术制作', '运用建模、渲染、交互、开发和调试等技能。'],
    ['质量交付', '保证成果稳定、适配并控制外协质量。'],
    ['专注负责', '认真对待技术细节和内容质量。'],
    ['协作成长', '配合团队并持续学习新技术和工具。'],
  ]),
  createRole('offline-operations', '线下运营', 'OFFLINE OPERATIONS', [
    ['现场统筹', '安排门店人员、设备、服务和现场秩序。'],
    ['沟通应变', '协调各方并处理客诉与突发问题。'],
    ['开店带队', '完成开店筹备、培训、排班和团队管理。'],
    ['运营增收', '利用经营数据优化运营并提升收入。'],
    ['服务意识', '重视顾客体验、服务品质和品牌口碑。'],
    ['抗压改进', '适应运营压力并通过复盘持续优化。'],
  ]),
  createRole('ip-operations', 'IP运营', 'IP OPERATIONS', [
    ['创意策划', '提炼IP价值，设计内容、传播和产品创意。'],
    ['统筹分析', '协调资源并依据数据调整运营策略。'],
    ['IP运营', '完成IP孵化、传播、版权和全周期管理。'],
    ['产品变现', '推动衍生品、研学和增值服务落地。'],
    ['审美创新', '保持审美并持续提出新表达和新玩法。'],
    ['客户意识', '理解客户诉求并保证项目服务质量。'],
  ]),
  createRole('content-distribution', '内容发行', 'CONTENT DISTRIBUTION', [
    ['市场判断', '判断内容适配场景、客群、渠道和合作模式。'],
    ['资源沟通', '开发渠道资源并维护稳定合作关系。'],
    ['内容适配', '判断内容、版本、设备和场景是否匹配。'],
    ['渠道落地', '完成谈判、授权、部署和上线跟进。'],
    ['目标执行', '围绕发行数量、营收和效率推进任务。'],
    ['长期经营', '维护渠道生态，关注续约、复投和增长。'],
  ]),
]

export const ROLE_MODEL_MAP = new Map<RoleId, RoleModel>(ROLE_MODELS.map((role) => [role.id, role]))

export function getRoleModel(roleId: RoleId): RoleModel {
  const role = ROLE_MODEL_MAP.get(roleId)
  if (!role) throw new Error(`未知职位：${roleId}`)
  return role
}
