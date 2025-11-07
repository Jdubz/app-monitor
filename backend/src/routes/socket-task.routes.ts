import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import type { ConnectionManager } from '../services/connectionManager.js';
import type { TaskQueueManager } from '../services/taskQueueManager.js';

export function createSocketRoutes(connectionManager: ConnectionManager) {
  const router = Router();

  /**
   * Get Socket.IO connection statistics
   */
  router.get('/stats', (_req: Request, res: Response) => {
    try {
      const stats = connectionManager.getStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error({
        category: 'socket',
        action: 'get_stats_error',
        message: 'Failed to get connection stats',
        error
      });
      res.status(500).json({
        error: 'Failed to get connection statistics',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Get all active connections
   */
  router.get('/connections', (_req: Request, res: Response) => {
    try {
      const connections = connectionManager.getAllConnections();
      
      res.json({
        success: true,
        connections: connections.map((conn) => ({
          socketId: conn.socketId,
          connectedAt: conn.connectedAt,
          lastPing: conn.lastPing,
          isHealthy: conn.isHealthy,
          reconnectCount: conn.reconnectCount,
          subscriptions: Array.from(conn.subscriptions),
          monitors: Array.from(conn.monitors),
        })),
        count: connections.length
      });
    } catch (error) {
      logger.error({
        category: 'socket',
        action: 'get_connections_error',
        message: 'Failed to get connections',
        error
      });
      res.status(500).json({
        error: 'Failed to get connections',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Get specific connection details
   */
  router.get('/connections/:socketId', (req: Request, res: Response) => {
    try {
      const { socketId } = req.params;
      const connection = connectionManager.getConnectionInfo(socketId);
      
      if (!connection) {
        res.status(404).json({
          error: 'Connection not found',
          socketId
        });
        return;
      }
      
      res.json({
        success: true,
        connection: {
          socketId: connection.socketId,
          connectedAt: connection.connectedAt,
          lastPing: connection.lastPing,
          isHealthy: connection.isHealthy,
          reconnectCount: connection.reconnectCount,
          subscriptions: Array.from(connection.subscriptions),
          monitors: Array.from(connection.monitors),
        }
      });
    } catch (error) {
      logger.error({
        category: 'socket',
        action: 'get_connection_error',
        message: `Failed to get connection ${req.params.socketId}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get connection',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router;
}

export function createTaskRoutes(taskQueueManager: TaskQueueManager) {
  const router = Router();

  /**
   * Create a new task
   */
  router.post('/', (req: Request, res: Response) => {
    try {
      const task = taskQueueManager.createTask(req.body);
      
      res.status(201).json({
        success: true,
        task
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'create_task_error',
        message: 'Failed to create task',
        error
      });
      res.status(400).json({
        error: 'Failed to create task',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Get all tasks with optional filters
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const query = {
        status: req.query.status as 'pending' | 'assigned' | 'active' | 'completed' | 'failed' | 'retrying' | undefined,
        type: req.query.type as string | undefined,
        assignedAgent: req.query.assigned_agent as string | undefined,
        assignedWorker: req.query.assigned_worker as string | undefined,
        project: req.query.project as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
        sortBy: req.query.sortBy as 'createdAt' | 'priority' | 'status' | undefined,
        sortOrder: req.query.sortOrder as 'asc' | 'desc' | undefined,
      };
      
      const tasks = taskQueueManager.queryTasks(query);
      
      res.json({
        success: true,
        tasks,
        count: tasks.length
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'get_tasks_error',
        message: 'Failed to get tasks',
        error
      });
      res.status(500).json({
        error: 'Failed to get tasks',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Get task by ID
   */
  router.get('/:taskId', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const task = taskQueueManager.getTask(taskId);
      
      if (!task) {
        res.status(404).json({
          error: 'Task not found',
          taskId
        });
        return;
      }
      
      res.json({
        success: true,
        task
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'get_task_error',
        message: `Failed to get task ${req.params.taskId}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get task',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Update task
   */
  router.put('/:taskId', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const task = taskQueueManager.updateTask(taskId, req.body);
      
      res.json({
        success: true,
        task
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'update_task_error',
        message: `Failed to update task ${req.params.taskId}`,
        error
      });
      res.status(400).json({
        error: 'Failed to update task',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Delete task
   */
  router.delete('/:taskId', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      taskQueueManager.deleteTask(taskId);
      
      res.json({
        success: true,
        message: 'Task deleted successfully'
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'delete_task_error',
        message: `Failed to delete task ${req.params.taskId}`,
        error
      });
      res.status(400).json({
        error: 'Failed to delete task',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Update task status
   */
  router.patch('/:taskId/status', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { status } = req.body;
      
      const task = taskQueueManager.updateTask(taskId, { status });
      
      res.json({
        success: true,
        task
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'update_task_status_error',
        message: `Failed to update task status ${req.params.taskId}`,
        error
      });
      res.status(400).json({
        error: 'Failed to update task status',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Retry failed task
   */
  router.post('/:taskId/retry', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      taskQueueManager.retryTask(taskId);
      
      res.json({
        success: true,
        message: 'Task queued for retry'
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'retry_task_error',
        message: `Failed to retry task ${req.params.taskId}`,
        error
      });
      res.status(400).json({
        error: 'Failed to retry task',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Bulk create tasks
   */
  router.post('/bulk', (req: Request, res: Response) => {
    try {
      const { tasks: taskData } = req.body;
      
      if (!Array.isArray(taskData)) {
        res.status(400).json({
          error: 'Invalid request body',
          message: 'Expected array of tasks'
        });
        return;
      }
      
      const tasks = taskData.map((data) => taskQueueManager.createTask(data));
      
      res.status(201).json({
        success: true,
        tasks,
        count: tasks.length
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'bulk_create_tasks_error',
        message: 'Failed to bulk create tasks',
        error
      });
      res.status(400).json({
        error: 'Failed to bulk create tasks',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Get task statistics
   */
  router.get('/stats', (_req: Request, res: Response) => {
    try {
      const stats = taskQueueManager.getStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'get_task_stats_error',
        message: 'Failed to get task statistics',
        error
      });
      res.status(500).json({
        error: 'Failed to get task statistics',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Get task queue state
   */
  router.get('/queue', (_req: Request, res: Response) => {
    try {
      const stats = taskQueueManager.getStats();

      res.json({
        success: true,
        queue: {
          pending: stats.pending,
          active: stats.active,
          completed: stats.completed,
          failed: stats.failed,
        }
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'get_queue_error',
        message: 'Failed to get task queue',
        error
      });
      res.status(500).json({
        error: 'Failed to get task queue',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Clear completed tasks
   */
  router.post('/queue/clear', (req: Request, res: Response) => {
    try {
      const { status } = req.body;

      if (status && !['completed', 'failed', 'all'].includes(status)) {
        res.status(400).json({
          error: 'Invalid status',
          message: 'Status must be completed, failed, or all'
        });
        return;
      }

      let cleared = 0;
      if (status === 'all' || !status) {
        taskQueueManager.clearAll();
        cleared = 0; // clearAll doesn't return count
      } else {
        // Clear specific status tasks
        const tasksToDelete = taskQueueManager.queryTasks({
          status: status as 'completed' | 'failed'
        });
        tasksToDelete.forEach(task => {
          if (taskQueueManager.deleteTask(task.id)) {
            cleared++;
          }
        });
      }

      res.json({
        success: true,
        cleared,
        message: `Cleared ${cleared} ${status || 'completed'} tasks`
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'clear_queue_error',
        message: 'Failed to clear task queue',
        error
      });
      res.status(500).json({
        error: 'Failed to clear task queue',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router;
}
