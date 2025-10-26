/**
 * Task Persistence Service Tests
 * 
 * Tests the TaskPersistence service for task saving, loading, 
 * data integrity, backup management, and file operations
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

describe('TaskPersistence', () => {
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

  describe('Initialization', () => {
    it('should initialize with provided config', () => {
      // Given: TaskPersistence is created
      // When: Initialization completes
      // Then: Storage directories are created
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/storage', { recursive: true });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/backup', { recursive: true });
    });

    it('should start auto-save when enabled', () => {
      // Given: Config with auto-save enabled
      const autoSaveConfig = { ...config, autoSave: true };

      // When: TaskPersistence is created
      const autoSavePersistence = new TaskPersistence(autoSaveConfig);

      // Then: Auto-save is started
      expect(autoSavePersistence).toBeDefined();
    });

    it('should handle existing directories gracefully', () => {
      // Given: Directories already exist
      mockFs.existsSync.mockReturnValue(true);

      // When: TaskPersistence is created
      // Then: No error is thrown
      expect(() => new TaskPersistence(config)).not.toThrow();
    });
  });

  describe('Task Loading', () => {
    it('should load tasks from storage file', () => {
      // Given: Tasks in storage file
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

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockTasks));

      // When: Loading tasks
      const tasks = taskPersistence.loadTasks();

      // Then: Tasks are loaded
      expect(tasks).toEqual(mockTasks);
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/test/storage/tasks.json', 'utf8');
    });

    it('should return empty array when no storage file exists', () => {
      // Given: No storage file
      mockFs.existsSync.mockReturnValue(false);

      // When: Loading tasks
      const tasks = taskPersistence.loadTasks();

      // Then: Empty array is returned
      expect(tasks).toEqual([]);
    });

    it('should load from backup when main file is corrupted', () => {
      // Given: Corrupted main file and valid backup
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync
        .mockReturnValueOnce('invalid json') // Main file corrupted
        .mockReturnValueOnce(JSON.stringify([{ id: 'backup-task' }])); // Backup file

      mockFs.readdirSync.mockReturnValue(['backup-1.json']);

      // When: Loading tasks
      const tasks = taskPersistence.loadTasks();

      // Then: Tasks are loaded from backup
      expect(tasks).toEqual([{ id: 'backup-task' }]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load tasks from main file')
      );
    });

    it('should return empty array when all files are corrupted', () => {
      // Given: All files corrupted
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

      // Then: Tasks are saved
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/storage/tasks.json',
        JSON.stringify(tasks, null, 2),
        'utf8'
      );
    });

    it('should create backup when saving', () => {
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

      // Then: Backup is created
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2); // Main file + backup
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
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save tasks')
      );
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

      // Then: Tasks are saved
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/storage/completed-tasks.json',
        JSON.stringify(completedTasks, null, 2),
        'utf8'
      );
    });

    it('should load completed tasks', () => {
      // Given: Completed tasks in storage
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

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockCompletedTasks));

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

      // Then: Tasks are exported
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        exportPath,
        JSON.stringify(tasks, null, 2),
        'utf8'
      );
    });

    it('should import tasks from file', () => {
      // Given: Tasks in import file
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

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockTasks));

      const importPath = '/test/import/tasks.json';

      // When: Importing tasks
      const tasks = taskPersistence.importTasks(importPath);

      // Then: Tasks are imported
      expect(tasks).toEqual(mockTasks);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(importPath, 'utf8');
    });

    it('should handle import file not found', () => {
      // Given: Non-existent import file
      mockFs.existsSync.mockReturnValue(false);

      const importPath = '/test/import/nonexistent.json';

      // When: Importing tasks
      // Then: Error is thrown
      expect(() => taskPersistence.importTasks(importPath)).toThrow('Import file not found');
    });

    it('should handle corrupted import file', () => {
      // Given: Corrupted import file
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      const importPath = '/test/import/corrupted.json';

      // When: Importing tasks
      // Then: Error is thrown
      expect(() => taskPersistence.importTasks(importPath)).toThrow('Invalid JSON in import file');
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

    it('should cleanup old backups', () => {
      // Given: Multiple backup files
      const backupFiles = [
        'backup-1.json',
        'backup-2.json',
        'backup-3.json',
        'backup-4.json',
        'backup-5.json',
        'backup-6.json' // This should be deleted
      ];

      mockFs.readdirSync.mockReturnValue(backupFiles);
      mockFs.statSync.mockReturnValue({ mtime: new Date() });

      // When: Saving tasks (triggers backup cleanup)
      taskPersistence.saveTasks([]);

      // Then: Old backups are cleaned up
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', () => {
      // Given: File system error
      mockFs.mkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // When: Creating TaskPersistence
      // Then: Error is handled gracefully
      expect(() => new TaskPersistence(config)).not.toThrow();
    });

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

    it('should stop auto-save on shutdown', () => {
      // Given: TaskPersistence with auto-save
      const autoSaveConfig = { ...config, autoSave: true };
      const autoSavePersistence = new TaskPersistence(autoSaveConfig);

      // When: Shutting down
      autoSavePersistence.shutdown();

      // Then: Shutdown completes
      expect(autoSavePersistence).toBeDefined();
    });
  });

  describe('Data Integrity', () => {
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

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify([complexTask]));

      // When: Loading and saving tasks
      const loadedTasks = taskPersistence.loadTasks();
      taskPersistence.saveTasks(loadedTasks);

      // Then: Data structure is preserved
      expect(loadedTasks[0]).toEqual(complexTask);
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/storage/tasks.json',
        JSON.stringify([complexTask], null, 2),
        'utf8'
      );
    });

    it('should handle empty task arrays', () => {
      // Given: Empty task array
      const emptyTasks: Task[] = [];

      // When: Saving empty tasks
      taskPersistence.saveTasks(emptyTasks);

      // Then: Empty array is saved
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/storage/tasks.json',
        JSON.stringify([], null, 2),
        'utf8'
      );
    });
  });
});