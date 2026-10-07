use std::path::Path;
use serde::{Deserialize, Serialize};
use image::{Rgba, RgbaImage};

#[derive(Serialize, Deserialize)]
pub struct Mark { pub record:u32, pub picture:u32, pub batch:String }

pub fn render(source:&Path, destination:&Path, mark:&Mark)->Result<(),String>{
    if mark.record==0 || mark.picture==0 || mark.batch.len()!=8 || !mark.batch.bytes().all(|c|c.is_ascii_hexdigit()) {
        return Err("无效的交付编号，请重新打开交付预览".into());
    }
    let mut reader=image::ImageReader::open(source).map_err(|e|e.to_string())?.with_guessed_format().map_err(|e|e.to_string())?;
    let mut limits=image::Limits::default();limits.max_image_width=Some(20000);limits.max_image_height=Some(20000);limits.max_alloc=Some(256*1024*1024);reader.limits(limits);
    let original=reader.decode().map_err(|e|format!("无法读取交付图片：{e}"))?.to_rgba8();
    if u64::from(original.width())*u64::from(original.height())>50_000_000{return Err("图片像素过大，请使用较小的图片".into());}
    let width=original.width().max(520);
    let font=(width/40).clamp(18,48);
    let height=font+28;
    let label=format!("记录 {:02} · 图片 {:02}    /    {}",mark.record,mark.picture,mark.batch);
    let header=header(width,height,font,&label)?;
    let mut output=RgbaImage::from_pixel(width,height+original.height(),Rgba([255,255,255,255]));
    image::imageops::replace(&mut output,&header,0,0);
    image::imageops::replace(&mut output,&original,((width-original.width())/2) as i64,height as i64);
    output.save_with_format(destination,image::ImageFormat::Png).map_err(|e|e.to_string())
}

#[cfg(windows)]
fn header(width:u32,height:u32,font:u32,label:&str)->Result<RgbaImage,String>{
    use windows_sys::Win32::Graphics::Gdi::*;
    use std::ptr::null_mut;
    // GDI is used only for the added strip; source image pixels never enter GDI.
    unsafe {
        let dc=CreateCompatibleDC(null_mut());if dc.is_null(){return Err("无法创建图片标注画布".into());}
        let mut info:BITMAPINFO=std::mem::zeroed();info.bmiHeader.biSize=std::mem::size_of::<BITMAPINFOHEADER>() as u32;info.bmiHeader.biWidth=width as i32;info.bmiHeader.biHeight=-(height as i32);info.bmiHeader.biPlanes=1;info.bmiHeader.biBitCount=32;info.bmiHeader.biCompression=BI_RGB;
        let mut bits=null_mut();let bitmap=CreateDIBSection(dc,&info,DIB_RGB_COLORS,&mut bits,null_mut(),0);
        if bitmap.is_null()||bits.is_null(){DeleteDC(dc);return Err("无法分配图片标注画布".into());}
        let old_bitmap=SelectObject(dc,bitmap);let buffer=std::slice::from_raw_parts_mut(bits as *mut u8,(width*height*4) as usize);buffer.fill(255);
        let face:Vec<u16>="Microsoft YaHei UI\0".encode_utf16().collect();
        let text_font=CreateFontW(-(font as i32),0,0,0,500,0,0,0,DEFAULT_CHARSET as u32,0,0,ANTIALIASED_QUALITY as u32,0,face.as_ptr());
        if text_font.is_null(){SelectObject(dc,old_bitmap);DeleteObject(bitmap);DeleteDC(dc);return Err("无法读取系统字体".into());}
        let old_font=SelectObject(dc,text_font);SetBkMode(dc,TRANSPARENT as i32);SetTextColor(dc,0x00383838);
        let text:Vec<u16>=label.encode_utf16().collect();let ok=TextOutW(dc,14,12,text.as_ptr(),text.len() as i32);GdiFlush();
        let mut result=RgbaImage::new(width,height);for (pixel,bgra) in result.pixels_mut().zip(buffer.chunks_exact(4)){*pixel=Rgba([bgra[2],bgra[1],bgra[0],255]);}
        SelectObject(dc,old_font);SelectObject(dc,old_bitmap);DeleteObject(text_font);DeleteObject(bitmap);DeleteDC(dc);
        if ok==0{return Err("图片标注失败".into());}Ok(result)
    }
}
#[cfg(not(windows))]
fn header(width:u32,height:u32,font:u32,label:&str)->Result<RgbaImage,String>{
    use font8x8::UnicodeFonts;
    let text=label.replace("记录 ","R").replace(" · 图片 "," P");
    let scale=(font/8).min((width-28)/(text.len() as u32*8)).max(1);
    let mut image=RgbaImage::from_pixel(width,height,Rgba([255,255,255,255]));
    for (index,c) in text.chars().enumerate(){if let Some(glyph)=font8x8::BASIC_FONTS.get(c){for (y,row) in glyph.iter().enumerate(){for x in 0..8{if row&(1<<x)!=0{for sy in 0..scale{for sx in 0..scale{let px=14+(index as u32*8+x)*scale+sx;let py=12+y as u32*scale+sy;if px<width&&py<height{image.put_pixel(px,py,Rgba([56,56,56,255]));}}}}}}}}
    Ok(image)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::GenericImageView;
    #[test]
    fn added_strip_preserves_original_pixels_and_source_file(){
        let root=std::env::temp_dir().join(format!("devpad-label-test-{}",uuid::Uuid::new_v4()));std::fs::create_dir_all(&root).unwrap();
        for format in [image::ImageFormat::Png,image::ImageFormat::Jpeg,image::ImageFormat::WebP]{
            let source=root.join(format!("source.{}",format.extensions_str()[0]));let destination=root.join("renamed-by-agent.png");
            image::RgbImage::from_pixel(64,32,image::Rgb([24,86,142])).save_with_format(&source,format).unwrap();
            let bytes=std::fs::read(&source).unwrap();let original=image::open(&source).unwrap().to_rgba8();
            render(&source,&destination,&Mark{record:20,picture:2,batch:"A1B2C3D4".into()}).unwrap();
            let out=image::open(&destination).unwrap().to_rgba8();assert_eq!(std::fs::read(&source).unwrap(),bytes);
            assert_eq!(image::imageops::crop_imm(&out,228,out.height()-32,64,32).to_image(),original);
            assert!(image::imageops::crop_imm(&out,0,0,520,out.height()-32).pixels().any(|(_,_,p)|p[0]<100));
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
