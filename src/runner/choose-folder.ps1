# choose-folder.ps1 - WINDOWS' OWN FOLDER WINDOW, opened for the app by pick.mjs. Prints the folder chosen, or nothing when it is closed.
# The window is Explorer's "Select Folder" (the system's file dialog, asked for folders: what every current Windows program shows,
# and Microsoft's own advice since Vista). PowerShell's ready-made folder dialog is the old tree from Windows XP, and it opens
# behind the browser. So the modern one is asked for directly, through a few lines of C# that PowerShell compiles on the spot:
# nothing is installed and no library is shipped. It is OWNED by the window the person pressed the button in, which is the window
# in front at this moment, and an owned window always opens over its owner. If the modern one cannot be made on some PC, the old
# tree is shown, owned the same way.
#   powershell -NoProfile -STA -ExecutionPolicy Bypass -File choose-folder.ps1 -Title "Choose a folder"
param([string]$Title = 'Choose a folder')
$ErrorActionPreference = 'Stop'
$code = @'
using System;
using System.Runtime.InteropServices;
public static class FoPick {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialog {}
  // the methods are declared in the order the system has them; the ones not used here hold their places
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(); void SetFileTypeIndex(); void GetFileTypeIndex(); void Advise(); void Unadvise();
    void SetOptions(uint fos); void GetOptions(out uint fos);
    void SetDefaultFolder(); void SetFolder(); void GetFolder(); void GetCurrentSelection();
    void SetFileName(); void GetFileName();
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel(); void SetFileNameLabel();
    void GetResult(out IShellItem item);
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(); void GetParent();
    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
  }
  public static string Folder(string title, IntPtr owner) {
    IFileDialog d = (IFileDialog)new FileOpenDialog();
    uint o; d.GetOptions(out o);
    d.SetOptions(o | 0x20 | 0x40);   // folders, and only ones that are on a disk
    d.SetTitle(title);
    if (d.Show(owner) != 0) return "";   // closed without choosing
    IShellItem item; d.GetResult(out item);
    string path; item.GetDisplayName(0x80058000, out path);
    return path;
  }
}
'@
$owner = [IntPtr]::Zero
try {
  Add-Type -TypeDefinition $code
  $owner = [FoPick]::GetForegroundWindow()
  [Console]::Out.Write([FoPick]::Folder($Title, $owner))
  exit 0
} catch {
  # the old tree, which every Windows can show
  Add-Type -AssemblyName System.Windows.Forms
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = $Title
  $d.ShowNewFolderButton = $true
  if ($owner -ne [IntPtr]::Zero) {
    $w = New-Object System.Windows.Forms.NativeWindow
    $w.AssignHandle($owner)
  } else {
    $w = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false; Opacity = 0 }
  }
  if ($d.ShowDialog($w) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }
  exit 0
}
