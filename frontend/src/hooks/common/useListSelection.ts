/**
 * useListSelection Hook
 *
 * Standardizes list selection patterns across tab components.
 * Provides consistent auto-selection, manual selection, and state management.
 *
 * @example
 * ```tsx
 * const { selectedItem, selectItem } = useListSelection(
 *   items,
 *   (item) => item.id,
 *   { autoSelectFirst: true }
 * );
 * ```
 */

import { useState, useEffect, useCallback } from 'react';

export interface UseListSelectionOptions {
  /**
   * Whether to automatically select the first item when the list changes
   * @default true
   */
  autoSelectFirst?: boolean;

  /**
   * Initial selected key
   * @default null
   */
  initialKey?: string | null;

  /**
   * Callback when selection changes
   */
  onSelectionChange?: (key: string | null) => void;
}

/**
 * Hook for managing list item selection with auto-selection support
 *
 * @param items - Array of items to select from
 * @param getKey - Function to extract unique key from an item
 * @param options - Configuration options
 * @returns Selection state and control functions
 */
export function useListSelection<T>(
  items: T[],
  getKey: (item: T) => string,
  options: UseListSelectionOptions = {}
) {
  const {
    autoSelectFirst = true,
    initialKey = null,
    onSelectionChange,
  } = options;

  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);

  // Auto-select first item when items change (if enabled and no selection)
  useEffect(() => {
    if (!autoSelectFirst) return;

    // If there's already a selection and it's still in the list, keep it
    if (selectedKey && items.some(item => getKey(item) === selectedKey)) {
      return;
    }

    // Otherwise, select the first item if available
    if (items.length > 0) {
      const firstKey = getKey(items[0]);
      setSelectedKey(firstKey);
      onSelectionChange?.(firstKey);
    } else {
      // Clear selection if list is empty
      if (selectedKey !== null) {
        setSelectedKey(null);
        onSelectionChange?.(null);
      }
    }
  }, [items, getKey, autoSelectFirst, selectedKey, onSelectionChange]);

  // Get the currently selected item object
  const selectedItem = selectedKey
    ? items.find(item => getKey(item) === selectedKey) ?? null
    : null;

  // Manual selection handler
  const selectItem = useCallback((item: T | null) => {
    const newKey = item ? getKey(item) : null;
    setSelectedKey(newKey);
    onSelectionChange?.(newKey);
  }, [getKey, onSelectionChange]);

  // Select by key directly
  const selectByKey = useCallback((key: string | null) => {
    setSelectedKey(key);
    onSelectionChange?.(key);
  }, [onSelectionChange]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedKey(null);
    onSelectionChange?.(null);
  }, [onSelectionChange]);

  return {
    /** Currently selected item key */
    selectedKey,

    /** Currently selected item object (or null if none selected) */
    selectedItem,

    /** Select an item by passing the item object */
    selectItem,

    /** Select an item by passing its key */
    selectByKey,

    /** Clear the current selection */
    clearSelection,

    /** Check if a specific item is selected */
    isSelected: (item: T) => getKey(item) === selectedKey,

    /** Check if a specific key is selected */
    isKeySelected: (key: string) => key === selectedKey,
  };
}
