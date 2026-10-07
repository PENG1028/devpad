param([int]$TestProcessId,[int]$X,[int]$Y,[int]$Width,[int]$Height,[switch]$CursorOnly)
$ErrorActionPreference='Stop'
$process=Get-Process -Id $TestProcessId
$allowed=(Join-Path (Split-Path $PSScriptRoot -Parent) 'release\DevPad.exe')
$alternate=(Join-Path (Split-Path $PSScriptRoot -Parent) 'release\DevPad-0.6.exe')
if($process.Path -ne $allowed -and $process.Path -ne $alternate){throw 'Not a DevPad test executable'}
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class TestWindow {
 public delegate bool EnumProc(IntPtr hwnd,IntPtr data);
 [DllImport("user32.dll")]static extern bool EnumWindows(EnumProc callback,IntPtr data);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint id);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int count);
 [DllImport("user32.dll")]static extern bool MoveWindow(IntPtr hwnd,int x,int y,int width,int height,bool repaint);
 [DllImport("user32.dll")]static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")]static extern bool SetCursorPos(int x,int y);
 public static bool Cursor(int x,int y){SetThreadDpiAwarenessContext(new IntPtr(-4));return SetCursorPos(x,y);}
 public static bool Move(uint process,int x,int y,int width,int height){SetThreadDpiAwarenessContext(new IntPtr(-4));bool found=false;EnumWindows((hwnd,unused)=>{uint id;GetWindowThreadProcessId(hwnd,out id);if(id==process){var title=new StringBuilder(256);GetWindowText(hwnd,title,256);if(title.ToString()=="DevPad"){found=MoveWindow(hwnd,x,y,width,height,true);return false;}}return true;},IntPtr.Zero);return found;}
}
'@
if($CursorOnly){if(-not [TestWindow]::Cursor($X,$Y)){throw 'Cannot position test cursor'}}
elseif(-not [TestWindow]::Move($TestProcessId,$X,$Y,$Width,$Height)){throw 'Main test window not found'}
