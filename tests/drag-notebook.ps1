param([int]$TestProcessId,[int]$FromX,[int]$FromY,[int]$ToX,[int]$ToY)
$ErrorActionPreference='Stop'
$p=Get-Process -Id $TestProcessId
if($p.Path -ne (Join-Path (Split-Path $PSScriptRoot -Parent) 'release\DevPad-0.6.exe')){throw 'Not the test executable'}
Add-Type @"
using System;using System.Runtime.InteropServices;
public static class NotebookDrag {
 [DllImport("user32.dll")]static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")]static extern void mouse_event(uint f,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")]static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
 [StructLayout(LayoutKind.Sequential)]public struct Point{public int x;public int y;}
 [DllImport("user32.dll")]static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")]static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 public static void Drag(int process,int x,int y,int dx,int dy){SetThreadDpiAwarenessContext(new IntPtr(-4));SetCursorPos(x,y);System.Threading.Thread.Sleep(100);uint pid;GetWindowThreadProcessId(GetAncestor(WindowFromPoint(new Point{x=x,y=y}),2),out pid);if(pid!=process)throw new Exception("Drag target is not the recorded test window");mouse_event(2,0,0,0,UIntPtr.Zero);try{System.Threading.Thread.Sleep(120);for(int i=1;i<=20;i++){SetCursorPos(x+(dx-x)*i/20,y+(dy-y)*i/20);System.Threading.Thread.Sleep(35);}}finally{mouse_event(4,0,0,0,UIntPtr.Zero);}}
}
"@
[NotebookDrag]::Drag($TestProcessId,$FromX,$FromY,$ToX,$ToY)
