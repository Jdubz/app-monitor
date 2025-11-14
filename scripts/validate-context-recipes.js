#!/usr/bin/env node
/**
 * Context Recipe Validation Script
 * 
 * Validates YAML context recipes against the schema defined in
 * backend/src/types/contextRecipe.ts
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Expected recipe structure
const REQUIRED_FIELDS = ['profile', 'version', 'description', 'taskTypes', 'sources', 'outputs'];
const VALID_TASK_TYPES = ['implementation', 'fix', 'review', 'deployment', 'pr-follow-up', 'analysis'];
const VALID_SOURCE_TYPES = ['code', 'markdown', 'json', 'yaml', 'config', 'text'];
const VALID_TRANSFORMS = ['none', 'summarize', 'strip-comments', 'minify', 'bullet-list'];
const VALID_OUTPUT_FORMATS = ['markdown', 'json', 'text', 'yaml'];

function validateRecipe(recipePath) {
  const errors = [];
  const warnings = [];
  
  try {
    const content = fs.readFileSync(recipePath, 'utf8');
    const recipe = yaml.parse(content);
    
    // Check required fields
    for (const field of REQUIRED_FIELDS) {
      if (!(field in recipe)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }
    
    // Validate profile name
    if (typeof recipe.profile !== 'string' || recipe.profile.length === 0) {
      errors.push('Profile must be a non-empty string');
    }
    
    // Validate version
    if (!/^\d+\.\d+$/.test(recipe.version)) {
      warnings.push(`Version "${recipe.version}" should follow semantic versioning (e.g., "1.0")`);
    }
    
    // Validate taskTypes
    if (!Array.isArray(recipe.taskTypes) || recipe.taskTypes.length === 0) {
      errors.push('taskTypes must be a non-empty array');
    } else {
      for (const taskType of recipe.taskTypes) {
        if (!VALID_TASK_TYPES.includes(taskType)) {
          errors.push(`Invalid task type: ${taskType}. Must be one of: ${VALID_TASK_TYPES.join(', ')}`);
        }
      }
    }
    
    // Validate size limits (if present)
    if (recipe.sizeLimit) {
      if (typeof recipe.sizeLimit.maxBytes !== 'number' || recipe.sizeLimit.maxBytes <= 0) {
        warnings.push('sizeLimit.maxBytes should be a positive number');
      }
      if (recipe.sizeLimit.maxInlineBytes && recipe.sizeLimit.maxInlineBytes > recipe.sizeLimit.maxBytes) {
        warnings.push('sizeLimit.maxInlineBytes should not exceed maxBytes');
      }
    }
    
    // Validate investigationSteps (if present)
    if (recipe.investigationSteps) {
      if (!Array.isArray(recipe.investigationSteps)) {
        errors.push('investigationSteps must be an array');
      } else if (recipe.investigationSteps.length === 0) {
        warnings.push('investigationSteps is empty - consider adding investigation guidance');
      }
    }
    
    // Validate constraints (if present)
    if (recipe.constraints) {
      if (!Array.isArray(recipe.constraints)) {
        errors.push('constraints must be an array');
      } else if (recipe.constraints.length === 0) {
        warnings.push('constraints is empty - consider adding scope boundaries');
      }
    }
    
    // Validate sources
    if (!Array.isArray(recipe.sources) || recipe.sources.length === 0) {
      errors.push('sources must be a non-empty array');
    } else {
      recipe.sources.forEach((source, i) => {
        if (!source.type) {
          errors.push(`Source ${i}: missing type field`);
        } else if (!VALID_SOURCE_TYPES.includes(source.type)) {
          errors.push(`Source ${i}: invalid type "${source.type}". Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`);
        }
        
        if (!source.path) {
          errors.push(`Source ${i}: missing path field`);
        }
        
        if (source.transform && !VALID_TRANSFORMS.includes(source.transform)) {
          errors.push(`Source ${i}: invalid transform "${source.transform}". Must be one of: ${VALID_TRANSFORMS.join(', ')}`);
        }
      });
    }
    
    // Validate outputs
    if (!recipe.outputs) {
      errors.push('outputs field is required');
    } else {
      if (!recipe.outputs.format || !VALID_OUTPUT_FORMATS.includes(recipe.outputs.format)) {
        errors.push(`outputs.format must be one of: ${VALID_OUTPUT_FORMATS.join(', ')}`);
      }
      if (!recipe.outputs.filename) {
        errors.push('outputs.filename is required');
      }
    }
    
    return { valid: errors.length === 0, errors, warnings };
    
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to parse YAML: ${error.message}`],
      warnings: []
    };
  }
}

function main() {
  const recipesDir = path.join(__dirname, '..', 'config', 'context-recipes');
  
  if (!fs.existsSync(recipesDir)) {
    console.error('❌ Context recipes directory not found:', recipesDir);
    process.exit(1);
  }
  
  const files = fs.readdirSync(recipesDir).filter(f => f.endsWith('.yaml'));
  
  if (files.length === 0) {
    console.error('❌ No recipe files found in:', recipesDir);
    process.exit(1);
  }
  
  console.log('🔍 Validating context recipes...\n');
  
  let allValid = true;
  const results = [];
  
  for (const file of files) {
    const recipePath = path.join(recipesDir, file);
    const result = validateRecipe(recipePath);
    
    results.push({ file, ...result });
    
    if (result.valid) {
      console.log(`✅ ${file}`);
      if (result.warnings.length > 0) {
        result.warnings.forEach(w => console.log(`   ⚠️  ${w}`));
      }
    } else {
      allValid = false;
      console.log(`❌ ${file}`);
      result.errors.forEach(e => console.log(`   ✗ ${e}`));
      if (result.warnings.length > 0) {
        result.warnings.forEach(w => console.log(`   ⚠️  ${w}`));
      }
    }
    console.log('');
  }
  
  // Summary
  const validCount = results.filter(r => r.valid).length;
  const totalCount = results.length;
  
  console.log('━'.repeat(60));
  console.log(`Summary: ${validCount}/${totalCount} recipes valid`);
  
  if (allValid) {
    console.log('✅ All context recipes are valid!');
    process.exit(0);
  } else {
    console.log('❌ Some recipes have validation errors. Please fix them.');
    process.exit(1);
  }
}

main();
