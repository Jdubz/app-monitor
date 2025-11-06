# Component Style Guide

**Last Updated:** October 25, 2025  
**Purpose:** Define consistent styling patterns and component usage across the app-monitor frontend.

---

## Design System Overview

The app-monitor uses a centralized design system defined in `src/styles/theme.ts` with shared CSS modules for common patterns.

### Core Principles

1. **Use CSS Modules** for component-specific styles
2. **Use common.module.css** for shared utility classes
3. **Use theme.ts** for design tokens (colors, spacing, etc.)
4. **Use StyledComponents** for simple, reusable UI elements

---

## Design Tokens (theme.ts)

### Colors

```typescript
theme.colors = {
  // Primary
  primary: "#4dabf7",
  primaryDark: "#339af0",

  // Status
  success: "#28a745",
  warning: "#ffc107",
  error: "#dc3545",
  info: "#17a2b8",

  // Neutral
  white: "#ffffff",
  gray50: "#f8f9fa",
  gray300: "#dee2e6",
  gray500: "#adb5bd",

  // Text
  textPrimary: "#333333",
  textSecondary: "#666666",
  textMuted: "#999999",
};
```

### Spacing

```typescript
theme.spacing = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  xxl: "24px",
  xxxl: "32px",
};
```

### Typography

```typescript
theme.typography = {
  fontSize: {
    xs: "11px",
    sm: "12px",
    md: "13px",
    lg: "14px",
    xl: "15px",
    xxl: "18px",
    title: "28px",
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};
```

---

## Styled Components

### StyledButton

**Location:** `src/components/common/StyledButton.tsx`

**Usage:**

```tsx
import { StyledButton } from "./components/common";

<StyledButton
  variant="primary" // primary | secondary | success | warning | error | info
  size="md" // sm | md | lg
  fullWidth={false}
  loading={false}
  onClick={handleClick}
>
  Click Me
</StyledButton>;
```

**Variants:**

- `primary`: Blue (#4dabf7) - default action
- `secondary`: White with border - secondary actions
- `success`: Green (#28a745) - positive actions (start, save)
- `warning`: Yellow (#ffc107) - caution actions (restart)
- `error`: Red (#dc3545) - destructive actions (stop, delete)
- `info`: Cyan (#17a2b8) - informational actions

### StyledBadge

**Location:** `src/components/common/StyledBadge.tsx`

**Usage:**

```tsx
import { StyledBadge } from "./components/common";

<StyledBadge
  variant="success" // success | warning | error | info | neutral
  size="md" // sm | md | lg
>
  Status Text
</StyledBadge>;
```

### StyledCard

**Location:** `src/components/common/StyledCard.tsx`

**Usage:**

```tsx
import { StyledCard } from "./components/common";

<StyledCard
  variant="default" // default | highlighted | bordered
  padding="md" // sm | md | lg
  hoverable={true} // adds hover effect
>
  Card Content
</StyledCard>;
```

---

## Common CSS Classes

**Location:** `src/styles/common.module.css`

### Layout Classes

```tsx
import styles from '../styles/common.module.css';

// Flexbox
<div className={styles.flexRow}>...</div>
<div className={styles.flexColumn}>...</div>
<div className={styles.flexBetween}>...</div>
<div className={styles.flexCenter}>...</div>

// With gaps
<div className={`${styles.flexRow} ${styles.flexGapMd}`}>...</div>
```

### Card Classes

```tsx
// Basic card
<div className={styles.card}>...</div>

// Hoverable card
<div className={`${styles.card} ${styles.cardHoverable}`}>...</div>
```

### Info Panel Classes

```tsx
// Basic info panel
<div className={styles.infoPanel}>...</div>

// Highlighted variants
<div className={`${styles.infoPanel} ${styles.infoPanelHighlight}`}>...</div>
<div className={`${styles.infoPanel} ${styles.infoPanelWarning}`}>...</div>
<div className={`${styles.infoPanel} ${styles.infoPanelError}`}>...</div>
```

### Text Utilities

```tsx
<span className={styles.textPrimary}>Primary text</span>
<span className={styles.textSecondary}>Secondary text</span>
<span className={styles.textMuted}>Muted text</span>
<code className={styles.textMonospace}>Code text</code>
```

### Status Badges (CSS-only)

```tsx
<span className={`${styles.statusBadge} ${styles.statusSuccess}`}>Running</span>
```

---

## Component Patterns

### Service Card Pattern

**Structure:**

1. Card container (StyledCard)
2. Header with title and status badge
3. Optional info panel for Docker/worker status
4. Control buttons section
5. Service info section

**Example:**

```tsx
<StyledCard variant="default" padding="md" hoverable>
  {/* Header */}
  <div className={styles.flexBetween}>
    <h3>Service Name</h3>
    <StatusBadge status={status} />
  </div>

  {/* Optional info panel */}
  <div className={styles.infoPanel}>Container Status</div>

  {/* Control buttons */}
  <div className={styles.buttonGroup}>
    <StyledButton variant="success">Start</StyledButton>
    <StyledButton variant="error">Stop</StyledButton>
  </div>

  {/* Service info */}
  <ServiceInfo service={service} />
</StyledCard>
```

### Tab Content Pattern

**Structure:**

1. Tab content wrapper
2. Content padding
3. Grid or flex layout for cards

**Example:**

```tsx
import styles from "./TabName.module.css";
import commonStyles from "../../styles/common.module.css";

<div className={styles.tabContent}>
  <div className={commonStyles.grid}>
    {items.map((item) => (
      <Card key={item.id}>...</Card>
    ))}
  </div>
</div>;
```

### Modal Pattern

**Structure:**

1. Overlay backdrop
2. Modal container
3. Modal header with close button
4. Modal body
5. Modal footer with actions

**Example:**

```tsx
<div className={styles.modalOverlay}>
  <div className={styles.modalContainer}>
    <div className={styles.modalHeader}>
      <h3>Modal Title</h3>
      <button onClick={onClose}>×</button>
    </div>
    <div className={styles.modalBody}>Modal Content</div>
    <div className={styles.modalFooter}>
      <StyledButton variant="secondary" onClick={onClose}>
        Cancel
      </StyledButton>
      <StyledButton variant="primary" onClick={onConfirm}>
        Confirm
      </StyledButton>
    </div>
  </div>
</div>
```

---

## Layout Components

### Header

**Location:** `src/components/layout/Header.tsx`

**Usage:**

```tsx
<Header
  title="Dev Monitor"
  connectionStatus="connected" // connected | disconnected | reconnecting
/>
```

### MainLayout

**Location:** `src/components/layout/MainLayout.tsx`

**Usage:**

```tsx
<MainLayout>{/* Your content */}</MainLayout>
```

### TabNav

**Location:** `src/components/layout/TabNav.tsx`

**Usage:**

```tsx
<TabNav
  activeTab={activeTab}
  onTabChange={setActiveTab}
  tabs={[
    { id: "local", label: "Local Services" },
    { id: "scripts", label: "Scripts" },
  ]}
/>
```

### TabContent

**Location:** `src/components/layout/TabContent.tsx`

**Usage:**

```tsx
<TabContent>{/* Tab panel content */}</TabContent>
```

---

## Color Usage Guidelines

### When to Use Each Color

**Primary (Blue #4dabf7):**

- Main actions
- Links
- Active states

**Success (Green #28a745):**

- Start/Run actions
- Success messages
- Running status
- Positive confirmations

**Warning (Yellow #ffc107):**

- Restart actions
- Caution messages
- Transitional states (starting, stopping)
- Low-priority alerts

**Error (Red #dc3545):**

- Stop/Kill actions
- Error messages
- Failed/Stopped status
- Destructive confirmations

**Info (Cyan #17a2b8):**

- Informational messages
- Help text
- Neutral status

**Neutral (Gray #6c757d):**

- Disabled states
- Unknown status
- Placeholder text

---

## Spacing Guidelines

### Margin/Padding Scale

- **xs (4px)**: Tight spacing for inline elements
- **sm (8px)**: Small gaps between related items
- **md (12px)**: Default spacing for most elements
- **lg (16px)**: Section spacing, card padding
- **xl (20px)**: Large section spacing
- **xxl (24px)**: Major section spacing
- **xxxl (32px)**: Page-level spacing

### Common Spacing Patterns

```tsx
// Card spacing
<div style={{ padding: theme.spacing.lg, marginBottom: theme.spacing.lg }}>

// Button group spacing
<div style={{ display: 'flex', gap: theme.spacing.sm }}>

// Section spacing
<section style={{ marginBottom: theme.spacing.xxl }}>
```

---

## Typography Guidelines

### Font Sizes

- **xs (11px)**: Fine print, metadata
- **sm (12px)**: Secondary text, labels
- **md (13px)**: Body text (default)
- **lg (14px)**: Emphasized text
- **xl (15px)**: Subheadings
- **xxl (18px)**: Section headings
- **title (28px)**: Page title

### Font Weights

- **normal (400)**: Body text
- **medium (500)**: Emphasized text
- **semibold (600)**: Headings, labels
- **bold (700)**: Important headings

### Common Typography Patterns

```tsx
// Page title
<h1 style={{
  fontSize: theme.typography.fontSize.title,
  fontWeight: theme.typography.fontWeight.bold,
  color: theme.colors.textPrimary,
}}>

// Section heading
<h2 style={{
  fontSize: theme.typography.fontSize.xxl,
  fontWeight: theme.typography.fontWeight.semibold,
}}>

// Body text
<p style={{
  fontSize: theme.typography.fontSize.md,
  color: theme.colors.textSecondary,
}}>

// Label
<label style={{
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.medium,
}}>
```

---

## Animation Guidelines

### Transitions

Use theme transitions for consistency:

```tsx
transition: theme.transitions.fast; // 0.15s - buttons, hovers
transition: theme.transitions.normal; // 0.2s - cards, modals
transition: theme.transitions.slow; // 0.3s - page transitions
```

### Common Animations

**Hover Effects:**

```css
.hoverable {
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.hoverable:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
}
```

**Pulse (Loading/Transitional):**

```css
.pulse {
  animation: pulse 1.5s ease-in-out infinite;
}
```

**Spinner:**

```css
.spinner {
  animation: spin 1s linear infinite;
}
```

---

## Best Practices

### DO

✅ Use CSS Modules for component-specific styles  
✅ Use theme.ts tokens for colors, spacing, typography  
✅ Use common.module.css for repeated patterns  
✅ Use StyledComponents for simple UI elements  
✅ Keep inline styles to a minimum (layout only)  
✅ Use semantic color names (primary, success, error)  
✅ Follow the spacing scale consistently

### DON'T

❌ Use hardcoded colors directly in components  
❌ Use magic numbers for spacing  
❌ Mix styling approaches in the same component  
❌ Create overly complex CSS modules  
❌ Use !important unless absolutely necessary  
❌ Forget to handle responsive layouts  
❌ Ignore accessibility (colors, contrast, ARIA)

---

## Migration Guide

### Converting Inline Styles to CSS Modules

**Before:**

```tsx
<div style={{
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: '16px',
  padding: '12px',
}}>
```

**After:**

```tsx
import styles from './Component.module.css';

<div className={styles.header}>

// Component.module.css
.header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 12px;
}
```

### Using Common Styles

**Before:**

```tsx
<div style={{
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}}>
```

**After:**

```tsx
import commonStyles from '../styles/common.module.css';

<div className={commonStyles.flexBetween}>
```

---

## Testing Styled Components

### Visual Testing Checklist

- [ ] All variants render correctly
- [ ] All sizes render correctly
- [ ] Hover states work as expected
- [ ] Focus states are visible (accessibility)
- [ ] Disabled states render correctly
- [ ] Loading states render correctly
- [ ] Component is responsive
- [ ] Colors match design tokens
- [ ] Spacing matches design tokens

### Component Testing

```tsx
import { render, screen } from "@testing-library/react";
import { StyledButton } from "./StyledButton";

describe("StyledButton", () => {
  it("renders with correct variant", () => {
    render(<StyledButton variant="primary">Click</StyledButton>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<StyledButton loading>Loading</StyledButton>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
```

---

## Resources

- **Theme:** `src/styles/theme.ts`
- **Common Styles:** `src/styles/common.module.css`
- **Styled Components:** `src/components/common/`
- **Layout Components:** `src/components/layout/`
- **Example Components:** See `src/components/ServiceCard.tsx` for complete patterns

---

**Questions?** Refer to existing components for examples or update this guide as patterns evolve.
