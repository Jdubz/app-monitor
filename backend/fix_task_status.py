#!/usr/bin/env python3
"""Fix TaskStatus type in devBotsManager.ts"""

import re

# Read the file
with open('src/services/devBotsManager.ts', 'r') as f:
    content = f.read()

# Add TaskStatus type definition after WorkerInfo interface (after the closing brace and newline)
# Find the WorkerInfo interface closing and add TaskStatus after it
pattern = r'(export interface WorkerInfo \{[^}]+\})\s*\n\s*\n(export interface Task \{)'
replacement = r'\1\n\nexport type TaskStatus = \'pending\' | \'assigned\' | \'active\' | \'completed\' | \'failed\' | \'retrying\';\n\n\2'

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# Replace inline status type with TaskStatus
content = re.sub(
    r"status: 'pending' \| 'assigned' \| 'active' \| 'completed' \| 'failed' \| 'retrying';",
    "status: TaskStatus;",
    content
)

# Write back
with open('src/services/devBotsManager.ts', 'w') as f:
    f.write(content)

print("✅ Fixed TaskStatus type definition")
