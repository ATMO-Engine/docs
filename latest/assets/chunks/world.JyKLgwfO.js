const Nt=`
attribute vec2 aPos;
varying vec2 vUv;
void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`,Wt=`
precision mediump float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uFogA;
uniform vec3 uFogB;
uniform vec3 uFogC;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.02 + vec2(1.7, 9.2);
        a *= 0.5;
    }
    return v;
}
void main() {
    vec2 p = vec2(vUv.x * uRes.x / uRes.y, vUv.y);
    float t = uTime * 0.03;
    vec2 warp = vec2(fbm(p * 1.4 + vec2(t, -t * 0.6)), fbm(p * 1.4 + vec2(5.2 - t * 0.8, 1.3 + t)));
    float far = fbm(p * 1.1 + warp * 1.6 + vec2(t * 0.5, 0.0));
    float mid = fbm(p * 2.1 - warp * 1.2 + vec2(-t, t * 0.7) + 3.7);
    float near = fbm(p * 3.4 + warp * 0.8 + vec2(t * 1.6, -t * 0.4) + 8.1);

    // Lobes keep the light on the right, behind the animation, and away from the hero text.
    float lobeA = smoothstep(1.15, 0.05, distance(vUv, vec2(0.78, 0.62)));
    float lobeB = smoothstep(1.0, 0.0, distance(vUv, vec2(0.95, 0.15)));
    float lobeC = smoothstep(0.9, 0.0, distance(vUv, vec2(0.45, 1.05)));

    vec3 fog = uFogA * pow(far, 2.2) * 1.9 * lobeA
             + uFogB * pow(mid, 2.6) * 1.6 * lobeB
             + uFogC * pow(near, 3.0) * 1.3 * lobeC;
    float density = clamp(max(max(fog.r, fog.g), fog.b), 0.0, 1.0);
    gl_FragColor = vec4(fog, density);
}`,zt=`
precision mediump float;
varying vec2 vUv;
uniform sampler2D uFog;
uniform vec2 uRes;
uniform float uDpr;
uniform vec2 uOrigin;
uniform vec3 uBase;
uniform vec3 uGrid;
uniform vec3 uAxisX;
uniform vec3 uAxisY;
uniform float uDark;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
    vec4 fog = texture2D(uFog, vUv);
    vec3 color;
    if (uDark > 0.5) {
        color = uBase + fog.rgb;
    } else {
        // On light backgrounds the fog tints with its hue instead of adding light.
        vec3 hue = fog.rgb / max(fog.a, 0.001);
        color = mix(uBase, hue, (1.0 - exp(-fog.a * 1.3)) * 0.5);
    }

    vec2 px = gl_FragCoord.xy / uDpr;
    vec2 cell = mod(px - uOrigin + 12.0, 24.0) - 12.0;
    float dot = 1.0 - smoothstep(0.55, 1.35, length(cell));
    float gridAlpha = (uDark > 0.5 ? 0.09 : 0.16) * (0.65 + fog.a * 0.8);
    color = mix(color, uGrid, dot * gridAlpha);

    float lineWidth = 0.75;
    float vertical = 1.0 - smoothstep(0.0, lineWidth, abs(px.x - uOrigin.x));
    float horizontal = 1.0 - smoothstep(0.0, lineWidth, abs(px.y - uOrigin.y));
    float axisAlpha = uDark > 0.5 ? 0.38 : 0.45;
    color = mix(color, uAxisX, vertical * axisAlpha);
    color = mix(color, uAxisY, horizontal * axisAlpha);

    color += (hash(gl_FragCoord.xy) - 0.5) / 255.0 * 1.5;
    gl_FragColor = vec4(color, 1.0);
}`,qt=`
attribute vec2 aPos;
attribute float aAlpha;
uniform vec2 uRes;
varying float vAlpha;
void main() {
    vAlpha = aAlpha;
    gl_Position = vec4(aPos / uRes * 2.0 - 1.0, 0.0, 1.0);
}`,$t=`
precision mediump float;
uniform vec3 uColor;
varying float vAlpha;
void main() {
    gl_FragColor = vec4(uColor, vAlpha);
}`,Kt=`
attribute vec2 aPos;
attribute float aSize;
attribute vec3 aColor;
attribute float aRot;
attribute float aSelected;
attribute float aDepth;
uniform vec2 uRes;
uniform float uDpr;
varying vec3 vColor;
varying float vRot;
varying float vSelected;
varying float vDepth;
void main() {
    vColor = aColor;
    vDepth = aDepth;
    vRot = aRot;
    vSelected = aSelected;
    gl_PointSize = aSize * uDpr;
    gl_Position = vec4(aPos / uRes * 2.0 - 1.0, 0.0, 1.0);
}`,Zt=`
precision mediump float;
uniform float uDark;
uniform vec3 uSelection;
varying vec3 vColor;
varying float vRot;
varying float vSelected;
varying float vDepth;
void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot);
    float s = sin(vRot);
    p = mat2(c, -s, s, c) * p;
    float d = abs(p.x) + abs(p.y);
    float aa = 0.02;
    float edge = 0.18;
    float stroke = smoothstep(edge - 0.045 - aa, edge - 0.045, d) * (1.0 - smoothstep(edge, edge + aa, d));
    float fill = 1.0 - smoothstep(edge - aa, edge, d);
    float ring = vSelected * smoothstep(0.30, 0.30 + aa, d) * (1.0 - smoothstep(0.335, 0.335 + aa, d));

    vec3 color = vColor;
    float alpha;
    if (uDark > 0.5) {
        float glow = exp(-d * 10.0) * 0.55;
        alpha = max(fill * 0.95, glow);
        color = mix(vColor, vec3(1.0), fill * 0.25);
    } else {
        alpha = max(stroke, fill * 0.16);
    }
    // Far entities fade into the atmosphere.
    alpha *= mix(0.28, 1.0, vDepth);
    color = mix(color, uSelection, ring);
    alpha = max(alpha, ring);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
}`;function nt(n,c,t){const y=n.createProgram();if(!y)throw new Error("createProgram failed");for(const[H,V]of[[n.VERTEX_SHADER,c],[n.FRAGMENT_SHADER,t]]){const F=n.createShader(H);if(!F)throw new Error("createShader failed");if(n.shaderSource(F,V),n.compileShader(F),!n.getShaderParameter(F,n.COMPILE_STATUS))throw new Error(n.getShaderInfoLog(F)??"shader");n.attachShader(y,F)}if(n.linkProgram(y),!n.getProgramParameter(y,n.LINK_STATUS))throw new Error(n.getProgramInfoLog(y)??"link");return y}function it(n,c,t){return Object.fromEntries(t.map(y=>[y,n.getUniformLocation(c,y)]))}const w=118,lt=30,dt=150,pt=7,kt=26,jt=26,Ot=.28,gt=4096;function Jt(n){let c=n;return()=>{c|=0,c=c+1831565813|0;let t=Math.imul(c^c>>>15,1|c);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}function Qt(n,c){const t=n.getContext("webgl",{alpha:!1,antialias:!0,premultipliedAlpha:!1,powerPreference:"low-power"});if(!t)return null;const y=nt(t,Nt,Wt),H=nt(t,Nt,zt),V=nt(t,qt,$t),F=nt(t,Kt,Zt),W=it(t,y,["uRes","uTime","uFogA","uFogB","uFogC"]),_=it(t,H,["uFog","uRes","uDpr","uOrigin","uBase","uGrid","uAxisX","uAxisY","uDark"]),xt=it(t,V,["uRes","uColor"]),K=it(t,F,["uRes","uDpr","uDark","uSelection"]),yt=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,yt),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW);const Xt=t.createBuffer(),Gt=t.createBuffer(),U=new Float32Array(gt*2*3),st=t.createTexture(),At=t.createFramebuffer();let g=c.palette,m=0,u=0,z=1,Z=0,j=0,ct=0,ft=0,N=0,C=c.animate,J=!0,T=0,Q=0,tt=!1,Et=!1,x=0,k=7,et=!1,ut=0;const L={x:-1e4,y:-1e4,active:!1},S=Jt(42912),l=[],Rt=new Map;let R=new Float32Array(0);function Yt(){var f;const e=Math.floor(S()*c.kinds.length),r=(Rt.get(e)??0)+1;Rt.set(e,r);const a=((f=c.kinds[e])==null?void 0:f.names)??["Entity"],o=a[(r-1)%a.length]??"Entity",i=S()*Math.PI*2,s=pt+S()*(kt-pt);return{id:l.length+1,name:`${o}_${String(r).padStart(2,"0")}`,kind:e,depth:.3+.7*Math.pow(S(),.8),x:S()*m,y:S()*u,vx:Math.cos(i)*s,vy:Math.sin(i)*s,ix:0,iy:0,rot:0,rotVel:0,scale:1,targetScale:1,scaleHold:0}}function bt(){const e=n.getBoundingClientRect();z=Math.min(window.devicePixelRatio||1,1.75),m=Math.max(1,e.width),u=Math.max(1,e.height),n.width=Math.round(m*z),n.height=Math.round(u*z),ct=Math.round(m*(m>900?.64:.5)),ft=Math.round(u*.44),Z=Math.max(1,Math.round(n.width/2)),j=Math.max(1,Math.round(n.height/2)),t.bindTexture(t.TEXTURE_2D,st),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,Z,j,0,t.RGBA,t.UNSIGNED_BYTE,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,At),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,st,0),t.bindFramebuffer(t.FRAMEBUFFER,null);const r=Math.round(Math.min(260,Math.max(80,m*u/5600)));for(;l.length<r;)l.push(Yt());l.length>r&&(l.length=r);const a=l[x];l.sort((o,i)=>o.depth-i.depth),x=a?l.indexOf(a):0;for(const o of l)o.x=(o.x%m+m)%m,o.y=(o.y%u+u)%u;x=Math.min(x,l.length-1),R=new Float32Array(l.length*9)}let ot=new Map;function Ft(){ot=new Map;const e=Math.ceil(m/w)+1;return l.forEach((r,a)=>{const o=Math.floor(r.y/w)*e+Math.floor(r.x/w),i=ot.get(o);i?i.push(a):ot.set(o,[a])}),e}function Mt(e,r,a){const o=l[e],i=Math.floor(o.x/w),s=Math.floor(o.y/w);for(let f=s-1;f<=s+1;f++)for(let v=i-1;v<=i+1;v++){const d=ot.get(f*r+v);if(d)for(const p of d){if(p===e)continue;const A=l[p],h=A.x-o.x,M=A.y-o.y,P=h*h+M*M;P<w*w&&a(p,h,M,P)}}}function ht(e){N+=e;const r=Ft();l.forEach((o,i)=>{let s=0,f=0,v=0,d=0,p=0,A=0,h=0;Mt(i,r,(E,X,G,I)=>{const Y=l[E];if(!(Math.abs(Y.depth-o.depth)>Ot)&&(h++,v+=Y.vx,d+=Y.vy,p+=X,A+=G,I<lt*lt&&I>.01)){const at=Math.sqrt(I);s-=X/at*(lt-at)*.9,f-=G/at*(lt-at)*.9}}),h>0&&(s+=(v/h-o.vx)*.35+p/h*.012,f+=(d/h-o.vy)*.35+A/h*.012);const M=Math.sin(o.x*.0042+N*.13)+Math.cos(o.y*.0051-N*.11)+Math.sin((o.x+o.y)*.0017+N*.07);if(s+=Math.cos(M*1.7)*4.5,f+=Math.sin(M*1.7)*4.5,L.active){const E=o.x-L.x,X=o.y-L.y,G=E*E+X*X;if(G<dt*dt&&G>1){const I=Math.sqrt(G),Y=(1-I/dt)*60;s+=E/I*Y,f+=X/I*Y}}o.vx+=s*e,o.vy+=f*e;const P=Math.hypot(o.vx,o.vy)||1,B=Math.min(kt,Math.max(pt,P));o.vx=o.vx/P*B,o.vy=o.vy/P*B;const $=Math.exp(-e*2.2);o.ix*=$,o.iy*=$;const rt=.45+.55*o.depth;o.x+=(o.vx*rt+o.ix)*e,o.y+=(o.vy*rt+o.iy)*e;const b=30;o.x<-b&&(o.x+=m+b*2),o.x>m+b&&(o.x-=m+b*2),o.y<-b&&(o.y+=u+b*2),o.y>u+b&&(o.y-=u+b*2),o.rot+=o.rotVel*e,o.rotVel*=Math.exp(-e*1.6),o.scaleHold>0?o.scaleHold-=e:o.targetScale=1,o.scale+=(o.targetScale-o.scale)*Math.min(1,e*6)}),k-=e;const a=l[x];(k<=0||!et&&a&&!St(a.x,a.y))&&Tt()}function _t(){return m>900?{x0:m*.58,x1:m*.96,y0:u*.12,y1:u*.8}:{x0:m*.08,x1:m*.92,y0:u*.72,y1:u*.86}}function St(e,r){const a=_t();return e>=a.x0&&e<=a.x1&&r>=a.y0&&r<=a.y1}function Tt(){k=7,et=!1;const e=_t(),r=e.x0+S()*(e.x1-e.x0),a=e.y0+S()*(e.y1-e.y0);let o=-1,i=1/0;l.forEach((s,f)=>{const v=(s.x-r)**2+(s.y-a)**2;s.depth>.6&&St(s.x,s.y)&&v<i&&(o=f,i=v)}),o>=0&&(x=o),q()}function Ht(e,r,a=1/0){let o=-1,i=a*a;return l.forEach((s,f)=>{const v=(s.x-e)**2+(s.y-r)**2;v<i&&(o=f,i=v)}),o<0?!1:(x=o,q(),!0)}function q(){const e=l[x];if(!e||!c.onSelect)return;const r=c.kinds[e.kind];c.onSelect({id:e.id,name:e.name,component:(r==null?void 0:r.component)??"Entity2D",color:(r==null?void 0:r.css)??"#4c6ef5",x:(e.x-ct)/10,y:(ft-e.y)/10,rotation:(e.rot*180/Math.PI%360+360)%360,scale:e.scale})}function Vt(){var v;const[e,r,a]=g.base;t.bindFramebuffer(t.FRAMEBUFFER,At),t.viewport(0,0,Z,j),t.disable(t.BLEND),t.useProgram(y),t.uniform2f(W.uRes,Z,j),t.uniform1f(W.uTime,N),t.uniform3fv(W.uFogA,g.fog[0]),t.uniform3fv(W.uFogB,g.fog[1]),t.uniform3fv(W.uFogC,g.fog[2]),Dt(y),t.bindFramebuffer(t.FRAMEBUFFER,null),t.viewport(0,0,n.width,n.height),t.clearColor(e,r,a,1),t.clear(t.COLOR_BUFFER_BIT),t.useProgram(H),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,st),t.uniform1i(_.uFog,0),t.uniform2f(_.uRes,n.width,n.height),t.uniform1f(_.uDpr,z),t.uniform2f(_.uOrigin,ct,u-ft),t.uniform3fv(_.uBase,g.base),t.uniform3fv(_.uGrid,g.grid),t.uniform3fv(_.uAxisX,g.axisX),t.uniform3fv(_.uAxisY,g.axisY),t.uniform1f(_.uDark,g.dark?1:0),Dt(H),t.enable(t.BLEND),t.blendFunc(t.SRC_ALPHA,g.dark?t.ONE:t.ONE_MINUS_SRC_ALPHA);const o=Ft();let i=0;for(let d=0;d<l.length&&i<gt;d++){const p=l[d];Mt(d,o,(A,h,M,P)=>{if(A<d||i>=gt)return;const B=l[A];if(Math.abs(B.depth-p.depth)>Ot)return;const $=(1-Math.sqrt(P)/w)*Math.min(p.depth,B.depth),rt=d===x||A===x?1.8:1,b=Math.min(1,$*$*(g.dark?.5:.75)*rt),E=i*6;U[E]=p.x,U[E+1]=u-p.y,U[E+2]=b,U[E+3]=B.x,U[E+4]=u-B.y,U[E+5]=b,i++})}t.useProgram(V),t.uniform2f(xt.uRes,m,u),t.uniform3fv(xt.uColor,g.link),vt(V,Xt,12,[["aPos",2,0],["aAlpha",1,8]]),t.bufferData(t.ARRAY_BUFFER,U.subarray(0,i*6),t.DYNAMIC_DRAW),t.drawArrays(t.LINES,0,i*2),t.blendFunc(t.SRC_ALPHA,t.ONE_MINUS_SRC_ALPHA),l.forEach((d,p)=>{var M;const A=((M=c.kinds[d.kind])==null?void 0:M.color)??[1,1,1],h=p*9;R[h]=d.x,R[h+1]=u-d.y,R[h+2]=jt*(.45+.55*d.depth)*d.scale*(p===x?1.25:1),R[h+3]=A[0],R[h+4]=A[1],R[h+5]=A[2],R[h+6]=d.rot,R[h+7]=p===x?1:0,R[h+8]=p===x?1:d.depth}),t.useProgram(F),t.uniform2f(K.uRes,m,u),t.uniform1f(K.uDpr,z),t.uniform1f(K.uDark,g.dark?1:0),t.uniform3fv(K.uSelection,g.selection),vt(F,Gt,36,[["aPos",2,0],["aSize",1,8],["aColor",3,12],["aRot",1,24],["aSelected",1,28],["aDepth",1,32]]),t.bufferData(t.ARRAY_BUFFER,R,t.DYNAMIC_DRAW),t.drawArrays(t.POINTS,0,l.length);const s=c.label,f=l[x];s&&f&&(s.style.transform=`translate3d(${Math.round(f.x+16)}px, ${Math.round(f.y-12)}px, 0)`),Et||(Et=!0,(v=c.onReady)==null||v.call(c))}let mt=[];function vt(e,r,a,o){for(const i of mt)t.disableVertexAttribArray(i);mt=[],t.bindBuffer(t.ARRAY_BUFFER,r);for(const[i,s,f]of o){const v=t.getAttribLocation(e,i);v<0||(t.enableVertexAttribArray(v),t.vertexAttribPointer(v,s,t.FLOAT,!1,a,f),mt.push(v))}}function Dt(e){vt(e,yt,8,[["aPos",2,0]]),t.drawArrays(t.TRIANGLES,0,3)}function Pt(e){if(T=0,tt||!J)return;const r=Q?Math.min(.05,(e-Q)/1e3):1/60;Q=e,C&&ht(r),Vt(),ut-=r,ut<=0&&(ut=.1,q()),C&&(T=requestAnimationFrame(Pt))}function D(){!T&&J&&!tt&&(Q=0,T=requestAnimationFrame(Pt))}const O=c.pointerTarget,wt=e=>{const r=n.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}},Ut=e=>{if(e.pointerType!=="mouse")return;const{x:r,y:a}=wt(e);L.x=r,L.y=a,L.active=!0},Ct=()=>{L.active=!1},Lt=e=>{if(e.target.closest("a, button, input, .home-hero__panel"))return;const{x:r,y:a}=wt(e);Ht(r,a,48)&&(et=!0,k=12,D())};O.addEventListener("pointermove",Ut),O.addEventListener("pointerleave",Ct),O.addEventListener("pointerup",Lt);const Bt=new ResizeObserver(()=>{bt(),D()});Bt.observe(n);const It=e=>{e.preventDefault(),tt=!0,cancelAnimationFrame(T)};n.addEventListener("webglcontextlost",It),bt();for(let e=0;e<90;e++)ht(1/30);return N=0,Tt(),D(),{get playing(){return C},setPlaying(e){C=e,C&&D()},step(){C=!1,ht(1/15),D(),q()},act(e){const r=l[x];if(r){if(e==="move"){const a=S()*Math.PI*2;r.ix+=Math.cos(a)*220,r.iy+=Math.sin(a)*220}else e==="rotate"?r.rotVel+=Math.PI*2.4:(r.targetScale=2.2,r.scaleHold=1.4);if(k=Math.max(k,6),et=!0,!C)for(let a=0;a<20;a++)r.x+=r.ix/60,r.y+=r.iy/60,r.ix*=.93,r.iy*=.93,r.rot+=r.rotVel/60,r.rotVel*=.97,r.scale+=(r.targetScale-r.scale)*.15;q(),D()}},setPalette(e){g=e,D()},setVisible(e){J=e,J?D():(cancelAnimationFrame(T),T=0)},dispose(){var e;tt=!0,cancelAnimationFrame(T),Bt.disconnect(),O.removeEventListener("pointermove",Ut),O.removeEventListener("pointerleave",Ct),O.removeEventListener("pointerup",Lt),n.removeEventListener("webglcontextlost",It),(e=t.getExtension("WEBGL_lose_context"))==null||e.loseContext()}}}export{Qt as createWorld};
