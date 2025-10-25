# Dev-Monitor Quick Reference

**Last Updated:** October 25, 2025

---

## 📍 Current Status

**Phase 3:** 100% Complete (5/5 tasks done) ✅  
**Phase 4:** 100% Complete (3/3 tasks done) ✅ 🎉  
**Tests:** 257 unit + 122+ integration + 25+ E2E passing ✅

**Phase 4 Complete:**
- ✨ 10+ keyboard shortcuts
- 📋 Enhanced log viewer (copy, jump, line numbers)
- 🎨 Loading states & error handling
- 🧪 E2E tests with Playwright
- 📚 Comprehensive documentation
- 🚀 CI/CD with GitHub Actions
- 📱 Responsive design (mobile, tablet, desktop) ✨ NEW
- ⚡ Quick actions panel ✨ NEW

---

## 🗂️ Key Documentation

| File | Purpose |
|------|---------|
| `README.md` | Setup & quick start guide |
| `ARCHITECTURE.md` | System architecture (1,000+ lines) |
| `TROUBLESHOOTING.md` | Common issues & solutions |
| `E2E_TESTING_GUIDE.md` | E2E testing with Playwright |
| `PHASE4_PROGRESS.md` | Phase 4 progress tracker |
| `PHASE4_COMPLETION_SUMMARY.md` | Phase 4 complete summary (100%) |
| `PHASE4_1_COMPLETION.md` | Phase 4.1 UI/UX details |
| `REFACTORING_DOCUMENTATION.md` | Master refactoring plan |
| `TESTING_GUIDE.md` | Comprehensive testing guide |
| `frontend/COMPONENT_STYLE_GUIDE.md` | Complete styling guide |

---

## ⌨️ Keyboard Shortcuts (NEW!)

### Global
- `Ctrl+K` / `Cmd+K` - Focus search
- `?` - Show keyboard shortcuts help
- `Escape` - Close modal / Clear search

### Log Viewer
- `Ctrl+Space` - Pause/Resume logs
- `Ctrl+L` - Clear logs
- `Ctrl+S` - Download logs
- `Ctrl+↑` - Jump to top
- `Ctrl+↓` - Jump to bottom
- `N` - Toggle line numbers

### Navigation
- `Ctrl+R` - Refresh current view

---

## 🎨 Frontend Styling

### Using Common Utilities
```tsx
import styles from '../styles/common.module.css';

<div className={styles.flexBetween}>
<div className={`${styles.card} ${styles.cardHoverable}`}>
<span className={styles.textMuted}>
```

### Using Styled Components
```tsx
import { StyledButton, StyledBadge, StyledCard } from './components/common';

<StyledButton variant="primary" size="md" onClick={...}>
<StyledBadge variant="success" size="md">
<StyledCard variant="default" padding="md" hoverable>
```

### Design Tokens
```tsx
import { theme } from './styles/theme';

style={{ 
  color: theme.colors.primary,
  padding: theme.spacing.md,
  fontSize: theme.typography.fontSize.md,
}}
```

---

## 🔧 Backend Routes

### Modular Structure
```
backend/src/routes/
├── index.ts                  # Factory with DI
├── services.routes.ts        # 6 endpoints
├── socket-task.routes.ts     # 15 endpoints
├── docker.routes.ts          # 4 endpoints
├── scripts.routes.ts         # 6 endpoints
├── script-history.routes.ts  # 5 endpoints
├── claude-workers.routes.ts  # 30 endpoints
├── logs.routes.ts            # 6 endpoints
├── ports.routes.ts           # 2 endpoints
└── environments.routes.ts    # 2 endpoints
```

### Creating New Routes
```typescript
// routes/my-feature.routes.ts
export function createMyFeatureRoutes(myService: MyService): Router {
  const router = Router();
  
  router.get('/endpoint', async (req, res) => {
    const result = await myService.doSomething();
    res.json(result);
  });
  
  return router;
}
```

---

## 🧪 Testing

### Run Tests
```bash
# Backend tests
cd backend && npm test

# Backend unit tests only
cd backend && npm run test:unit

# Backend integration tests only
cd backend && npm run test:integration

# Frontend tests  
cd frontend && npm test

# With coverage
npm run test:coverage
```

### Current Status
- Backend unit: 257/257 passing ✅
- Backend integration: 122+ tests ✅
- Frontend: Vitest configured ✅
- E2E: 25+ tests with Playwright ✅

### Run E2E Tests (NEW!)
```bash
# Run all E2E tests
cd frontend && npm run test:e2e

# UI mode (interactive)
npm run test:e2e:ui

# Headed mode (see browser)
npm run test:e2e:headed

# Debug mode
npm run test:e2e:debug

# Specific test file
npx playwright test e2e/navigation.spec.ts
```

---

## 🚀 Development

### Start Dev Servers
```bash
# Backend only
cd backend && npm run dev

# Frontend only
cd frontend && npm run dev

# Both (from root)
npm run dev
```

### Build
```bash
# Backend
cd backend && npm run build

# Frontend
cd frontend && npm run build
```

### Lint & Fix
```bash
# Backend
cd backend && npm run lint:fix

# Frontend
cd frontend && npm run lint:fix
```

---

## 📊 Key Metrics

### Code Quality
- App.tsx: 334 → 48 lines (86% ↓)
- Backend routes: Monolithic → 10 modules
- Inline styles: 31 → 0 (100% ↓)
- Utility classes: 0 → 130+
- Components: +15 (Phase 4)
- Tests: +25 E2E tests
- Documentation: +2,200 lines

### Performance
- Hot reload: < 1s ✅
- Build time: < 30s ✅
- Test time: ~5s (unit) ✅
- E2E time: ~2-5min ✅
- Response time: < 100ms ✅

### Maintainability
- Backend: ⭐⭐⭐⭐⭐
- Frontend: ⭐⭐⭐⭐⭐
- Documentation: ⭐⭐⭐⭐⭐
- Testing: ⭐⭐⭐⭐⭐
- Responsive: ⭐⭐⭐⭐⭐

---

## 🎯 Phase 4 Completed Features (100%)

### UI/UX Improvements (100% Complete)
- ✅ Loading states (spinner, skeleton, cards)
- ✅ Error handling (display, boundary, inline)
- ✅ Status indicators (5 types with colors)
- ✅ Enhanced log viewer (copy, jump, line numbers)
- ✅ Keyboard shortcuts (10+ shortcuts)
- ✅ Keyboard shortcuts help modal
- ✅ Responsive design (mobile, tablet, desktop) ✨
- ✅ Quick actions panel (collapsible) ✨

### Testing (100% Complete)
- ✅ 25+ E2E tests (4 suites)
- ✅ Multi-browser testing (Chromium, Firefox, WebKit)
- ✅ CI/CD with GitHub Actions
- ✅ Automated testing on commits

### Documentation (100% Complete)
- ✅ Architecture guide (1,000+ lines)
- ✅ Setup guide (400+ lines)
- ✅ Troubleshooting guide (500+ lines)
- ✅ E2E testing guide (300+ lines)

### Responsive Features ✨ NEW
- ✅ Mobile-first design (≤768px)
- ✅ Tablet optimization (769-1024px)
- ✅ Desktop layouts (>1024px)
- ✅ Touch-friendly sizing
- ✅ Horizontal tab scroll
- ✅ Responsive grids (auto-fit)
- ✅ Hide/show utilities

### Quick Actions ✨ NEW
- ✅ Collapsible action panel
- ✅ Icon + label + shortcut display
- ✅ 5 color variants
- ✅ Hover effects
- ✅ Responsive grid
- ✅ Touch-optimized
- ✅ Preset action groups

---

## 💡 Quick Tips

### Adding a New Component
1. Create `Component.tsx` and `Component.module.css`
2. Use `common.module.css` utilities
3. Follow patterns in `COMPONENT_STYLE_GUIDE.md`
4. Import from `components/common` for styled elements

### Adding a New Route
1. Create `feature.routes.ts` in `backend/src/routes/`
2. Export `createFeatureRoutes(deps)` function
3. Add to `routes/index.ts` factory
4. Update `server.ts` if needed

### Styling Best Practices
- ✅ Use CSS Modules
- ✅ Use common utilities first
- ✅ Use theme.ts tokens
- ✅ Follow style guide
- ❌ No inline styles
- ❌ No hardcoded colors
- ❌ No magic numbers

---

## 🔗 Useful Commands

```bash
# Check ports
lsof -i :5000 -i :5174

# Kill port
lsof -ti:5000 | xargs kill -9

# Git status
git status --short

# Find files
find . -name "*.tsx" -type f

# Search code
grep -r "searchTerm" src/

# Count lines
wc -l src/**/*.ts
```

---

**For detailed info, see documentation files above** 📚
