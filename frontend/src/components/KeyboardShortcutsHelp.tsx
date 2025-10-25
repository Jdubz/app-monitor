import { useEffect } from 'react';
import styles from './KeyboardShortcutsHelp.module.css';

interface Shortcut {
  keys: string;
  description: string;
  category?: string;
}

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcuts: Shortcut[] = [
    // Global
    { keys: 'Ctrl+K', description: 'Focus search', category: 'Global' },
    { keys: '?', description: 'Show keyboard shortcuts', category: 'Global' },
    { keys: 'Escape', description: 'Close modal/Clear search', category: 'Global' },

    // Log Viewer
    { keys: 'Ctrl+Space', description: 'Pause/Resume logs', category: 'Log Viewer' },
    { keys: 'Ctrl+L', description: 'Clear logs', category: 'Log Viewer' },
    { keys: 'Ctrl+S', description: 'Download logs', category: 'Log Viewer' },
    { keys: 'Ctrl+↑', description: 'Jump to top', category: 'Log Viewer' },
    { keys: 'Ctrl+↓', description: 'Jump to bottom', category: 'Log Viewer' },
    { keys: 'N', description: 'Toggle line numbers', category: 'Log Viewer' },

    // Navigation
    { keys: 'Ctrl+R', description: 'Refresh current view', category: 'Navigation' },
  ];

  const categories = Array.from(new Set(shortcuts.map(s => s.category || 'Other')));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>⌨️ Keyboard Shortcuts</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.content}>
          {categories.map(category => (
            <div key={category} className={styles.category}>
              <h3 className={styles.categoryTitle}>{category}</h3>
              <div className={styles.shortcuts}>
                {shortcuts
                  .filter(s => (s.category || 'Other') === category)
                  .map((shortcut, index) => (
                    <div key={index} className={styles.shortcut}>
                      <kbd className={styles.keys}>{shortcut.keys}</kbd>
                      <span className={styles.description}>{shortcut.description}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <span>Press <kbd>Escape</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
