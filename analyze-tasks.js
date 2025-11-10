const tasks1 = require('./pr-pipeline-enhancement-tasks.json');
const tasks2 = require('./bot-tasks-v2.json');
const config1 = require('./backend/config/tasks/tc2-1-save-creation-context.json');
const config2 = require('./backend/config/tasks/tc2-tc3-context-api.json');

console.log('=== ANALYSIS ===\n');

console.log('pr-pipeline-enhancement-tasks.json (3 tasks):');
tasks1.forEach((t, i) => {
  console.log(`  ${i+1}. ${t.title}`);
  console.log(`     - Type: ${t.type}`);
  console.log(`     - Version: ${t.metadata?.promptEngineeringVersion || 'N/A'}`);
  console.log(`     - Has investigation: ${!!t.investigation}`);
  console.log(`     - Has constraints: ${!!t.constraints}`);
});

console.log('\nbot-tasks-v2.json (1 task):');
tasks2.forEach((t, i) => {
  console.log(`  ${i+1}. ${t.title}`);
  console.log(`     - Type: ${t.type}`);
  console.log(`     - Has stepByStepInstructions: ${!!t.stepByStepInstructions}`);
  console.log(`     - Has investigation: ${!!t.investigation}`);
});

console.log('\ntc2-1-save-creation-context.json (1 task):');
console.log(`  1. ${config1.title}`);
console.log(`     - Type: ${config1.type}`);
console.log(`     - Estimated: ${config1.estimatedEffort?.hours}h`);

console.log('\ntc2-tc3-context-api.json (1 task):');
console.log(`  2. ${config2.title}`);
console.log(`     - Type: ${config2.type}`);
console.log(`     - Estimated: ${config2.estimatedEffort?.hours}h`);

console.log('\n=== DUPLICATES ===');
console.log('Webhook HMAC task appears in BOTH:');
console.log('  - pr-pipeline-enhancement-tasks.json[0]');
console.log('  - bot-tasks-v2.json[0]');
console.log('\nWhich is better format?');
console.log('  pr-pipeline: Has proper v3 metadata, investigation, constraints');
console.log('  bot-tasks-v2: Has stepByStepInstructions but missing v3 structure');
console.log('  WINNER: pr-pipeline-enhancement-tasks.json');
