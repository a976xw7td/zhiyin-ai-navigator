/**
 * Ethics Guard — 学术伦理护栏
 */

const RED_RULES = [
  /代写|帮我写(论文|作文|报告|作业|实验报告)|直接写(论文|作文|报告|作业)|生成.*(论文|作业).*交|帮我做题|直接给答案|考试.*答案|作弊/i,
  /write (my|the).*(essay|paper|homework|assignment)|do my homework|give me the answers|cheat|exam answers/i
];

const YELLOW_RULES = [
  /总结|摘要|大纲|润色|改写|参考答案|范文|文献综述|开题/i,
  /summarize|summary|outline|paraphrase|polish|literature review|reference answer/i
];

const EXAM_CONTEXT_RULE = /quiz|exam|test|考试|测验|timer|倒计时|答题|assessment/i;

export function checkEthicsRisk(intent, pageText) {
  const text = String(intent || '').trim();
  const context = String(pageText || '');
  if (!text) return { level: 'green', action: 'allow' };

  if (RED_RULES.some(rule => rule.test(text))) {
    return {
      level: 'red',
      action: 'block',
      speech: '我不能代写、代做题或提供考试答案。但我可以帮你拆解要求、讲知识点、列资料清单和学习大纲，最后内容需要你自己完成。'
    };
  }

  if (EXAM_CONTEXT_RULE.test(context) && /(点击|选择|提交|答案|帮我做|下一题|submit|answer|choose)/i.test(text)) {
    return {
      level: 'red',
      action: 'silent_exam',
      speech: '当前像是考试或测验场景。我不能替你答题或自动提交，但可以解释题目相关知识点，帮助你独立判断。'
    };
  }

  if (YELLOW_RULES.some(rule => rule.test(text))) {
    return {
      level: 'yellow',
      action: 'warn',
      speech: '可以，我会以学习辅助方式提供思路，并提醒你保留自己的判断、引用来源，避免直接照搬。'
    };
  }

  return { level: 'green', action: 'allow' };
}

export function buildEthicsPrompt(risk) {
  if (!risk || risk.level === 'green') return '';
  if (risk.level === 'yellow') {
    return '学术诚信提醒：本次请求属于辅助性生成，只能提供思路、结构、资料建议或解释，不能暗示用户直接照搬。';
  }
  return '学术伦理边界：拒绝代写、代做题、考试作弊、自动提交答案。必须转为知识点讲解、资料检索、解题思路或学习计划。';
}
