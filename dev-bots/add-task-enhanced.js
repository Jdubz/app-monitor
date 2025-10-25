#!/usr/bin/env node

/**
 * Enhanced Task Addition Tool
 * 
 * Provides a CLI interface to add tasks to the enhanced coordinator system
 * Supports all task types and agent personalities
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Task types and their descriptions
const TASK_TYPES = {
  'implementation': 'General implementation task',
  'api-development': 'API development and integration',
  'ui-development': 'User interface development',
  'review': 'Code review and quality assurance',
  'testing': 'Test development and execution',
  'documentation': 'Documentation and technical writing',
  'deployment': 'Deployment and infrastructure',
  'security-analysis': 'Security review and analysis',
  'performance-optimization': 'Performance improvement',
  'bug-fix': 'Bug fixing and debugging'
};

// Agent personalities
const AGENT_PERSONALITIES = {
  'backend-specialist': 'Alex - Backend Development & API Implementation',
  'frontend-specialist': 'Sam - Frontend Development & User Interface',
  'review-specialist': 'Casey - Code Quality & Security Review',
  'testing-specialist': 'Taylor - Test Development & Quality Assurance',
  'devops-specialist': 'Jordan - Infrastructure & Deployment',
  'documentation-specialist': 'Morgan - Technical Writing & Documentation'
};

// Priority levels
const PRIORITIES = {
  'high': 'High priority - urgent task',
  'medium': 'Medium priority - normal task',
  'low': 'Low priority - can wait'
};

class TaskAdder {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async addTask() {
    console.log('🚀 Enhanced Claude Worker Task Addition Tool\n');
    
    try {
      const taskData = await this.collectTaskData();
      await this.saveTask(taskData);
      console.log('\n✅ Task added successfully!');
      console.log(`Task ID: ${taskData.id}`);
      console.log(`Assigned Agent: ${AGENT_PERSONALITIES[taskData.assignedAgent] || 'Auto-assigned'}`);
    } catch (error) {
      console.error('\n❌ Error adding task:', error.message);
    } finally {
      this.rl.close();
    }
  }

  async collectTaskData() {
    const taskData = {
      id: this.generateTaskId(),
      type: await this.selectTaskType(),
      priority: await this.selectPriority(),
      description: await this.getDescription(),
      files: await this.getFiles(),
      dependencies: await this.getDependencies(),
      repository: await this.getRepository(),
      assignedAgent: await this.selectAgent(),
      createdAt: new Date().toISOString()
    };

    // Add type-specific fields
    if (taskData.type === 'review') {
      taskData.reviewType = await this.selectReviewType();
    } else if (taskData.type === 'testing') {
      taskData.testType = await this.selectTestType();
      taskData.testScope = await this.selectTestScope();
    } else if (taskData.type === 'documentation') {
      taskData.documentationType = await this.selectDocumentationType();
    }

    return taskData;
  }

  async selectTaskType() {
    console.log('\n📋 Select Task Type:');
    const types = Object.entries(TASK_TYPES);
    types.forEach(([key, desc], index) => {
      console.log(`  ${index + 1}. ${key} - ${desc}`);
    });

    const choice = await this.askQuestion('\nEnter task type (number or name): ');
    
    // Try to parse as number first
    const numChoice = parseInt(choice);
    if (numChoice >= 1 && numChoice <= types.length) {
      return types[numChoice - 1][0];
    }
    
    // Try to match by name
    const typeKey = Object.keys(TASK_TYPES).find(key => 
      key.toLowerCase() === choice.toLowerCase()
    );
    
    if (typeKey) {
      return typeKey;
    }
    
    throw new Error('Invalid task type selected');
  }

  async selectPriority() {
    console.log('\n⚡ Select Priority:');
    const priorities = Object.entries(PRIORITIES);
    priorities.forEach(([key, desc], index) => {
      console.log(`  ${index + 1}. ${key} - ${desc}`);
    });

    const choice = await this.askQuestion('\nEnter priority (number or name): ');
    
    // Try to parse as number first
    const numChoice = parseInt(choice);
    if (numChoice >= 1 && numChoice <= priorities.length) {
      return priorities[numChoice - 1][0];
    }
    
    // Try to match by name
    const priorityKey = Object.keys(PRIORITIES).find(key => 
      key.toLowerCase() === choice.toLowerCase()
    );
    
    if (priorityKey) {
      return priorityKey;
    }
    
    return 'medium'; // Default
  }

  async getDescription() {
    return await this.askQuestion('\n📝 Enter task description: ');
  }

  async getFiles() {
    const filesInput = await this.askQuestion('\n📁 Enter files to modify (comma-separated, or press Enter to skip): ');
    return filesInput.trim() ? filesInput.split(',').map(f => f.trim()) : [];
  }

  async getDependencies() {
    const depsInput = await this.askQuestion('\n🔗 Enter dependencies (comma-separated, or press Enter to skip): ');
    return depsInput.trim() ? depsInput.split(',').map(d => d.trim()) : [];
  }

  async getRepository() {
    const repo = await this.askQuestion('\n📦 Enter repository (default: job-finder-app-manager): ');
    return repo.trim() || 'job-finder-app-manager';
  }

  async selectAgent() {
    console.log('\n🤖 Select Agent (or press Enter for auto-assignment):');
    const agents = Object.entries(AGENT_PERSONALITIES);
    agents.forEach(([key, desc], index) => {
      console.log(`  ${index + 1}. ${key} - ${desc}`);
    });
    console.log(`  ${agents.length + 1}. auto - Auto-assign based on task type`);

    const choice = await this.askQuestion('\nEnter agent (number, name, or press Enter for auto): ');
    
    if (!choice.trim()) {
      return 'auto';
    }
    
    // Try to parse as number first
    const numChoice = parseInt(choice);
    if (numChoice >= 1 && numChoice <= agents.length) {
      return agents[numChoice - 1][0];
    }
    if (numChoice === agents.length + 1) {
      return 'auto';
    }
    
    // Try to match by name
    const agentKey = Object.keys(AGENT_PERSONALITIES).find(key => 
      key.toLowerCase() === choice.toLowerCase()
    );
    
    if (agentKey) {
      return agentKey;
    }
    
    if (choice.toLowerCase() === 'auto') {
      return 'auto';
    }
    
    return 'auto'; // Default to auto-assignment
  }

  async selectReviewType() {
    const reviewTypes = ['code_quality', 'security', 'performance', 'testing'];
    console.log('\n🔍 Select Review Type:');
    reviewTypes.forEach((type, index) => {
      console.log(`  ${index + 1}. ${type}`);
    });

    const choice = await this.askQuestion('\nEnter review type (number or name): ');
    
    const numChoice = parseInt(choice);
    if (numChoice >= 1 && numChoice <= reviewTypes.length) {
      return reviewTypes[numChoice - 1];
    }
    
    const typeKey = reviewTypes.find(type => 
      type.toLowerCase() === choice.toLowerCase()
    );
    
    return typeKey || 'code_quality';
  }

  async selectTestType() {
    const testTypes = ['unit', 'integration', 'e2e'];
    console.log('\n🧪 Select Test Type:');
    testTypes.forEach((type, index) => {
      console.log(`  ${index + 1}. ${type}`);
    });

    const choice = await this.askQuestion('\nEnter test type (number or name): ');
    
    const numChoice = parseInt(choice);
    if (numChoice >= 1 && numChoice <= testTypes.length) {
      return testTypes[numChoice - 1];
    }
    
    const typeKey = testTypes.find(type => 
      type.toLowerCase() === choice.toLowerCase()
    );
    
    return typeKey || 'unit';
  }

  async selectTestScope() {
    const testScopes = ['comprehensive', 'focused', 'critical'];
    console.log('\n🎯 Select Test Scope:');
    testScopes.forEach((scope, index) => {
      console.log(`  ${index + 1}. ${scope}`);
    });

    const choice = await this.askQuestion('\nEnter test scope (number or name): ');
    
    const numChoice = parseInt(choice);
    if (numChoice >= 1 && numChoice <= testScopes.length) {
      return testScopes[numChoice - 1];
    }
    
    const scopeKey = testScopes.find(scope => 
      scope.toLowerCase() === choice.toLowerCase()
    );
    
    return scopeKey || 'comprehensive';
  }

  async selectDocumentationType() {
    const docTypes = ['api', 'user-guide', 'technical', 'readme'];
    console.log('\n📚 Select Documentation Type:');
    docTypes.forEach((type, index) => {
      console.log(`  ${index + 1}. ${type}`);
    });

    const choice = await this.askQuestion('\nEnter documentation type (number or name): ');
    
    const numChoice = parseInt(choice);
    if (numChoice >= 1 && numChoice <= docTypes.length) {
      return docTypes[numChoice - 1];
    }
    
    const typeKey = docTypes.find(type => 
      type.toLowerCase() === choice.toLowerCase()
    );
    
    return typeKey || 'api';
  }

  async saveTask(taskData) {
    // Ensure data directory exists
    const dataDir = './data/tasks';
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Load existing tasks
    const tasksFile = path.join(dataDir, 'tasks.json');
    let existingTasks = { tasks: [] };
    
    if (fs.existsSync(tasksFile)) {
      try {
        const data = fs.readFileSync(tasksFile, 'utf-8');
        existingTasks = JSON.parse(data);
      } catch (error) {
        console.warn('Warning: Could not load existing tasks, starting fresh');
      }
    }

    // Add new task
    existingTasks.tasks.push(taskData);
    existingTasks.lastUpdated = new Date().toISOString();

    // Save back to file
    fs.writeFileSync(tasksFile, JSON.stringify(existingTasks, null, 2));
    
    console.log(`\n💾 Task saved to ${tasksFile}`);
  }

  generateTaskId() {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  askQuestion(question) {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }
}

// Main execution
if (require.main === module) {
  const taskAdder = new TaskAdder();
  taskAdder.addTask().catch(console.error);
}

module.exports = TaskAdder;
