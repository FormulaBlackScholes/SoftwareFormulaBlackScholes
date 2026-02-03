# Release Instructions v1.0.43

## Pre-Release Checklist

- [ ] All IPC handlers converted to `registerHandler()` pattern
- [ ] Version bumped to 1.0.43 in both `package.json` files
- [ ] CHANGELOG_v1.0.43.md created
- [ ] Build and test scripts created
- [ ] Local npm install completes without errors
- [ ] Tests run without "duplicate handler" crashes

## Building for Release

### Option 1: Windows (Recommended)

```powershell
# Navigate to project root
cd "c:\Users\matti\Documents\avaauto\avaauto_working_stable_linux (copia 3)"

# Run build script
.\BUILD-RELEASE.bat
```

This will:
1. Verify Node.js and npm
2. Install production dependencies
3. Create build directory with timestamped name
4. Package source code excluding node_modules, logs, screenshots
5. Create RELEASE_NOTES.md and BUILD_INFO.txt
6. Output build location for next steps

### Option 2: Linux/macOS

```bash
cd "/path/to/avaauto_working_stable_linux (copia 3)"
chmod +x build-release.sh
./build-release.sh
```

### Option 3: Manual Build

```bash
# Install dependencies
npm install --production
cd electron-app
npm install --production
cd ..

# Run tests (optional but recommended)
npm test -- tests/trade.spec.js

# Create build directory
mkdir -p build_1.0.43
cp -r . build_1.0.43/source --exclude=node_modules --exclude=logs --exclude=screenshots
```

## Preparing GitHub Release

### Step 1: Create Release Tag Locally

```bash
cd "c:\Users\matti\Documents\avaauto\avaauto_working_stable_linux (copia 3)"
git add .
git commit -m "v1.0.43: IPC handler safety and keyboard slider improvements"
git tag -a v1.0.43 -m "Release v1.0.43: Critical bugfixes and UI automation improvements"
git push origin main
git push origin v1.0.43
```

### Step 2: Create GitHub Release

1. Go to: https://github.com/mattia-risiglione/avaauto-releases/releases/new

2. Fill in release details:
   - **Tag version**: `v1.0.43`
   - **Release title**: `AvaAuto v1.0.43 - Stable Release`
   - **Description**: Copy contents from `CHANGELOG_v1.0.43.md`

3. **Release notes content:**
   ```markdown
   # AvaAuto v1.0.43 - Stable Release

   ## What's New

   ### Critical Bugfixes
   - ✅ Fixed "duplicate handler" Electron crash on app reload
   - ✅ Complete rewrite of slider quantity setting using keyboard arrow keys
   - ✅ Removed unreliable mouse drag automation

   ### Technical Improvements
   - Implemented `registerHandler()` safety wrapper for all 15+ IPC channels
   - Added direct attribute reading for slider values (eliminates async display lag)
   - Comprehensive logging for debugging slider increments

   ### What's Fixed
   - Electron app no longer crashes with "Attempted to register a second handler" error
   - Slider values no longer jump unpredictably (50→100→300→NaN)
   - Keyboard-based slider increment is synchronous and reliable

   ## Installation

   1. Download `avaauto-v1.0.43-source.zip`
   2. Extract to desired location
   3. Run: `npm install`
   4. For Electron app: `cd electron-app && npm install`
   5. Start trading: `npm test -- tests/trade.spec.js`

   ## Testing

   Expected behavior on first run:
   ```
   - Electron app starts without "duplicate handler" error
   - Browser opens with trading interface
   - Calculator modal opens when needed
   - Slider increments using keyboard arrow keys
   - Final value matches calculated contract quantity (e.g., 48)
   - No NaN values in output
   ```

   ## Known Issues

   - Balance reading may fail on some trading accounts (fallback to fixed value)
   - Display value reading has async lag (use direct attribute reading instead)

   ## Breaking Changes

   None - this is fully backward compatible.

   ## Contributors

   - Matti Risiglione (Lead Developer)
   - GitHub Copilot (Debugging & Implementation)

   ---

   For detailed changelog, see CHANGELOG_v1.0.43.md in the release package.
   ```

### Step 3: Upload Release Assets

Option A: Upload source code ZIP
```bash
# Create ZIP file
cd "build_1.0.43_[timestamp]/source"
powershell -Command "Compress-Archive -Path . -DestinationPath ../avaauto-v1.0.43-source.zip"

# Upload to GitHub release
# - Go to release page
# - Drag and drop "avaauto-v1.0.43-source.zip" into Assets section
```

Option B: Upload using 7-Zip (better compression)
```bash
# Create 7z archive
cd "build_1.0.43_[timestamp]/source"
7z a ../avaauto-v1.0.43-source.7z .

# Upload to GitHub release
# - Go to release page  
# - Drag and drop "avaauto-v1.0.43-source.7z" into Assets section
```

### Step 4: Publish Release

1. Go to release draft
2. Uncheck "This is a pre-release" 
3. Click "Publish release"
4. Verify release appears at: https://github.com/mattia-risiglione/avaauto-releases/releases

## Post-Release Tasks

### Update Version References

Update any version references in documentation:

```bash
# Search for old version in all docs
grep -r "1.0.42" docs/ --include="*.md"
grep -r "1.0.42" . --include="*.md" --include="*.txt"

# Replace with new version
find . -name "*.md" -o -name "*.txt" | xargs sed -i 's/1.0.42/1.0.43/g'
```

### Announce Release

1. **GitHub Discussions**: Create announcement in Discussions
2. **Email**: Send to stakeholders if applicable
3. **Documentation**: Update version in README.md and installation guides

### Backup & Archive

```bash
# Create dated backup
mkdir -p releases_archive
cp -r "build_1.0.43_${TIMESTAMP}" "releases_archive/v1.0.43_${DATE}"
tar -czf "releases_archive/avaauto-v1.0.43-full.tar.gz" "releases_archive/v1.0.43_${DATE}"
```

## Verification After Release

### Test Installation from Release

```bash
# Download from GitHub release
# unzip avaauto-v1.0.43-source.zip
cd avaauto-v1.0.43-source

# Install
npm install
cd electron-app
npm install
cd ..

# Test
npm test -- tests/trade.spec.js

# Should see:
# ✓ App starts without "duplicate handler" error
# ✓ Slider increment via keyboard arrow keys
# ✓ Value reaches target without jumping/NaN
```

### Update Next Version Reference

```bash
# For next development cycle
npm version minor
# Updates version to 1.1.0 in package.json
# Create new commit
git commit -am "Start development on v1.1.0"
```

## Troubleshooting

### Build fails with "duplicate handler" error during test

**Solution**: This shouldn't happen with v1.0.43 since all handlers use `registerHandler()`. If it does:
1. Check that ALL `ipcMain.handle()` calls have been replaced with `registerHandler()`
2. Verify grep output: `grep -n "ipcMain.handle(" electron-app/src/main.js` should return 0 results
3. Rebuild from scratch: `rm -rf node_modules && npm install`

### Release already exists

**Solution**: 
```bash
# Delete the tag locally and remotely
git tag -d v1.0.43
git push origin --delete v1.0.43

# Create new tag
git tag -a v1.0.43 -m "Release v1.0.43"
git push origin v1.0.43
```

### Want to update release after publishing

```bash
# Go to GitHub release page
# - Edit release description
# - Add/remove assets
# - Save changes

# For code changes, create new patch version:
npm version patch  # Creates v1.0.44
```

## Release Checklist - Final

Before clicking "Publish release":

- [ ] Version is 1.0.43 in both package.json files
- [ ] CHANGELOG_v1.0.43.md exists and is accurate
- [ ] All IPC handlers use registerHandler() pattern
- [ ] Build script completed without errors
- [ ] Release notes are clear and complete
- [ ] Source code ZIP/7z is uploaded
- [ ] Tag is created and pushed: v1.0.43
- [ ] Release is not marked as "pre-release"
- [ ] All GitHub Actions/CI checks pass (if configured)

---

**Released**: January 26, 2026  
**Version**: 1.0.43  
**Status**: ✅ Production Ready
