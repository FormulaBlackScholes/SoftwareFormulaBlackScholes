# ⚡ QUICK START - v1.0.43 Release Build

**TL;DR** - Just want to release? Start here.

## 3-Minute Quick Build (Windows)

```powershell
# Open PowerShell in project folder
cd "c:\Users\matti\Documents\avaauto\avaauto_working_stable_linux (copia 3)"

# Run build script
.\BUILD-RELEASE.bat

# Wait for completion, follow on-screen instructions
```

## 5-Minute Release (After Build)

1. **Create GitHub Release**:
   - Go: https://github.com/mattia-risiglione/avaauto-releases/releases/new
   - Tag: `v1.0.43`
   - Title: `AvaAuto v1.0.43 - Stable Release`

2. **Add Release Notes**:
   - Copy content from: `CHANGELOG_v1.0.43.md`

3. **Upload Source Code**:
   - Create ZIP: `Compress-Archive -Path "build_1.0.43_*\source" -DestinationPath "avaauto-v1.0.43-source.zip"`
   - Upload ZIP to release

4. **Publish**:
   - Click "Publish release"
   - Done! ✅

## Manual Build (Advanced)

```bash
# 1. Install dependencies
npm install --production
cd electron-app && npm install --production && cd ..

# 2. Test (optional)
npm test -- tests/trade.spec.js

# 3. Package
mkdir -p build_1.0.43_$(date +%Y%m%d_%H%M%S)
cp -r . build_1.0.43_*/source --exclude=node_modules --exclude=logs --exclude=screenshots

# 4. Create release on GitHub
```

## Verification Quick Check

Run this before releasing:

```bash
# Check version
grep "version" package.json electron-app/package.json

# Check IPC handlers (should be 17 matches)
grep -c "registerHandler(" electron-app/src/main.js

# Check no duplicate raw handlers (should be 1 match - in function definition)
grep -c "ipcMain.handle(" electron-app/src/main.js
```

**Expected Output:**
```
"version": "1.0.43"  ✅
17  ✅
1   ✅
```

## Files You'll Need

| File | Purpose |
|------|---------|
| `RELEASE_v1.0.43_README.md` | Overview of release |
| `CHANGELOG_v1.0.43.md` | What's new (copy to GitHub) |
| `RELEASE_INSTRUCTIONS.md` | Detailed step-by-step guide |
| `RELEASE_SUMMARY_v1.0.43.md` | Technical summary |
| `BUILD-RELEASE.bat` | Windows build automation |
| `build-release.sh` | Unix build automation |

## Common Tasks

### "I want to just test it works"
```bash
npm install
npm test -- tests/trade.spec.js
# Should run full 240+ seconds without crash
```

### "I want to build locally"
```bash
.\BUILD-RELEASE.bat
# Creates build_1.0.43_* folder with everything ready
```

### "I want to release to GitHub right now"
```powershell
# Run build
.\BUILD-RELEASE.bat

# Wait for completion, then:
# 1. Go to https://github.com/mattia-risiglione/avaauto-releases/releases/new
# 2. Tag: v1.0.43
# 3. Title: AvaAuto v1.0.43 - Stable Release
# 4. Description: (paste from CHANGELOG_v1.0.43.md)
# 5. Upload build_*/source as ZIP
# 6. Publish
```

### "Something went wrong, start over"
```bash
# Clean
rm -rf node_modules electron-app/node_modules build_*

# Fresh start
npm install --production
cd electron-app && npm install --production && cd ..

# Try again
.\BUILD-RELEASE.bat
```

## Troubleshooting

**"IPC handler error during test"**
→ Make sure ALL `ipcMain.handle()` replaced with `registerHandler()`  
→ Check: `grep "ipcMain.handle(" electron-app/src/main.js` should return 0

**"npm install fails"**
→ Delete node_modules and try again  
→ Check Node.js version: `node --version` (should be 16+)

**"Build script not found"**
→ Make sure you're in correct directory  
→ Windows: Use `.\BUILD-RELEASE.bat`  
→ Linux/macOS: Use `./build-release.sh` (might need `chmod +x`)

**"Version mismatch"**
→ Check both files: `grep version package.json electron-app/package.json`  
→ Both should say 1.0.43

## Success Indicators

✅ **Build succeeded when you see:**
```
==================================
✓ Build Complete!
==================================

📦 Release Package: build_1.0.43_*
📄 Release Notes: build_1.0.43_*/RELEASE_NOTES.md
```

✅ **Release succeeded when:**
- Release appears on GitHub releases page
- Tag v1.0.43 exists in repository
- ZIP file can be downloaded
- npm install works on downloaded source

## One-Command Release (PowerShell)

If you just want to build everything:

```powershell
cd "c:\Users\matti\Documents\avaauto\avaauto_working_stable_linux (copia 3)"; .\BUILD-RELEASE.bat
```

Done! 🎉

## What's Actually Happening

When you run the build:

1. ✅ Verifies Node.js and npm are installed
2. ✅ Installs all dependencies (npm install)
3. ✅ Creates timestamped build directory
4. ✅ Copies source code (excluding node_modules)
5. ✅ Installs production dependencies in build
6. ✅ Creates RELEASE_NOTES.md and BUILD_INFO.txt
7. ✅ Outputs location of build artifacts

Then manually:
1. Create GitHub release (online)
2. Upload ZIP file
3. Publish

Total time: ~10-15 minutes

---

**Ready?** Run `.\BUILD-RELEASE.bat` and follow the prompts! 🚀
