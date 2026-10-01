# ============================================================================
#  SMART IV — Competition Presentation Renderer  (1920x1080 @30fps, 180s)
#  Modes:  python smart_iv_video.py video   -> smart_iv_video_only.mp4
#          python smart_iv_video.py audio   -> vo_full.wav (needs vo/*.wav)
# ============================================================================
import math, os, sys, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS, DUR = 1920, 1080, 30, 180.0
SHOT_DIR = "screenshots"
OUT = "smart_iv_video_only.mp4"

# ---------------- PROJECT FACTS — EDIT AFTER RUNNING THE CHECKLIST ----------
FACTS = {
    "tagline": "Smart Monitoring. Real-Time Communication. Intelligent Healthcare.",
    "members": ["Al-Motaz Billah Nidal Nawaf Abu Amara", "Mohammad Amer", "Fahd Ashraf Laban"],
    "ai_model_label": None,                       # e.g. "Powered by Gemini 1.5 Flash" — ONLY if verified
    "relay_text":  "Relay — local safety control",# verify actual function in firmware
    "buzzer_text": "Buzzer — audible alert",      # verify actual behavior in firmware
    "eta_label": "Intelligent estimation from real sensor data",
    "security_badges": ["Authentication", "Role-based access", "OTP verification",
                        "Password recovery", "Activity logs", "HTTPS", "Protected APIs"],
}
# Palette — replace with values from the color sampler for exact brand match
C = dict(bg1=(7,14,28), bg2=(13,28,54), panel=(16,33,62), line=(60,110,170),
         cyan=(56,189,248), teal=(45,212,191), white=(236,246,255), muted=(150,172,205),
         green=(52,211,153), amber=(251,191,36), red=(248,113,113), violet=(167,139,250))

# ---------------- utils ----------------
def clamp(x,a=0.0,b=1.0): return max(a,min(b,x))
def ease(x): x=clamp(x); return x*x*(3-2*x)
def easeo(x): x=clamp(x); return 1-(1-x)**3
def lerp(a,b,x): return a+(b-a)*x
def mixc(c1,c2,x): return tuple(int(lerp(a,b,x)) for a,b in zip(c1,c2))

_fc={}
def F(sz,bold=True):
    k=(int(sz),bold)
    if k in _fc: return _fc[k]
    cands=(["DejaVuSans-Bold.ttf","/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "arialbd.ttf","C:\\Windows\\Fonts\\arialbd.ttf","Segoe UI Bold.ttf"] if bold else
           ["DejaVuSans.ttf","/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "arial.ttf","C:\\Windows\\Fonts\\arial.ttf","Segoe UI.ttf"])
    f=None
    for n in cands:
        try: f=ImageFont.truetype(n,int(sz)); break
        except Exception: pass
    if f is None: f=ImageFont.load_default()
    _fc[k]=f; return f

def T(d,xy,s,sz=28,bold=True,fill=None,anchor="mm",alpha=255):
    if alpha<=0: return
    fill=fill or C["white"]
    if len(fill)==3: fill=fill+(int(alpha),)
    else: fill=fill[:3]+(int(fill[3]*alpha/255),)
    d.text(xy,s,font=F(sz,bold),fill=fill,anchor=anchor)

def panel(d,box,r=16,fill=None,outline=None,width=2,alpha=1.0):
    f=fill or C["panel"]; o=outline or C["line"]
    f=f[:3]+(int((f[3] if len(f)>3 else 235)*alpha),)
    o=o[:3]+(int((o[3] if len(o)>3 else 130)*alpha),)
    d.rounded_rectangle(box,r,fill=f,outline=o,width=width)

def chip(d,cx,cy,txt,sz=22,col=None,alpha=1.0):
    col=col or C["cyan"]; f=F(sz,True); w=f.getlength(txt)+44
    d.rounded_rectangle((cx-w/2,cy-24,cx+w/2,cy+24),24,
        fill=(col[0],col[1],col[2],int(42*alpha)),outline=(col[0],col[1],col[2],int(170*alpha)),width=2)
    T(d,(cx,cy),txt,sz,True,col,alpha=alpha)

def wrap(s,px,sz,bold=False):
    f=F(sz,bold); lines=[]; cur=""
    for w_ in s.split():
        t=(cur+" "+w_).strip()
        if f.getlength(t)<=px: cur=t
        else: lines.append(cur); cur=w_
    if cur: lines.append(cur)
    return lines

def _pl(pts): return [math.dist(pts[i],pts[i+1]) for i in range(len(pts)-1)]
def _at(pts,dist):
    segs=_pl(pts); tot=sum(segs); dist%=max(tot,1)
    for i,sl in enumerate(segs):
        if dist<=sl:
            k=dist/sl
            return (lerp(pts[i][0],pts[i+1][0],k),lerp(pts[i][1],pts[i+1][1],k))
        dist-=sl
    return pts[-1]
def flow(d,pts,t,color=None,dots=2,speed=300):
    color=color or C["cyan"]
    d.line(pts,fill=(color[0],color[1],color[2],95),width=3)
    tot=sum(_pl(pts))
    for i in range(dots):
        p=_at(pts,t*speed+i*tot/max(dots,1)); r=6
        d.ellipse((p[0]-r,p[1]-r,p[0]+r,p[1]+r),fill=color+(255,))

def head(d,s,sub=None,y=110):
    T(d,(100,y),s,52,True,C["white"],anchor="lm")
    d.line([(102,y+44),(102+min(620,F(52,True).getlength(s)),y+44)],fill=C["cyan"]+(220,),width=4)
    if sub: T(d,(100,y+82),sub,26,False,C["muted"],anchor="lm")

# ---------------- icons ----------------
def i_bag(d,x,y,s,level=0.6,t=0):
    w,h=s*0.62,s*0.8; box=(x-w/2,y-s*0.4,x+w/2,y-s*0.4+h)
    d.line([(x,y-s*0.66),(x,box[1])],fill=C["muted"]+(200,),width=3)
    d.rounded_rectangle(box,10,fill=(20,44,80,255),outline=C["cyan"]+(230,),width=3)
    fh=int(h*clamp(level))-8
    if fh>0: d.rounded_rectangle((box[0]+5,box[3]-5-fh,box[2]-5,box[3]-5),6,fill=C["cyan"]+(120,))
    d.line([(x,box[3]),(x,box[3]+s*0.3)],fill=C["muted"]+(200,),width=3)
    ph=(t*0.9)%1.0; dy=box[3]+s*0.3+ph*s*0.3; r=5*(1-ph*0.3)
    d.ellipse((x-r,dy-r,x+r,dy+r),fill=C["cyan"]+(230,))
def i_chipic(d,x,y,s,label=""):
    d.rounded_rectangle((x-s/2,y-s/2,x+s/2,y+s/2),6,fill=(24,48,88,255),outline=C["teal"]+(220,),width=2)
    for i in range(4):
        px=x-s/2+(i+1)*s/5
        d.line([(px,y-s/2-6),(px,y-s/2)],fill=C["teal"]+(180,),width=2)
        d.line([(px,y+s/2),(px,y+s/2+6)],fill=C["teal"]+(180,),width=2)
    if label: T(d,(x,y),label,max(10,int(s*0.22)),True,C["teal"])
def i_wifi(d,x,y,s,t=0):
    for k in range(3):
        r=s*0.32*(k+1)
        d.arc((x-r,y-r*0.9,x+r,y+r*0.9),225,315,fill=C["cyan"]+(230-45*k,),width=3)
    d.ellipse((x-4,y+s*0.16-4,x+4,y+s*0.16+4),fill=C["cyan"]+(255,))
def i_cloud(d,x,y,s):
    col=(36,72,124,255)
    d.ellipse((x-s*0.55,y-s*0.05,x-s*0.05,y+s*0.45),fill=col)
    d.ellipse((x-s*0.3,y-s*0.38,x+s*0.3,y+s*0.35),fill=col)
    d.ellipse((x+s*0.05,y-s*0.05,x+s*0.55,y+s*0.45),fill=col)
    d.rounded_rectangle((x-s*0.5,y+s*0.1,x+s*0.5,y+s*0.45),10,fill=col)
def i_loadcell(d,x,y,s):
    d.rounded_rectangle((x-s*0.5,y+s*0.05,x+s*0.5,y+s*0.32),4,outline=C["teal"]+(230,),width=3)
    d.line([(x,y-s*0.32),(x,y)],fill=C["teal"]+(230,),width=3)
    d.polygon([(x-9,y-s*0.16),(x+9,y-s*0.16),(x,y)],fill=C["teal"]+(230,))
def i_board(d,x,y,s,col=None):
    col=col or C["violet"]
    d.rounded_rectangle((x-s*0.5,y-s*0.35,x+s*0.5,y+s*0.35),4,outline=col+(230,),width=3)
    d.rounded_rectangle((x-s*0.17,y-s*0.15,x+s*0.17,y+s*0.15),2,outline=col+(230,),width=2)
    for i in range(3):
        px=x-s*0.33+i*s*0.33
        d.line([(px,y-s*0.35),(px,y-s*0.5)],fill=col+(180,),width=2)
def i_monitor(d,x,y,s):
    d.rounded_rectangle((x-s*0.55,y-s*0.45,x+s*0.55,y+s*0.35),8,fill=(14,30,58,255),outline=C["cyan"]+(230,),width=3)
    d.line([(x,y+s*0.35),(x,y+s*0.55)],fill=C["cyan"]+(230,),width=3)
    d.line([(x-s*0.25,y+s*0.55),(x+s*0.25,y+s*0.55)],fill=C["cyan"]+(230,),width=3)
def i_user(d,x,y,s,col=None):
    col=col or C["cyan"]
    d.ellipse((x-s*0.18,y-s*0.5,x+s*0.18,y-s*0.14),outline=col+(230,),width=3)
    d.arc((x-s*0.42,y-s*0.05,x+s*0.42,y+s*0.8),180,360,fill=col+(230,),width=3)
def i_lock(d,x,y,s):
    d.rounded_rectangle((x-s*0.4,y-s*0.05,x+s*0.4,y+s*0.5),8,fill=C["green"]+(110,),outline=C["green"]+(230,),width=3)
    d.arc((x-s*0.22,y-s*0.45,x+s*0.22,y+s*0.06),180,360,fill=C["green"]+(230,),width=3)
def i_bell(d,x,y,s):
    d.pieslice((x-s*0.4,y-s*0.4,x+s*0.4,y+s*0.4),180,360,fill=C["amber"]+(220,))
    d.rectangle((x-s*0.4,y-2,x+s*0.4,y+8),fill=C["amber"]+(220,))
    d.ellipse((x-4,y+12,x+4,y+20),fill=C["amber"]+(220,))
def i_bubble(d,x,y,s,col=None):
    col=col or C["cyan"]
    d.rounded_rectangle((x-s*0.5,y-s*0.4,x+s*0.5,y+s*0.3),10,fill=(col[0],col[1],col[2],70),outline=col+(230,),width=3)
    d.polygon([(x-s*0.15,y+s*0.28),(x+s*0.05,y+s*0.28),(x-s*0.2,y+s*0.5)],fill=col+(230,))

def node(d,x,y,s,label,ic,appear=1.0,accent=None):
    if appear<=0: return
    s2=s*(0.6+0.4*easeo(appear)); a=int(255*appear)
    d.rounded_rectangle((x-s2,y-s2*0.72,x+s2,y+s2*0.72),16,
        fill=(16,33,62,int(235*appear)),outline=(accent or C["cyan"])+(int(160*appear),),width=2)
    ic(d,x,y-s2*0.2,s2*0.4)
    T(d,(x,y+s2*0.34),label,max(14,int(s2*0.16)),True,C["white"],alpha=a)

# ---------------- screenshots ----------------
def load(n):
    p=os.path.join(SHOT_DIR,n)
    return Image.open(p).convert("RGB") if os.path.exists(p) else None
SHOTS={k:load(v) for k,v in dict(login="login_screenshot.png",otp="otp_verification_screenshot.png",
    reset="reset_password_screenshot.png",admin="admin_panel_screenshot.png",dash="nurse_dashboard_screenshot.png",
    ai="nurse_ai_assistant_screenshot.png",chat="patient_nurse_chat_screenshot.png",
    mon="smart_iv_monitor_screenshot.png",pchat="smart_iv_patient_chat_screenshot.png").items()}

_fitc={}
def paste_fit(im,img,box):
    x0,y0,x1,y1=box; bw,bh=int(x1-x0),int(y1-y0)
    if img is None or bw<10 or bh<10:
        dd=ImageDraw.Draw(im,"RGBA"); dd.rounded_rectangle(box,8,fill=(20,40,72,255))
        T(dd,((x0+x1)/2,(y0+y1)/2),"[screenshot]",20,False,C["muted"]); return
    key=(id(img),bw,bh)
    if key not in _fitc:
        r=min(bw/img.width,bh/img.height)
        _fitc[key]=img.resize((max(1,int(img.width*r)),max(1,int(img.height*r))),Image.LANCZOS)
    f=_fitc[key]; im.paste(f,(int(x0+(bw-f.width)/2),int(y0+(bh-f.height)/2)))

def browser(d,box,title="Smart IV"):
    x0,y0,x1,y1=box
    d.rounded_rectangle(box,14,outline=(70,120,180,170),width=2)
    d.rounded_rectangle((x0,y0,x1,y0+44),14,fill=(22,44,80,255))
    d.rectangle((x0,y0+28,x1,y0+44),fill=(22,44,80,255))
    for i,cc in enumerate([(255,95,86),(255,189,46),(39,201,63)]):
        d.ellipse((x0+18+i*26,y0+15,x0+30+i*26,y0+27),fill=cc+(255,))
    T(d,(x0+104,y0+22),title,19,False,C["muted"],anchor="lm")
def browser_content(box): return (box[0]+12,box[1]+56,box[2]-12,box[3]-12)
def tablet(d,box,label=None):
    d.rounded_rectangle(box,26,fill=(6,12,24,255),outline=(90,140,200,200),width=6)
    x0,y0,x1,y1=box
    d.rounded_rectangle((x0+12,y0+12,x1-12,y1-12),14,outline=(40,80,130,120),width=1)
    if label: T(d,((x0+x1)/2,y1-26),label,20,True,C["muted"])
def tablet_content(box):
    y1=box[3]-46 if False else box[3]-(46 if box[3]-box[1]>300 else 30)
    return (box[0]+24,box[1]+20,box[2]-24,y1-8)

# ---------------- background ----------------
def make_bg():
    im=Image.new("RGB",(W,H))
    d=ImageDraw.Draw(im,"RGBA")
    for y in range(H): d.line([(0,y),(W,y)],fill=mixc(C["bg1"],C["bg2"],y/H))
    ov=Image.new("RGBA",(W,H),(0,0,0,0)); od=ImageDraw.Draw(ov)
    for x in range(0,W,96): od.line([(x,0),(x,H)],fill=(120,170,255,10))
    for y in range(0,H,96): od.line([(0,y),(W,y)],fill=(120,170,255,10))
    im=Image.alpha_composite(im.convert("RGBA"),ov).convert("RGB")
    vg=Image.new("L",(W,H),0); ImageDraw.Draw(vg).ellipse((-W*0.25,-H*0.35,W*1.25,H*1.35),fill=255)
    vg=vg.filter(ImageFilter.GaussianBlur(160))
    return Image.composite(im,Image.new("RGB",(W,H),(4,8,18)),vg)
BG=make_bg()

def chrome(d,label,t):
    d.rounded_rectangle((60,50,244,92),20,fill=(16,33,62,200),outline=C["line"]+(120,),width=2)
    T(d,(152,71),"SMART IV",21,True,C["cyan"])
    d.rounded_rectangle((W-320,50,W-60,92),20,fill=(16,33,62,200),outline=C["line"]+(120,),width=2)
    T(d,(W-190,71),label,19,True,C["muted"])
    d.rounded_rectangle((60,H-28,W-60,H-21),4,fill=(255,255,255,26))
    d.rounded_rectangle((60,H-28,60+(W-120)*clamp(t/DUR),H-21),4,fill=C["cyan"]+(150,))

# ============================ SCENES ============================
def s0(im,d,t,u):
    cx,cy=W/2,H*0.42
    for k in range(3):
        r=250+k*48+8*math.sin(t*1.4+k); a0=t*28+k*120
        d.arc((cx-r,cy-r,cx+r,cy+r),a0,a0+110,fill=C["cyan"]+(52-12*k,),width=3)
        d.arc((cx-r,cy-r,cx+r,cy+r),a0+180,a0+290,fill=C["teal"]+(42-10*k,),width=3)
    i_bag(d,cx,cy-265,112,0.65,t)
    k=easeo(clamp((t-0.25)/1.0))
    T(d,(cx,cy+6),"SMART IV",int(132+18*k),True,C["white"])
    d.line([(cx-330*k,cy+72),(cx+330*k,cy+72)],fill=C["cyan"]+(220,),width=4)
    a1=ease((t-0.9)/0.8)
    T(d,(cx,cy+122),"Smart IV Drip Monitoring System",38,True,C["cyan"],alpha=a1)
    a2=ease((t-1.5)/0.8)
    panel(d,(cx-150,cy+176,cx+150,cy+228),r=26,alpha=a2)
    T(d,(cx,cy+202),"AI Health Tech",27,True,C["teal"],alpha=a2)
    a3=ease((t-1.9)/0.8)
    panel(d,(cx-420,cy+250,cx+420,cy+302),r=26,alpha=a3)
    T(d,(cx,cy+276),"Arab Artificial Intelligence Olympiad 2026",26,True,C["white"],alpha=a3)
    a4=ease((t-2.4)/0.8)
    T(d,(cx,cy+372),"IoT   ·   Real-Time Monitoring   ·   AI",26,False,C["muted"],alpha=a4)

def s1(im,d,t,u):
    head(d,"The Problem","Manual IV monitoring is slow, repetitive — and easy to miss")
    lvl=0.75-0.42*ease(u); i_bag(d,330,430,300,lvl,t)
    T(d,(330,650),"IV fluid level",25,True,C["muted"])
    bl=(math.sin(t*4)>0)
    panel(d,(225,700,435,758),r=14,fill=(60,20,24,220))
    T(d,(330,729),"LEVEL LOW",23,True,C["red"] if bl else (150,60,60))
    for i in range(3):
        y=230+i*150; a=ease((t-0.5-i*0.5)/0.6)
        panel(d,(760,y,1820,y+118),r=16,alpha=a)
        i_user(d,820,y+59,52)
        T(d,(880,y+59),f"Bed {i+1} — Patient",28,True,C["white"],anchor="lm",alpha=int(255*a))
        ok=i<2
        col=(C["green"] if ok else C["red"])
        chip(d,1610,y+59,("Level checked" if ok else "Not checked"),22,col,alpha=a)
        if not ok and bl: chip(d,1610,y+59,"Needs attention",22,C["red"],alpha=a*0.9)
    cx,cy=1700,168
    d.ellipse((cx-42,cy-42,cx+42,cy+42),outline=C["muted"]+(210,),width=4)
    ang=t*1.2
    d.line([(cx,cy),(cx+27*math.cos(ang),cy+27*math.sin(ang))],fill=C["amber"]+(230,),width=3)
    a=ease((t-3.2)/0.8)
    T(d,(W/2,975),"One nurse. Many patients. Every level must be checked by hand.",30,True,C["muted"],alpha=a)

def s2(im,d,t,u):
    head(d,"The Smart IV Hardware","From IV bag weight to live server data — fully automated")
    nodes=[("IV Bag",lambda dd,x,y,s: i_bag(dd,x,y,s,0.6,t)),("Load Cell",i_loadcell),
           ("HX711",lambda dd,x,y,s: i_board(dd,x,y,s,C["teal"])),("ESP8266",i_board),
           ("Wi-Fi",lambda dd,x,y,s: i_wifi(dd,x,y,s,t)),("Smart IV Server",i_cloud)]
    xs=[170+i*316 for i in range(6)]; ny=380
    line=[(xs[0],ny),(xs[-1],ny)]
    if t>3.5: flow(d,line,t-3.5,dots=3,speed=340)
    for i,(lb,ic) in enumerate(nodes):
        a=ease((t-0.4-i*0.4)/0.6)
        node(d,xs[i],ny,108,lb,ic,a)
    a=ease((t-3.0)/0.8)
    panel(d,(170,560,930,724),r=16,alpha=a)
    d.rounded_rectangle((230,610,320,678),8,outline=C["amber"]+(230,),width=3)
    d.line([(255,655),(295,633)],fill=C["amber"]+(230,),width=4)
    T(d,(365,620),"Relay",28,True,C["amber"],anchor="lm",alpha=int(255*a))
    T(d,(365,662),FACTS["relay_text"],22,False,C["muted"],anchor="lm",alpha=int(255*a))
    panel(d,(990,560,1750,724),r=16,alpha=ease((t-3.3)/0.8))
    i_bell(d,1065,650,46)
    T(d,(1135,620),"Buzzer",28,True,C["amber"],anchor="lm",alpha=int(255*ease((t-3.3)/0.8)))
    T(d,(1135,662),FACTS["buzzer_text"],22,False,C["muted"],anchor="lm",alpha=int(255*ease((t-3.3)/0.8)))
    bullets=["Load cell measures the IV bag weight","HX711 amplifies the weight signal",
             "ESP8266 sends readings over Wi-Fi","Server updates every patient in real time"]
    for i,b in enumerate(bullets):
        x=170+(i%2)*850; y=800+(i//2)*64; a=ease((t-3.9-i*0.3)/0.5)
        d.ellipse((x,y-9,x+3,y+3),fill=C["teal"]+(int(255*a),))
        T(d,(x+26,y-3),b,26,False,C["white"],anchor="lm",alpha=int(255*a))

def s3(im,d,t,u):
    head(d,"Real-Time Nurse Dashboard","Live data from every Smart IV stand")
    box=(90,220,1140,1010)
    paste_fit(im,SHOTS["dash"],browser_content(box)); browser(d,box,"Smart IV — Nurse Dashboard")
    box2=(1180,220,1850,700)
    paste_fit(im,SHOTS["mon"],browser_content(box2)); browser(d,box2,"Smart IV — Bedside Monitor")
    panel(d,(1180,740,1850,1010),r=16,alpha=ease((t-0.8)/0.7))
    bl=(math.sin(t*3)>0)
    d.ellipse((1215,772,1229,786),fill=C["red"]+(255,) if bl else C["red"]+(90,))
    T(d,(1244,779),"LIVE",22,True,C["red"],anchor="lm")
    T(d,(1300,779),"Selected patient — live status",22,False,C["muted"],anchor="lm")
    p=62*ease(clamp((t-1.4)/1.6))
    T(d,(1220,880),f"{int(p)}",68,True,C["cyan"],anchor="lm")
    T(d,(1220+ (F(68,True).getlength(str(int(p)))),880),"%",34,True,C["cyan"],anchor="lm",alpha=int(255*ease((t-1.4)/1.6)))
    T(d,(1350,858),"Remaining fluid",24,False,C["muted"],anchor="lm")
    T(d,(1350,896),"updates in real time",22,False,C["muted"],anchor="lm")
    d.rounded_rectangle((1220,940,1810,964),12,fill=(255,255,255,26))
    d.rounded_rectangle((1220,940,1220+int(590*p/100),964),12,fill=C["cyan"]+(220,))

def s4(im,d,t,u):
    head(d,"Smart AI Assistant","Answers built on the current system data")
    box=(90,220,1150,1010)
    paste_fit(im,SHOTS["ai"],browser_content(box)); browser(d,box,"Smart IV — AI Assistant")
    panel(d,(1190,220,1850,1010),r=16)
    T(d,(1220,258),"Example conversation — illustrative",20,False,C["muted"],anchor="lm")
    a1=ease((t-0.9)/0.6)
    if a1>0:
        i_user(d,1240,330,44)
        T(d,(1275,330),"Nurse",22,True,C["cyan"],anchor="lm",alpha=int(255*a1))
        q="How is the fluid level for Bed 3?"
        lines=wrap(q,520,24); h=34+len(lines)*36
        panel(d,(1220,360,1800,360+h),r=14,fill=(24,48,88,235),outline=C["cyan"]+(120,),alpha=a1)
        for i,l in enumerate(lines): T(d,(1244,388+i*36),l,24,False,C["white"],anchor="lm",alpha=int(255*a1))
    if 1.8<t<2.6:
        for k in range(3):
            r=5+3*math.sin(t*6+k)
            d.ellipse((1240+k*30,470-r,1240+k*30+2*r,470+r),fill=C["teal"]+(200,))
    a2=ease((t-2.6)/0.6)
    if a2>0:
        ans="Bed 3 is at 62%. Estimated time remaining: about 54 minutes."
        lines=wrap(ans,520,24); h=34+len(lines)*36
        panel(d,(1220,500,1800,500+h),r=14,fill=(18,58,54,235),outline=C["teal"]+(150,),alpha=a2)
        T(d,(1244,478),"AI Assistant",22,True,C["teal"],anchor="lm",alpha=int(255*a2))
        for i,l in enumerate(lines): T(d,(1244,528+i*36),l,24,False,C["white"],anchor="lm",alpha=int(255*a2))
    a3=ease((t-3.6)/0.6)
    chip(d,1330,700,"Context-aware",22,C["teal"],alpha=a3)
    chip(d,1600,700,"Natural language",22,C["cyan"],alpha=a3)
    if FACTS["ai_model_label"]:
        chip(d,1420,770,FACTS["ai_model_label"],20,C["violet"],alpha=ease((t-4.1)/0.6))
    T(d,(1520,880),"The assistant answers from live patient data —",23,False,C["muted"],alpha=int(255*ease((t-4.4)/0.6)))
    T(d,(1520,912),"separate from the sensor monitoring pipeline.",23,False,C["muted"],alpha=int(255*ease((t-4.4)/0.6)))

def _rem(m): return clamp(100-65*m/60+1.5*math.sin(m/4),20,100)
def s5(im,d,t,u):
    head(d,"Intelligent Infusion-Time Estimation",FACTS["eta_label"]+"  ·  illustrative data")
    x0,x1,y0,y1=170,1120,280,840
    PX=lambda m: lerp(x0,x1,m/60); PY=lambda p: lerp(y0,y1,(100-p)/80)
    for m in range(0,61,10):
        d.line([(PX(m),y0),(PX(m),y1)],fill=(255,255,255,18)); T(d,(PX(m),y1+34),f"{m}",22,False,C["muted"])
    for p_ in range(20,101,20):
        d.line([(x0,PY(p_)),(x1,PY(p_))],fill=(255,255,255,18)); T(d,(x0-14,PY(p_)),f"{p_}%",22,False,C["muted"],anchor="rm")
    T(d,((x0+x1)/2,y1+80),"Time (minutes)",24,False,C["muted"])
    T(d,(x0-14,y0-36),"Remaining %",22,True,C["muted"],anchor="rm")
    pts=[(PX(m),PY(_rem(m))) for m in range(0,61,2)]
    d.line(pts,fill=C["cyan"]+(220,),width=4)
    for m in range(0,61,5):
        a=ease((t-0.6-m*0.045)/0.4)
        if a>0: d.ellipse((PX(m)-5,PY(_rem(m))-5,PX(m)+5,PY(_rem(m))+5),fill=C["teal"]+(int(255*a),))
    mm=lerp(8,46,ease(u)); mx,my=PX(mm),PY(_rem(mm))
    d.ellipse((mx-18,my-18,mx+18,my+18),outline=C["cyan"]+(180,),width=2)
    d.ellipse((mx-9,my-9,mx+9,my+9),fill=C["white"]+(255,))
    est=_rem(mm)*60/65
    panel(d,(1200,240,1850,560),r=16,alpha=ease((t-0.5)/0.7))
    T(d,(1230,285),"Sensor reading",24,False,C["muted"],anchor="lm")
    T(d,(1810,285),f"{_rem(mm):.0f} %",30,True,C["cyan"],anchor="rm")
    T(d,(1230,340),"Consumption rate",24,False,C["muted"],anchor="lm")
    T(d,(1810,340),"~1.1 %/min",30,True,C["cyan"],anchor="rm")
    d.line([(1230,390),(1820,390)],fill=C["line"]+(120,),width=2)
    T(d,(1230,432),"Estimated remaining",26,True,C["white"],anchor="lm")
    T(d,(1230,495),f"≈ {int(est)} min",54,True,C["teal"],anchor="lm")
    steps=["Sensor readings","Data filtering","Consumption rate","Remaining fluid","Estimated time"]
    for i,s_ in enumerate(steps):
        a=ease((t-1.0-i*0.45)/0.5); y=640+i*82
        panel(d,(1230,y-26,1810,y+26),r=24,alpha=a)
        T(d,(1254,y),s_,23,True,C["white"],anchor="lm",alpha=int(255*a))
        if i<4 and a>0.8:
            d.polygon([(1520,y+34),(1540,y+34),(1530,y+48)],fill=C["cyan"]+(200,))

def s6(im,d,t,u):
    head(d,"Patient Smart IV Stand","A clear bedside view for the patient")
    d.line([(300,980),(300,330)],fill=(120,150,190,255),width=10)
    d.ellipse((200,958,400,1000),fill=(30,55,95,255),outline=(90,130,180,255),width=3)
    d.line([(300,332),(470,332)],fill=(120,150,190,255),width=10)
    i_bag(d,300,470,130,0.55,t)
    box=(480,240,1300,1010)
    paste_fit(im,SHOTS["mon"],tablet_content(box))
    tablet(d,box,"Smart IV — Patient View")
    items=["Patient information","IV status","Remaining fluid","Percentage","Estimated time"]
    for i,it in enumerate(items):
        a=ease((t-0.9-i*0.35)/0.5); y=300+i*72
        panel(d,(1360,y-26,1850,y+26),r=26,alpha=a)
        d.line([(1384,y),(1396,y+10),(1416,y-12)],fill=C["green"]+(int(255*a),),width=4)
        T(d,(1438,y),it,24,False,C["white"],anchor="lm",alpha=int(255*a))
    k=easeo((t-2.6)/0.9); off=int((1-k)*620)
    b2=(1360+off,600,1850+off,1000)
    paste_fit(im,SHOTS["pchat"],tablet_content(b2))
    tablet(d,b2,"Patient chat")

def s7(im,d,t,u):
    head(d,"Patient ↔ Nurse Communication","Real-time messages over Socket.IO")
    panel(d,(140,260,760,1000),r=20)
    i_user(d,200,320,48)
    T(d,(236,320),"Patient — bedside",26,True,C["white"],anchor="lm",alpha=int(255*ease((t-0.5)/0.5)))
    a=ease((t-1.0)/0.6)
    if a>0:
        lines=wrap("Please come — I need help with my IV.",420,24)
        panel(d,(180,380,660,380+34+len(lines)*36),r=14,fill=(24,48,88,235),outline=C["cyan"]+(120,),alpha=a)
        for i,l in enumerate(lines): T(d,(204,408+i*36),l,24,False,C["white"],anchor="lm",alpha=int(255*a))
    pb=0.75+0.25*math.sin(t*4)
    panel(d,(300,760,600,830),r=35,fill=C["cyan"]+(int(120*pb)+60,),outline=C["cyan"]+(255,),width=3,alpha=ease((t-2.0)/0.5))
    T(d,(450,795),"REQUEST NURSE",26,True,C["white"],alpha=int(255*ease((t-2.0)/0.5)))
    hub=(840,560,1080,690)
    panel(d,hub,r=16,alpha=ease((t-0.7)/0.6))
    i_wifi(d,960,608,40,t)
    T(d,(960,660),"Socket.IO",24,True,C["cyan"],alpha=int(255*ease((t-0.7)/0.6)))
    lseg=[(760,625),(840,625)]; rseg=[(1080,625),(1160,625)]
    d.line(lseg,fill=C["cyan"]+(90,),width=3); d.line(rseg,fill=C["cyan"]+(90,),width=3)
    if 3.2<t<3.9: flow(d,lseg,t-3.2,dots=1,speed=115)
    if 4.2<t<4.9: flow(d,rseg,t-4.2,dots=1,speed=115)
    panel(d,(1160,260,1780,1000),r=20)
    i_monitor(d,1220,320,46)
    T(d,(1256,320),"Nurse Dashboard",26,True,C["white"],anchor="lm",alpha=int(255*ease((t-0.9)/0.5)))
    a4=ease((t-4.6)/0.4)
    if a4>0:
        panel(d,(1200,400,1740,462),r=14,fill=(70,25,28,int(230*a4)),outline=C["red"]+(200,))
        i_bell(d,1240,430,34)
        T(d,(1275,431),"New request — patient bedside",23,True,C["red"],anchor="lm",alpha=int(255*a4))
    a5=ease((t-6.0)/0.6)
    if a5>0:
        panel(d,(1200,520,1600,576),r=14,fill=(18,58,54,235),outline=C["teal"]+(150,),alpha=a5)
        T(d,(1224,548),"On my way.",24,False,C["white"],anchor="lm",alpha=int(255*a5))
    T(d,(960,930),"Instant delivery · Socket.IO real-time events",24,False,C["muted"],alpha=int(255*ease((t-6.6)/0.6)))

def s8(im,d,t,u):
    head(d,"Security & User Management","Role-based access for nurses and admins")
    steps=[("Login",i_lock),("OTP Verification",i_lock),("Nurse / Admin Role",i_user),("Dashboard",i_monitor)]
    xs=[300,760,1220,1680]
    for i,(lb,ic) in enumerate(steps):
        a=ease((t-0.3-i*0.4)/0.5); node(d,xs[i],300,104,lb,ic,a,accent=C["green"])
        if i<3 and a>0.7:
            d.line([(xs[i]+116,300),(xs[i+1]-116,300)],fill=C["green"]+(120,),width=3)
            d.polygon([(xs[i+1]-126,292),(xs[i+1]-126,308),(xs[i+1]-114,300)],fill=C["green"]+(220,))
    cards=[("login","Login screen"),("otp","OTP verification"),("reset","Password reset"),("admin","Admin panel")]
    for i,(k,lb) in enumerate(cards):
        x0=85+i*445; a=ease((t-1.4-i*0.35)/0.5)
        if a<=0: continue
        panel(d,(x0,470,x0+415,880),r=14,alpha=a)
        paste_fit(im,SHOTS[k],(x0+12,482,x0+403,868))
        T(d,(x0+207,918),lb,23,True,C["muted"],alpha=int(255*a))
    x=100
    for b in FACTS["security_badges"]:
        w=F(21,True).getlength(b)+40
        a=ease((t-3.2)/0.6)
        if a>0: chip(d,x+w/2,975,b,21,C["teal"],alpha=a)
        x+=w+18

def s9(im,d,t,u):
    if t<4.6:
        spine=[("Smart IV Hardware",i_bag),("ESP8266",i_board),("Wi-Fi / HTTPS",i_wifi),("Node.js / Express",i_cloud)]
        ys=[150,252,354,456]
        d.line([(960,170),(960,436)],fill=C["cyan"]+(70,),width=3)
        for i,(lb,ic) in enumerate(spine):
            a=ease((t-0.15-i*0.33)/0.35); node(d,960,ys[i],122,lb,ic,a)
        for (bx,by) in [(640,560),(1280,560)]:
            a=ease((t-1.45)/0.35)
            if a>0:
                d.line([(960,492),(bx,by-70)],fill=C["cyan"]+(70,),width=3)
        a=ease((t-1.45)/0.35)
        node(d,640,560,110,"MongoDB",i_dbic := (lambda dd,x,y,s: dd.ellipse((x-s*0.5,y-s*0.4,x+s*0.5,y+s*0.4),outline=C["violet"]+(230,),width=3)),a,accent=C["violet"])
        node(d,1280,560,110,"Socket.IO",lambda dd,x,y,s: i_wifi(dd,x,y,s),a,accent=C["teal"])
        for (bx,by) in [(640,560),(1280,560)]:
            a2=ease((t-1.8)/0.35)
            if a2>0: d.line([(bx,by+70),(bx,622)],fill=C["cyan"]+(70,),width=3)
        a2=ease((t-1.8)/0.35)
        node(d,640,682,112,"Nurse Dashboard",i_monitor,a2)
        node(d,1280,682,112,"Patient Smart IV Stand",i_monitor,a2)
        d.line([(760,682),(1160,682)],fill=C["teal"]+(150,),width=3)
        d.polygon([(752,674),(752,690),(740,682)],fill=C["teal"]+(220,))
        d.polygon([(1168,674),(1168,690),(1180,682)],fill=C["teal"]+(220,))
        a3=ease((t-2.4)/0.5)
        chip(d,560,812,"AI Assistant",24,C["violet"],alpha=a3)
        chip(d,960,812,"Intelligent Time Estimation",24,C["teal"],alpha=a3)
        chip(d,1400,812,"Patient–Nurse Chat",24,C["cyan"],alpha=a3)
    # ---- end card ----
    if t>4.6:
        k=ease((t-4.6)/0.8)
        ov=Image.new("RGBA",(W,H),(0,0,0,0)); od=ImageDraw.Draw(ov)
        od.rectangle((0,0,W,H),fill=C["bg1"]+(int(255*k),))
        A=lambda x:int(255*clamp((t-4.9)/0.7)*k)
        d2=od
        i_bag(d2,960,260,100,0.65,t)
        T(d2,(960,430),"SMART IV",130,True,C["white"],alpha=A(1))
        d2.line([(960-280,486),(960+280,486)],fill=C["cyan"]+(int(220*k),),width=4)
        T(d2,(960,530),"Smart IV Drip Monitoring System",34,True,C["cyan"],alpha=A(1))
        T(d2,(960,600),"AI Health Tech",30,True,C["teal"],alpha=A(1))
        for i,m in enumerate(FACTS["members"]):
            T(d2,(960,652+i*32),m,21,False,C["muted"],alpha=A(1))
        T(d2,(960,782),"Arab Artificial Intelligence Olympiad 2026",27,True,C["white"],alpha=A(1))
        T(d2,(960,856),"“"+FACTS["tagline"]+"”",26,False,C["cyan"],alpha=A(1))
        im.paste(ov,(0,0),ov)

# ---------------- scene table ----------------
SCN=[("OPENING",0,15,s0),("THE PROBLEM",15,35,s1),("HARDWARE",35,60,s2),
     ("NURSE DASHBOARD",60,85,s3),("AI ASSISTANT",85,105,s4),("SMART ESTIMATION",105,125,s5),
     ("PATIENT STAND",125,145,s6),("COMMUNICATION",145,160,s7),("SECURITY",160,172,s8),
     ("OVERVIEW",172,180,s9)]

def frame(t):
    idx=len(SCN)-1
    for i,sc in enumerate(SCN):
        if t<sc[2]: idx=i; break
    name,a,b,fn=SCN[idx]
    lt=clamp(t-a,0,b-a)
    im=BG.copy()
    fn(im,ImageDraw.Draw(im,"RGBA"),lt,lt/(b-a))
    if not (name=="OVERVIEW" and t>171+4.6):
        chrome(ImageDraw.Draw(im,"RGBA"),name,t)
    XF=0.5
    if idx>0 and lt<XF:
        pa,pb,pf=SCN[idx-1][1],SCN[idx-1][2],SCN[idx-1][3]
        pim=BG.copy(); pf(pim,ImageDraw.Draw(pim,"RGBA"),pb-pa,1.0)
        im=Image.blend(pim,im,ease(lt/XF))
    if t<0.5: im=Image.blend(Image.new("RGB",(W,H),(0,0,0)),im,ease(t/0.5))
    if t>DUR-0.6: im=Image.blend(im,Image.new("RGB",(W,H),(0,0,0)),ease((t-(DUR-0.6))/0.6))
    return im

def render():
    cmd=["ffmpeg","-y","-loglevel","error","-f","rawvideo","-pix_fmt","rgb24",
         "-s",f"{W}x{H}","-r",str(FPS),"-i","-","-c:v","libx264","-preset","veryfast",
         "-crf","18","-pix_fmt","yuv420p",OUT]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    n=int(DUR*FPS)
    for i in range(n):
        p.stdin.write(frame(i/FPS).tobytes())
        if i%300==0: print(f"frame {i}/{n}")
    p.stdin.close(); p.wait(); print("wrote",OUT)

BUDGET={"01":14.3,"02":19.3,"03":24.3,"04":24.3,"05":19.3,"06":19.3,"07":19.3,"08":14.3,"09":11.3,"10":7.3}
PLACE={"01":0.6,"02":15.6,"03":35.6,"04":60.6,"05":85.6,"06":105.6,"07":125.6,"08":145.6,"09":160.6,"10":172.6}

def audio():
    import wave, numpy as np
    SR=24000; total=int(SR*DUR); buf=np.zeros(total,dtype=np.float32)
    for k,st in PLACE.items():
        path=f"vo/{k}.wav"
        if not os.path.exists(path): print("missing",path); continue
        with wave.open(path,"rb") as w:
            sr=w.getframerate(); d=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16)
        if sr!=SR: print(f"[warn] {path} is {sr}Hz, expected {SR} — adjust SR"); continue
        a=d.astype(np.float32)/32768.0; dur=len(a)/SR
        i0=int(st*SR); end=min(total,i0+len(a)); buf[i0:end]+=a[:end-i0]
        flag="  [!! overruns scene — trim text or shift boundaries]" if dur>BUDGET[k] else ""
        print(f"{k}: {dur:.1f}s at {st:.1f}s (budget {BUDGET[k]}s){flag}")
    out=(np.clip(buf,-1,1)*32767).astype(np.int16)
    with wave.open("vo_full.wav","wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
    print("wrote vo_full.wav")

if __name__=="__main__":
    missing=[k for k,v in SHOTS.items() if v is None]
    if missing: print("[warn] missing screenshots (placeholders will render):",missing)
    mode=sys.argv[1] if len(sys.argv)>1 else "video"
    audio() if mode=="audio" else render()