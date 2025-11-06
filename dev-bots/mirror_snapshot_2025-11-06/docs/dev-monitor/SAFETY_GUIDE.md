# 🔒 Dev Monitor Safety Guide

## Single Entry Point - No Bypass Options

**IMPORTANT**: There is only ONE way to start the dev server safely. All other methods have been removed to prevent accidental bypassing of safety checks.

## ✅ The ONLY Way to Start the Server

### From Root Directory:

```bash
make dev-monitor
```

### From dev-monitor Directory:

```bash
make dev
```

### Direct Backend Only:

```bash
cd dev-monitor/backend
npm run dev
```

**All of these commands use the same secure wrapper with mandatory safety checks.**

## 🛡️ Safety Features

The secure wrapper automatically:

1. **Process Check**: Scans for existing dev-monitor processes
2. **Port Check**: Verifies ports 5000 and 5174 are available
3. **Clear Error Messages**: Shows "Server is already running!" when conflicts exist
4. **Helpful Solutions**: Provides specific commands to resolve conflicts

## 🚫 What's Been Removed

- ❌ `npm run dev:unsafe` - REMOVED
- ❌ `npm run dev:force` - REMOVED
- ❌ Direct `nodemon` commands - BLOCKED
- ❌ Any bypass options - ELIMINATED

## 🔧 Troubleshooting

If you get conflicts, use these commands:

### Check Status:

```bash
make dev-monitor-status
```

### Stop Everything:

```bash
make dev-monitor-stop
```

### Force Clean (Nuclear Option):

```bash
make dev-monitor-clean
```

### Check if Safe to Start:

```bash
make dev-monitor-check
```

## 🎯 Why This Design?

1. **Prevents Accidents**: No way to accidentally bypass safety checks
2. **Clear Errors**: Always know exactly what's wrong
3. **Easy Recovery**: Simple commands to fix any issues
4. **Single Source of Truth**: One way to start, no confusion

## ⚠️ Emergency Override

If you absolutely need to bypass safety checks (NOT RECOMMENDED):

```bash
# This is the ONLY way to bypass - use with extreme caution
cd dev-monitor/backend
nodemon --exec tsx src/index.ts
```

**Warning**: This bypasses all safety checks and can cause port conflicts, process conflicts, and system instability. Use only in extreme emergencies and stop immediately if you see errors.

## 📋 Summary

- ✅ **Safe**: `make dev-monitor` (always use this)
- ❌ **Unsafe**: Direct nodemon commands (avoid)
- 🔧 **Troubleshoot**: Use the make commands above
- 🚨 **Emergency**: Only if absolutely necessary

**Remember**: The safety system is there to protect you and your system. Trust it, use it, and you'll never have conflicts again!
