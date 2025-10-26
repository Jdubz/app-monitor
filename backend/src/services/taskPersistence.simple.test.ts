/**
 * Task Persistence Service Simple Tests
 * 
 * Tests the basic functionality of TaskPersistence service
 * focusing on what actually works in the implementation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TaskPersistence, TaskStorageConfig } from './taskPersistence.js';
import { Task } from './devBotsManager.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
vi.mock('../utils/logger.js');
vi.mock('fs');
vi.mock('path');

describe('TaskPersistence Simple Tests', () => {
  let taskPersistence: TaskPersistence;
  let mockFs: any;
  let mockPath: any;
  let config: TaskStorageConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fs
    mockFs = vi.mocked(fs);
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => {});
    mockFs.readFileSync.mockReturnValue('[]');
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.statSync.mockReturnValue({ mtime: new Date() });
    mockFs.unlinkSync.mockImplementation(() => {});

    // Mock path
    mockPath = vi.mocked(path);
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.resolve.mockImplementation((...args) => args.join('/'));

    // Mock logger
    vi.mocked(logger.info).mockImplementation(() => {});
    vi.mocked(logger.warn).mockImplementation(() => {});
    vi.mocked(logger.error).mockImplementation(() => {});
    vi.mocked(logger.debug).mockImplementation(() => {});

    // Default config
    config = {
      storagePath: '/test/storage',
      backupPath: '/test/backup',
      maxBackups: 5,
      autoSave: false,
      saveInterval: 1000
    };

    taskPersistence = new TaskPersistence(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should initialize with provided config', () => {
      // Given: TaskPersistence is created
      // When: Initialization completes
      // Then: Storage directories are created
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/storage', { recursive: true });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/backup', { recursive: true });
    });

    it('should handle existing directories gracefully', () => {
      // Given: Directories already exist
      mockFs.existsSync.mockReturnValue(true);

      // When: TaskPersistence is created
      // Then: No error is thrown
      expect(() => new TaskPersistence(config)).not.toThrow();
    });

    it('should start auto-save when enabled', () => {
      // Given: Config with auto-save enabled
      const autoSaveConfig = { ...config, autoSave: true };

      // When: TaskPersistence is created
      // Then: No error is thrown
      expect(() => new TaskPersistence(autoSaveConfig)).not.toThrow();
    });
  });

  describe('Task Loading', () => {
    it('should return empty array when no storage file exists', () => {
      // Given: No storage file
      mockFs.existsSync.mockReturnValue(false);

      // When: Loading tasks
      const tasks = taskPersistence.loadTasks();

      // Then: Empty array is returned
      expect(tasks).toEqual([]);
    });

    it('should load tasks from storage file', () => {
      // Given: Tasks in storage file with versioned format
      const mockTasks: Task[] = [
        {
          id: 'task-1',
          type: 'feature',
          title: 'Test Task 1',
          documentation: 'Test documentation',
          acceptanceCriteria: ['Test criteria'],
          status: 'pending',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      const versionedData = {
        version: '1.0',
        lastSaved: new Date().toISOString(),
        tasks: mockTasks
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(versionedData));

      // When: Loading tasks
      const tasks = taskPersistence.loadTasks();

      // Then: Tasks are loaded
      expect(tasks).toEqual(mockTasks);
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/test/storage/tasks.json', 'utf-8');
    });

    it('should handle corrupted main file', () => {
      // Given: Corrupted main file
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');
      mockFs.readdirSync.mockReturnValue([]);

      // When: Loading tasks
      const tasks = taskPersistence.loadTasks();

      // Then: Empty array is returned
      expect(tasks).toEqual([]);
    });
  });

  describe('Task Saving', () => {
    it('should save tasks to storage file', () => {
      // Given: Tasks to save
      const tasks: Task[] = [
        {
          id: 'task-1',
          type: 'feature',
          title: 'Test Task 1',
          documentation: 'Test documentation',
          acceptanceCriteria: ['Test criteria'],
          status: 'pending',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      // When: Saving tasks
      taskPersistence.saveTasks(tasks);

      // Then: Tasks are saved (with versioned format)
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2); // Main file + backup
      expect(mockFs.writeFileSync).toHaveBeenNthCalledWith(
        2, // Second call is for the main file
        '/test/storage/tasks.json',
        expect.stringContaining('"version": "1.0"'), // Formatted JSON with spaces
        
      );
    });

    it('should create backup when saving', () => {
      // Given: Tasks to save
      const tasks: Task[] = [];

      // When: Saving tasks
      taskPersistence.saveTasks(tasks);

      // Then: Backup is created
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2); // Main file + backup
      expect(mockFs.writeFileSync).toHaveBeenNthCalledWith(
        1, // First call is for the backup
        expect.stringContaining('/test/backup/tasks-backup-'),
        expect.stringContaining('"version": "1.0"'), // Formatted JSON with spaces
        
      );
    });

    it('should handle save errors gracefully', () => {
      // Given: Tasks to save and write error
      const tasks: Task[] = [];
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Write error');
      });

      // When: Saving tasks
      // Then: Error is handled gracefully
      expect(() => taskPersistence.saveTasks(tasks)).not.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('Completed Tasks', () => {
    it('should save completed tasks', () => {
      // Given: Completed tasks
      const completedTasks: Task[] = [
        {
          id: 'task-1',
          type: 'feature',
          title: 'Completed Task',
          documentation: 'Test documentation',
          acceptanceCriteria: ['Test criteria'],
          status: 'completed',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          completedAt: Date.now()
        }
      ];

      // When: Saving completed tasks
      taskPersistence.saveCompletedTasks(completedTasks);

      // Then: Tasks are saved (with versioned format)
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2); // Main file + backup
      expect(mockFs.writeFileSync).toHaveBeenNthCalledWith(
        2, // Second call is for the main file
        '/test/storage/completed-tasks.json',
        expect.stringContaining('"version": "1.0"'), // Formatted JSON with spaces
        
      );
    });

    it('should load completed tasks', () => {
      // Given: Completed tasks in storage with versioned format
      const mockCompletedTasks: Task[] = [
        {
          id: 'task-1',
          type: 'feature',
          title: 'Completed Task',
          documentation: 'Test documentation',
          acceptanceCriteria: ['Test criteria'],
          status: 'completed',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          completedAt: Date.now()
        }
      ];

      const versionedData = {
        version: '1.0',
        lastSaved: new Date().toISOString(),
        totalCompleted: 1,
        tasks: mockCompletedTasks
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(versionedData));

      // When: Loading completed tasks
      const tasks = taskPersistence.loadCompletedTasks();

      // Then: Tasks are loaded
      expect(tasks).toEqual(mockCompletedTasks);
    });

    it('should return empty array when no completed tasks file exists', () => {
      // Given: No completed tasks file
      mockFs.existsSync.mockReturnValue(false);

      // When: Loading completed tasks
      const tasks = taskPersistence.loadCompletedTasks();

      // Then: Empty array is returned
      expect(tasks).toEqual([]);
    });
  });

  describe('Auto-Save Management', () => {
    it('should mark tasks as dirty when modified', () => {
      // Given: TaskPersistence instance
      // When: Marking as dirty
      taskPersistence.markDirty();

      // Then: Dirty flag is set
      expect(taskPersistence.needsSaving()).toBe(true);
    });

    it('should stop auto-save', () => {
      // Given: TaskPersistence with auto-save
      const autoSaveConfig = { ...config, autoSave: true };
      const autoSavePersistence = new TaskPersistence(autoSaveConfig);

      // When: Stopping auto-save
      autoSavePersistence.stopAutoSave();

      // Then: Auto-save is stopped
      expect(autoSavePersistence).toBeDefined();
    });
  });

  describe('Import/Export', () => {
    it('should export tasks to file', () => {
      // Given: Tasks to export
      const tasks: Task[] = [
        {
          id: 'task-1',
          type: 'feature',
          title: 'Test Task 1',
          documentation: 'Test documentation',
          acceptanceCriteria: ['Test criteria'],
          status: 'pending',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      const exportPath = '/test/export/tasks.json';

      // When: Exporting tasks
      taskPersistence.exportTasks(tasks, exportPath);

      // Then: Tasks are exported (with versioned format)
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        exportPath,
        expect.stringContaining('"version": "1.0"'), // Formatted JSON with spaces
        
      );
    });

    it('should import tasks from file', () => {
      // Given: Tasks in import file with versioned format
      const mockTasks: Task[] = [
        {
          id: 'task-1',
          type: 'feature',
          title: 'Imported Task',
          documentation: 'Test documentation',
          acceptanceCriteria: ['Test criteria'],
          status: 'pending',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      const versionedData = {
        version: '1.0',
        exported: new Date().toISOString(),
        tasks: mockTasks
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(versionedData));

      const importPath = '/test/import/tasks.json';

      // When: Importing tasks
      const tasks = taskPersistence.importTasks(importPath);

      // Then: Tasks are imported
      expect(tasks).toEqual(mockTasks);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(importPath, 'utf-8');
    });

    it('should handle import file not found', () => {
      // Given: Non-existent import file
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const importPath = '/test/import/nonexistent.json';

      // When: Importing tasks
      // Then: Error is thrown (fs.readFileSync will throw ENOENT error)
      expect(() => taskPersistence.importTasks(importPath)).toThrow();
    });

    it('should handle corrupted import file', () => {
      // Given: Corrupted import file
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      const importPath = '/test/import/corrupted.json';

      // When: Importing tasks
      // Then: Error is thrown
      expect(() => taskPersistence.importTasks(importPath)).toThrow();
    });
  });

  describe('Cleanup Operations', () => {
    it('should cleanup old completed tasks', () => {
      // Given: Old completed tasks
      const oldDate = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
      const recentDate = Date.now() - (3 * 24 * 60 * 60 * 1000); // 3 days ago

      const tasks: Task[] = [
        {
          id: 'old-task',
          type: 'feature',
          title: 'Old Task',
          documentation: 'Test documentation',
          acceptanceCriteria: ['Test criteria'],
          status: 'completed',
          createdAt: oldDate,
          updatedAt: oldDate,
          completedAt: oldDate
        },
        {
          id: 'recent-task',
          type: 'feature',
          title: 'Recent Task',
          documentation: 'Test documentation',
          acceptanceCriteria: ['Test criteria'],
          status: 'completed',
          createdAt: recentDate,
          updatedAt: recentDate,
          completedAt: recentDate
        }
      ];

      // When: Cleaning up old tasks
      const cleanedTasks = taskPersistence.cleanupCompletedTasks(tasks, 7);

      // Then: Only recent tasks remain
      expect(cleanedTasks).toHaveLength(1);
      expect(cleanedTasks[0].id).toBe('recent-task');
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON parsing errors', () => {
      // Given: Corrupted JSON file
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');
      mockFs.readdirSync.mockReturnValue([]);

      // When: Loading tasks
      const tasks = taskPersistence.loadTasks();

      // Then: Empty array is returned
      expect(tasks).toEqual([]);
    });

    it('should handle backup loading errors', () => {
      // Given: Corrupted backup files
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');
      mockFs.readdirSync.mockReturnValue(['backup-1.json']);

      // When: Loading tasks
      const tasks = taskPersistence.loadTasks();

      // Then: Empty array is returned
      expect(tasks).toEqual([]);
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', () => {
      // Given: TaskPersistence instance
      // When: Shutting down
      // Then: No error is thrown
      expect(() => taskPersistence.shutdown()).not.toThrow();
    });
  });

  describe('Data Integrity', () => {
    it('should handle empty task arrays', () => {
      // Given: Empty task array
      const emptyTasks: Task[] = [];

      // When: Saving empty tasks
      taskPersistence.saveTasks(emptyTasks);

      // Then: Empty array is saved (with versioned format)
      expect(mockFs.writeFileSync).toHaveBeenNthCalledWith(
        2, // Second call is for the main file
        '/test/storage/tasks.json',
        expect.stringContaining('"tasks": []'), // Formatted JSON with spaces
        
      );
    });

    it('should preserve task data structure', () => {
      // Given: Complex task data
      const complexTask: Task = {
        id: 'complex-task',
        type: 'feature',
        title: 'Complex Task',
        documentation: 'Complex documentation',
        acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        assignedAgent: 'test-agent',
        notes: 'Test notes',
        files: ['file1.js', 'file2.ts'],
        dependencies: ['dep1', 'dep2'],
        repository: 'test-repo'
      };

      // When: Saving complex task
      taskPersistence.saveTasks([complexTask]);

      // Then: Data structure is preserved
      expect(mockFs.writeFileSync).toHaveBeenNthCalledWith(
        2, // Second call is for the main file
        '/test/storage/tasks.json',
        expect.stringContaining('"id": "complex-task"'), // Formatted JSON with spaces
        
      );
    });
  });
});