import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: () => void;
  preventDefault?: boolean;
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  ignoreInputFields?: boolean;
}

/**
 * Hook to register keyboard shortcuts
 * 
 * @example
 * useKeyboardShortcuts([
 *   { key: 'k', ctrl: true, description: 'Search', action: () => focusSearch() },
 *   { key: 'Escape', description: 'Close modal', action: () => closeModal() }
 * ]);
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true, ignoreInputFields = true } = options;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Skip if disabled
    if (!enabled) return;

    // Skip if user is typing in an input field (unless explicitly disabled)
    if (ignoreInputFields) {
      const activeElement = document.activeElement;
      const isInput = activeElement?.tagName === 'INPUT' || 
                     activeElement?.tagName === 'TEXTAREA' ||
                     activeElement?.hasAttribute('contenteditable');
      
      // Allow Escape key even in input fields
      if (isInput && event.key !== 'Escape') return;
    }

    // Check each shortcut
    for (const shortcut of shortcuts) {
      const keyMatches = event.key === shortcut.key || event.code === shortcut.key;
      const ctrlMatches = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey;
      const metaMatches = shortcut.meta ? event.metaKey : !event.metaKey;
      const shiftMatches = shortcut.shift ? event.shiftKey : !event.shiftKey;
      const altMatches = shortcut.alt ? event.altKey : !event.altKey;

      // Allow ctrl OR meta for common shortcuts (Cmd on Mac, Ctrl on Windows/Linux)
      const modifierMatches = shortcut.ctrl || shortcut.meta
        ? (event.ctrlKey || event.metaKey) && shiftMatches && altMatches
        : ctrlMatches && metaMatches && shiftMatches && altMatches;

      if (keyMatches && modifierMatches) {
        if (shortcut.preventDefault !== false) {
          event.preventDefault();
        }
        shortcut.action();
        break; // Stop after first match
      }
    }
  }, [shortcuts, enabled, ignoreInputFields]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Common shortcuts that can be reused across components
 */
export const commonShortcuts = {
  search: (action: () => void): KeyboardShortcut => ({
    key: 'k',
    ctrl: true,
    description: 'Focus search',
    action,
  }),
  
  escape: (action: () => void): KeyboardShortcut => ({
    key: 'Escape',
    description: 'Close/Cancel',
    action,
  }),
  
  save: (action: () => void): KeyboardShortcut => ({
    key: 's',
    ctrl: true,
    description: 'Save/Download',
    action,
  }),
  
  clear: (action: () => void): KeyboardShortcut => ({
    key: 'l',
    ctrl: true,
    description: 'Clear',
    action,
  }),
  
  pause: (action: () => void): KeyboardShortcut => ({
    key: 'Space',
    ctrl: true,
    description: 'Pause/Resume',
    action,
  }),
  
  jumpToTop: (action: () => void): KeyboardShortcut => ({
    key: 'ArrowUp',
    ctrl: true,
    description: 'Jump to top',
    action,
  }),
  
  jumpToBottom: (action: () => void): KeyboardShortcut => ({
    key: 'ArrowDown',
    ctrl: true,
    description: 'Jump to bottom',
    action,
  }),
  
  refresh: (action: () => void): KeyboardShortcut => ({
    key: 'r',
    ctrl: true,
    description: 'Refresh',
    action,
  }),
  
  help: (action: () => void): KeyboardShortcut => ({
    key: '?',
    shift: true,
    description: 'Show help',
    action,
  }),
};

/**
 * Hook to show keyboard shortcuts help
 */
export function useKeyboardShortcutsHelp(shortcuts: KeyboardShortcut[]) {
  const formatShortcut = (shortcut: KeyboardShortcut): string => {
    const parts: string[] = [];
    
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.meta) parts.push('Cmd');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.alt) parts.push('Alt');
    
    // Format the key nicely
    let key = shortcut.key;
    if (key === ' ') key = 'Space';
    if (key.startsWith('Arrow')) key = key.replace('Arrow', '');
    
    parts.push(key);
    
    return parts.join('+');
  };

  return shortcuts.map(shortcut => ({
    keys: formatShortcut(shortcut),
    description: shortcut.description,
  }));
}
