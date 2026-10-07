param([int]$TestProcessId,[string]$Kind)
$ErrorActionPreference='Stop'
$testProcess=Get-Process -Id $TestProcessId
if($testProcess.Path -ne (Join-Path (Split-Path $PSScriptRoot -Parent) 'release\DevPad-0.6.exe')){throw 'Not the test executable'}
$titles=@{editor='写笔记 · DevPad';organizer='项目与筛选 · DevPad';more='设置 · DevPad';delivery='交给 Agent · DevPad';image='图片预览 · DevPad';main='DevPad'}
if(!$titles.ContainsKey($Kind)){throw 'Unknown test window'}
Add-Type @'
using System;using System.Text;using System.Runtime.InteropServices;
public static class TestFocus {
 delegate bool Callback(IntPtr h,IntPtr l);
 [DllImport("user32.dll")]static extern bool EnumWindows(Callback cb,IntPtr l);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 public static void Focus(int pid,string title){IntPtr found=IntPtr.Zero;EnumWindows((h,l)=>{uint p;GetWindowThreadProcessId(h,out p);if(p==(uint)pid){var s=new StringBuilder(256);GetWindowText(h,s,256);if(s.ToString()==title){found=h;return false;}}return true;},IntPtr.Zero);if(found==IntPtr.Zero)throw new Exception("Test window not found");SetForegroundWindow(found);System.Threading.Thread.Sleep(150);if(GetForegroundWindow()!=found)throw new Exception("Windows did not grant focus to the test window");}
}
'@
[TestFocus]::Focus($TestProcessId,$titles[$Kind])
