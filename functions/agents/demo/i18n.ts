import type { ToolResponseTemplate } from '../../platform/contracts';

export const demoKnowledgeResponse: ToolResponseTemplate = {
  text: {
    ru: 'Найдено: {{knowledge.item.name}}. Статус: {{knowledge.item.status}}.',
    uz: 'Topildi: {{knowledge.item.name}}. Holat: {{knowledge.item.status}}.',
  },
};
