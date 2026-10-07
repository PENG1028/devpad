param([string]$Source='release/DevPad-0.6-UI.exe',[string]$Destination='release/DevPad-0.6-UI-fixed.exe')
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class DevPadIconResource {
 delegate bool EnumName(IntPtr module,IntPtr type,IntPtr name,IntPtr param);
 delegate bool EnumLanguage(IntPtr module,IntPtr type,IntPtr name,ushort language,IntPtr param);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr LoadLibraryEx(string path,IntPtr file,uint flags);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool FreeLibrary(IntPtr module);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool EnumResourceNames(IntPtr module,IntPtr type,EnumName callback,IntPtr param);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool EnumResourceLanguages(IntPtr module,IntPtr type,IntPtr name,EnumLanguage callback,IntPtr param);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr BeginUpdateResource(string path,bool delete);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool UpdateResource(IntPtr handle,IntPtr type,IntPtr name,ushort lang,byte[] data,uint length);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool EndUpdateResource(IntPtr handle,bool discard);
 static void Check(bool ok){if(!ok)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}
 public static void Replace(string exe,string ico){
  var groups=new List<Tuple<int,ushort>>();var module=LoadLibraryEx(exe,IntPtr.Zero,2);if(module==IntPtr.Zero)Check(false);
  try{Check(EnumResourceNames(module,(IntPtr)14,(m,t,n,p)=>{long id=n.ToInt64();if(id>65535)throw new Exception("Expected integer icon group");Check(EnumResourceLanguages(m,t,n,(mm,tt,nn,l,pp)=>{groups.Add(Tuple.Create((int)id,l));return true;},IntPtr.Zero));return true;},IntPtr.Zero));}finally{FreeLibrary(module);}
  var bytes=File.ReadAllBytes(ico);if(BitConverter.ToUInt16(bytes,2)!=1)throw new Exception("Invalid ICO");int count=BitConverter.ToUInt16(bytes,4);
  var group=new byte[6+14*count];Buffer.BlockCopy(bytes,0,group,0,6);
  var handle=BeginUpdateResource(exe,false);if(handle==IntPtr.Zero)Check(false);
  bool done=false;try{
   for(int i=0;i<count;i++){int entry=6+16*i;int len=BitConverter.ToInt32(bytes,entry+8),offset=BitConverter.ToInt32(bytes,entry+12);var pixels=new byte[len];Buffer.BlockCopy(bytes,offset,pixels,0,len);Buffer.BlockCopy(bytes,entry,group,6+14*i,12);Buffer.BlockCopy(BitConverter.GetBytes((ushort)(1000+i)),0,group,6+14*i+12,2);foreach(var item in groups)Check(UpdateResource(handle,(IntPtr)3,(IntPtr)(1000+i),item.Item2,pixels,(uint)len));}
   foreach(var item in groups)Check(UpdateResource(handle,(IntPtr)14,(IntPtr)item.Item1,item.Item2,group,(uint)group.Length));
   Check(EndUpdateResource(handle,false));done=true;
  }finally{if(!done)EndUpdateResource(handle,true);}
 }
}
"@
$iconSource = (Resolve-Path -LiteralPath 'src-tauri/icons/icon.ico').Path
Copy-Item -LiteralPath $Source -Destination $Destination
$iconDestination = (Resolve-Path -LiteralPath $Destination).Path
[DevPadIconResource]::Replace($iconDestination,$iconSource)
Add-Type -AssemblyName System.Drawing
$verifiedIcon=[System.Drawing.Icon]::ExtractAssociatedIcon($iconDestination)
$verifiedBitmap=$verifiedIcon.ToBitmap()
$verifiedBitmap.Save((Join-Path (Get-Location) '.tools/exe-icon-fixed.png'))
$verifiedBitmap.Dispose(); $verifiedIcon.Dispose()
Get-FileHash -LiteralPath $Destination -Algorithm SHA256
