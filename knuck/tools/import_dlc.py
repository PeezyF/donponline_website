"""Import the supplied Season 2 artwork and audio (Pillow/numpy/scipy/OpenCV/imageio-ffmpeg).
Usage: python tools/import_dlc.py 'KNUCK! DLC'
The source pack is never modified. Review qa/dlc-*.jpg after importing.
"""
import argparse, json, subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps, ImageDraw
from scipy import ndimage
import cv2, imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
FIGHTERS = {'souljaboy':'SOULJA BOY','djunk':'DJ UNK','fabo':'FABO','parlay':'PARLAE','guccimane':'GUCCI MANE','jeezy':'YOUNG JEEZY','ti':'T.I','shawtylo':'SHAWTY LO','nuface':'NUFACE'}
TARGETS = {'punch':334,'kick':318,'crouch':275,'block':340,'crouchblock':275,'hit':341,'jump':280,'win':366,'walk':333,'sweep':195,'uppercut':375}

def pose_name(p):
    n=' '.join(p.stem.upper().split())
    if 'SNOWMAN' in n: return 'special1' # supplied file is incorrectly numbered 2
    if n.startswith('SPECIAL 1'): return 'special1'
    if n.startswith('SPECIAL 2'): return 'special2'
    if 'CROUCH' in n: return 'crouchblock' if 'DEFENCE' in n else 'crouch'
    return {'HAND PUNCH':'punch','HAND PUCH':'punch','LEG KICK':'kick','LEG HIT':'kick','LEG PUNCH':'kick','DEFENCE':'block','TAKE A HIT':'hit','JUMP':'jump','VICTORY':'win','WALK':'walk','LOW LEG':'sweep','UPPERCUT':'uppercut'}[n]

def cutout(p, preserve_white=False):
    im=Image.open(p).convert('RGB'); im=im.resize((im.width//2, im.height//2),Image.Resampling.NEAREST)
    rgb=np.array(im); minimum=rgb.min(axis=2)
    labels,_=ndimage.label(minimum>=222)
    border=np.unique(np.concatenate((labels[0],labels[-1],labels[:,0],labels[:,-1])))
    transparent=np.isin(labels,border[border!=0])
    white,count=ndimage.label((minimum>=240)&~transparent)
    sizes=np.bincount(white.ravel()); sums=np.bincount(white.ravel(),weights=minimum.ravel())
    edge=set(np.concatenate((white[0],white[-1],white[:,0],white[:,-1])))
    leaks=[i for i in range(1,count+1) if i not in edge and sizes[i]<minimum.size*.06 and sums[i]/sizes[i]>=246]
    if not preserve_white: transparent |= np.isin(white,leaks)
    rgba=np.dstack((rgb,np.where(transparent,0,255).astype('uint8')))
    im=Image.fromarray(rgba); return im.crop(im.getbbox())

def height(im,h): return im.resize((max(1,round(im.width*h/im.height)),h),Image.Resampling.NEAREST)

def sheet(images,path,cols,cell):
    w,h=cell; out=Image.new('RGB',(cols*w,((len(images)+cols-1)//cols)*h),'#303048'); draw=ImageDraw.Draw(out)
    for i,(label,im) in enumerate(images):
        x=(i%cols)*w; y=(i//cols)*h
        tile=ImageOps.contain(im,(w-12,h-28),Image.Resampling.NEAREST)
        out.paste(tile,(x+(w-tile.width)//2,y+20+(h-24-tile.height)//2),tile if tile.mode=='RGBA' else None)
        draw.text((x+5,y+4),label,fill='white')
    out.save(path)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('source',type=Path); ap.add_argument('--skip-audio',action='store_true'); args=ap.parse_args()
    src=args.source; assets=ROOT/'assets'; qa=ROOT/'qa'; qa.mkdir(exist_ok=True)
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    cascade=cv2.CascadeClassifier(cv2.data.haarcascades+'haarcascade_frontalface_default.xml')
    report={'fighters':{},'audio':{},'stages':{}}
    if args.skip_audio and (qa/'dlc-import.json').exists(): report['audio']=json.loads((qa/'dlc-import.json').read_text())['audio']
    portraits=[]
    for id,folder in FIGHTERS.items():
        directory=src/'CHARACTERS'/folder
        poses={pose_name(p):cutout(p, id in {'parlay', 'djunk', 'fabo', 'ti'}) for p in sorted((directory/'POSES').glob('*.png'))}
        assert len(poses)==13,(id,poses.keys())
        factor=340/poses['block'].height; sizes={}; previews=[]
        for name,im in poses.items():
            target=round(im.height*factor)
            if name in TARGETS:
                ref=TARGETS[name]
                if abs(target-ref)>ref*.08: target=ref
                if name=='block': target=340
                if name=='uppercut': target=max(363,min(386,target))
                if name in ('crouch','crouchblock'): target=max(268,min(282,target))
            poses[name]=height(im,target)
        poses['crouchblock']=height(poses['crouchblock'],min(poses['crouch'].height,poses['crouchblock'].height))
        for name,im in poses.items():
            im.save(assets/'chars'/f'{id}_{name}.png'); sizes[name]=list(im.size); previews.append((name,im))
        poses['walk'].save(assets/'chars'/f'{id}.png')
        sheet(previews,qa/f'dlc-{id}.jpg',7,(190,240))
        photo=Image.open(directory/'CHARACTER PICK.png').convert('RGB')
        small=ImageOps.contain(photo,(1000,1000)); faces=cascade.detectMultiScale(cv2.cvtColor(np.array(small),cv2.COLOR_RGB2GRAY),1.1,4)
        manual = {'souljaboy':(.23,.01,.77,.69), 'djunk':(.34,.01,.82,.62), 'parlay':(.30,.04,.73,.59), 'nuface':(.38,.01,.90,.67)}
        if id in manual:
            left,top,right,bottom=manual[id]
            photo=photo.crop((round(left*photo.width),round(top*photo.height),round(right*photo.width),round(bottom*photo.height)))
        elif len(faces):
            x,y,w,h=max(faces,key=lambda f:f[2]*f[3]); s=photo.width/small.width
            cx=(x+w/2)*s; top=max(0,(y-h*.38)*s); crop_h=min(photo.height-top,h*2.65*s); crop_w=crop_h*150/190
            left=max(0,min(photo.width-crop_w,cx-crop_w/2)); photo=photo.crop((round(left),round(top),round(left+crop_w),round(top+crop_h)))
        else:
            # Centered fallback is recorded for manual QA.
            photo=ImageOps.fit(photo,(150,190),centering=(.5,.3))
        portrait=ImageOps.fit(photo,(150,190)).resize((50,63),Image.Resampling.LANCZOS).quantize(colors=48,dither=Image.Dither.FLOYDSTEINBERG).resize((150,190),Image.Resampling.NEAREST).convert('RGB')
        portrait.save(assets/'portraits'/f'{id}.png'); portraits.append((id,portrait))
        report['fighters'][id]={'sizes':sizes,'face_detected':bool(len(faces)), 'manual_portrait_crop':id in manual}
        if not args.skip_audio:
            audio={}
            for p in directory.glob('*.ogg'):
                n=p.stem.upper()
                key='name' if n.startswith('CHARACTER') else 'win' if n.startswith('VICTORY') else 's1' if n.startswith('SPECIAL 1') else 's2'
                # DJ UNK's explicitly named 2 STEP clip belongs to special 2.
                if id=='djunk' and n.startswith('SPECIAL'): key='s2' if '2 STEP' in n else 's1'
                audio[key]=p.name
                subprocess.run([ffmpeg,'-v','error','-y','-i',str(p),'-af','loudnorm=I=-15:TP=-1.0,silenceremove=start_periods=1:start_threshold=-45dB','-ar','44100','-c:a','libvorbis','-q:a','5',str(assets/'voice'/f'{id}_{key}.ogg')],check=True)
            assert len(audio)==4,(id,audio)
            report['audio'][id]=audio
        print(id,report['fighters'][id],flush=True)
    sheet(portraits,qa/'dlc-portraits.jpg',9,(170,225))
    stages={'southdekalb':'SOUTH DEKALB','crucial':'CLUB CRUCIAL','benzstadium':'STADIUM','bankhead':'BANKHEAD SEAFOOD','underground':'UNDERGROUND ATLANTA'}
    previews=[]
    for id,name in stages.items():
        source=Image.open(src/'LOCATIONS'/f'{name}.png').convert('RGB')
        floor_start={'southdekalb':.77,'crucial':.86,'benzstadium':.85,'bankhead':.85,'underground':.82}[id]
        split=round(source.height*floor_start)
        im=Image.new('RGB',(1280,720))
        im.paste(source.crop((0,0,source.width,split)).resize((1280,540),Image.Resampling.LANCZOS),(0,0))
        im.paste(source.crop((0,split,source.width,source.height)).resize((1280,180),Image.Resampling.LANCZOS),(0,540))
        im=im.quantize(colors=256,dither=Image.Dither.FLOYDSTEINBERG)
        im.save(assets/'stages'/f'{id}.png'); previews.append((id,im.convert('RGB')))
        report['stages'][id]=[1280,720]
    sheet(previews,qa/'dlc-stages.jpg',2,(640,380))
    (qa/'dlc-import.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__': main()
