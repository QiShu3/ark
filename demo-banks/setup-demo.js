// 批量上传题库并创建刻意工作流配置
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8000';
const TOKEN = 'DLtgOYpnbQ0pxTo2B6fl6errTwJqv45O1lR1b4MCd3A';

async function apiJson(path, options = {}) {
  const res = await fetch(BASE_URL + path, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

// 题库定义：文件名 -> 题库名称
const BANKS = [
  { file: '01-reading-comprehension.json', name: '考研英语二阅读 - demo' },
  { file: '02-long-sentence.json', name: '长难句结构拆解' },
  { file: '03-attributive-clause.json', name: '定语从句专项' },
  { file: '04-vocabulary.json', name: '核心词汇辨析' },
  { file: '05-paraphrase.json', name: '同义替换识别' },
  { file: '06-logic-relation.json', name: '段落逻辑关系' },
  { file: '07-distractor-types.json', name: '干扰项类型归因' },
  { file: '08-straw-man.json', name: '偷换概念专项' },
  { file: '09-positioning.json', name: '题干定位技巧' },
  { file: '10-main-idea-attitude.json', name: '篇章主旨与态度' },
];

async function uploadBank(file, name) {
  const filePath = path.join(__dirname, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  
  const formData = new FormData();
  formData.append('kind', 'choice');
  formData.append('name', name);
  formData.append('description', `${name} - demo题库`);
  
  const blob = new Blob([content], { type: 'application/json' });
  formData.append('file', blob, file);
  
  const res = await fetch(BASE_URL + '/api/deliberate-workflows/banks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: formData,
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`上传题库 ${name} 失败: HTTP ${res.status}: ${text.substring(0, 300)}`);
  }
  
  return res.json();
}

async function createConfig(name, bankId, targetCount = 5, passThreshold = 0.8) {
  return apiJson('/api/deliberate-workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      kind: 'choice',
      focus_work_type: 'choice',
      bank_id: bankId,
      target_count: targetCount,
      pass_criteria: {
        mode: 'accuracy',
        threshold: passThreshold,
      },
      scope: {},
      completion: {
        mode: 'question_count',
        question_count: targetCount,
      },
      primary_filter: 'all',
      sort_order: 'sequential',
      use_fsrs: false,
      backflow_rule: 'none',
    }),
  });
}

async function patchConfigChildren(configId, children) {
  return apiJson(`/api/deliberate-workflows/${configId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ children }),
  });
}

async function main() {
  console.log('=== 开始批量上传题库和创建配置 ===\n');
  
  // 1. 上传所有题库
  const bankResults = {};
  for (const bank of BANKS) {
    console.log(`上传题库: ${bank.name} ...`);
    try {
      const result = await uploadBank(bank.file, bank.name);
      bankResults[bank.file] = result;
      console.log(`  ✓ 成功, bank_id: ${result.bank_id}, ${result.question_count}题`);
    } catch (e) {
      console.log(`  ✗ 失败: ${e.message}`);
    }
  }
  
  console.log('\n=== 创建刻意工作流配置 ===\n');
  
  // 2. 创建所有配置
  const configResults = {};
  const configDefs = [
    { key: '01-reading-comprehension.json', name: '阅读理解训练', target: 5, pass: 0.8 },
    { key: '02-long-sentence.json', name: '长难句结构拆解', target: 5, pass: 0.8 },
    { key: '03-attributive-clause.json', name: '定语从句专项', target: 5, pass: 0.8 },
    { key: '04-vocabulary.json', name: '核心词汇辨析', target: 5, pass: 0.85 },
    { key: '05-paraphrase.json', name: '同义替换识别', target: 5, pass: 0.8 },
    { key: '06-logic-relation.json', name: '段落逻辑关系', target: 5, pass: 0.8 },
    { key: '07-distractor-types.json', name: '干扰项类型归因', target: 5, pass: 0.9 },
    { key: '08-straw-man.json', name: '偷换概念专项', target: 5, pass: 0.9 },
    { key: '09-positioning.json', name: '题干定位技巧', target: 5, pass: 0.8 },
    { key: '10-main-idea-attitude.json', name: '篇章主旨与态度', target: 5, pass: 0.8 },
  ];
  
  for (const def of configDefs) {
    const bank = bankResults[def.key];
    if (!bank) {
      console.log(`跳过 ${def.name}: 题库未上传成功`);
      continue;
    }
    console.log(`创建配置: ${def.name} ...`);
    try {
      const config = await createConfig(def.name, bank.bank_id, def.target, def.pass);
      configResults[def.key] = config;
      console.log(`  ✓ 成功, config_id: ${config.id}`);
    } catch (e) {
      console.log(`  ✗ 失败: ${e.message}`);
    }
  }
  
  console.log('\n=== 配置 children 关联（fork 结构） ===\n');
  
  // 3. 配置 children
  // 主任务：阅读理解训练 -> 7个第一层fork
  const mainConfig = configResults['01-reading-comprehension.json'];
  if (mainConfig) {
    const children = [
      { config_id: configResults['02-long-sentence.json']?.id, label: '长难句结构拆解', is_recommended: true },
      { config_id: configResults['04-vocabulary.json']?.id, label: '核心词汇辨析', is_recommended: true },
      { config_id: configResults['05-paraphrase.json']?.id, label: '同义替换识别', is_recommended: false },
      { config_id: configResults['06-logic-relation.json']?.id, label: '段落逻辑关系', is_recommended: false },
      { config_id: configResults['07-distractor-types.json']?.id, label: '干扰项类型归因', is_recommended: false },
      { config_id: configResults['09-positioning.json']?.id, label: '题干定位技巧', is_recommended: false },
      { config_id: configResults['10-main-idea-attitude.json']?.id, label: '篇章主旨与态度', is_recommended: false },
    ].filter(c => c.config_id);
    
    console.log(`主任务「阅读理解训练」添加 ${children.length} 个子任务...`);
    try {
      await patchConfigChildren(mainConfig.id, children);
      console.log('  ✓ 成功');
    } catch (e) {
      console.log(`  ✗ 失败: ${e.message}`);
    }
  }
  
  // 长难句结构拆解 -> 定语从句专项
  const longSentenceConfig = configResults['02-long-sentence.json'];
  const attrClauseConfig = configResults['03-attributive-clause.json'];
  if (longSentenceConfig && attrClauseConfig) {
    console.log(`「长难句结构拆解」添加子任务「定语从句专项」...`);
    try {
      await patchConfigChildren(longSentenceConfig.id, [
        { config_id: attrClauseConfig.id, label: '定语从句专项', is_recommended: true },
      ]);
      console.log('  ✓ 成功');
    } catch (e) {
      console.log(`  ✗ 失败: ${e.message}`);
    }
  }
  
  // 干扰项类型归因 -> 偷换概念专项
  const distractorConfig = configResults['07-distractor-types.json'];
  const strawManConfig = configResults['08-straw-man.json'];
  if (distractorConfig && strawManConfig) {
    console.log(`「干扰项类型归因」添加子任务「偷换概念专项」...`);
    try {
      await patchConfigChildren(distractorConfig.id, [
        { config_id: strawManConfig.id, label: '偷换概念专项', is_recommended: true },
      ]);
      console.log('  ✓ 成功');
    } catch (e) {
      console.log(`  ✗ 失败: ${e.message}`);
    }
  }
  
  console.log('\n=== 完成 ===');
  console.log('已创建的配置：');
  for (const [key, config] of Object.entries(configResults)) {
    console.log(`  ${config.name}: ${config.id}`);
  }
}

main().catch(console.error);
