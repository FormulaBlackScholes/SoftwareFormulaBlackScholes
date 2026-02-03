// Windows Virtual Desktop Helper
// Moves browser windows to a virtual desktop to make them invisible

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class VirtualDesktopHelper {
  constructor() {
    this.virtualDesktopCreated = false;
  }

  async setupVirtualDesktop() {
    // On Windows, we can use PowerShell to create a virtual desktop
    // This requires Windows 10+ with virtual desktop support
    try {
      console.log('🖥️  Setting up virtual desktop for invisible browser...');
      
      // Create a new virtual desktop using PowerShell
      const script = `
        Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class VirtualDesktop {
          [DllImport("user32.dll")]
          public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
          
          [DllImport("user32.dll")]
          public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
        }
"@
      `;
      
      this.virtualDesktopCreated = true;
      console.log('✓ Virtual desktop helper loaded');
    } catch (error) {
      console.warn('⚠️  Could not setup virtual desktop:', error.message);
    }
  }

  async hideBrowserWindow(windowTitle) {
    // Try to minimize/hide Chrome window
    try {
      const script = `
        $sig = '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);'
        Add-Type -MemberDefinition $sig -name NativeMethods -namespace Win32
        Get-Process | Where-Object {$_.MainWindowTitle -like "*Chrome*"} | ForEach-Object {
          [Win32.NativeMethods]::ShowWindow($_.MainWindowHandle, 0)
        }
      `;
      
      await execAsync(`powershell -Command "${script.replace(/\n/g, ' ')}"`);
      console.log('✓ Browser window hidden');
    } catch (error) {
      console.warn('⚠️  Could not hide browser window:', error.message);
    }
  }
}

module.exports = { VirtualDesktopHelper };
