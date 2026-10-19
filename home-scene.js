import * as THREE from './vendor/three/three.module.min.js';

const host = document.getElementById('heroScene');
const canvas = document.getElementById('heroCanvas');
const motionButton = document.querySelector('.scene-motion');

function startScene() {
  // A decorative enhancement: forms and public copy work without WebGL.
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' });
  if (!context) { host.dataset.scene = 'fallback'; return; }
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
  renderer.setClearColor(0x15102c, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 60);
  camera.position.set(0, .15, 9.3);
  camera.lookAt(0, 0, 0);
  const world = new THREE.Group();
  world.position.set(.15, .08, 0);
  scene.add(world);

  scene.add(new THREE.HemisphereLight(0xe6d4ff, 0x221343, 1.5));
  const key = new THREE.DirectionalLight(0xf0e6ff, 2.2);
  key.position.set(-3, 5, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xad85ff, 3);
  rim.position.set(4, 1, -2); scene.add(rim);
  const mintLight = new THREE.PointLight(0xd6ff83, 8, 12, 2);
  mintLight.position.set(-2, -1, 3); scene.add(mintLight);

  // Procedural studio reflections, with no remote textures or image assets.
  const studio = document.createElement('canvas'); studio.width=512; studio.height=256;
  const paint = studio.getContext('2d');
  paint.fillStyle='#5a4676'; paint.fillRect(0,0,512,256);
  const glow=paint.createLinearGradient(0,0,0,256);
  glow.addColorStop(0,'#f5efff');glow.addColorStop(.4,'#9f88be');glow.addColorStop(1,'#241237');
  paint.fillStyle=glow;paint.fillRect(0,0,512,256);
  paint.fillStyle='#fff7ff';paint.fillRect(60,30,100,90);
  paint.fillStyle='#d6ffb0';paint.fillRect(340,50,35,100);
  const studioTexture=new THREE.CanvasTexture(studio);
  studioTexture.mapping=THREE.EquirectangularReflectionMapping;
  const pmrem=new THREE.PMREMGenerator(renderer);
  const env=pmrem.fromEquirectangular(studioTexture);
  scene.environment=env.texture;
  studioTexture.dispose();pmrem.dispose();

  function roundedCube(size, radius=.17) {
    const half=size/2, r=radius, shape=new THREE.Shape();
    shape.moveTo(-half+r,-half);shape.lineTo(half-r,-half);
    shape.quadraticCurveTo(half,-half,half,-half+r);shape.lineTo(half,half-r);
    shape.quadraticCurveTo(half,half,half-r,half);shape.lineTo(-half+r,half);
    shape.quadraticCurveTo(-half,half,-half,half-r);shape.lineTo(-half,-half+r);
    shape.quadraticCurveTo(-half,-half,-half+r,-half);
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:size*.8,steps:1,bevelEnabled:true,bevelSegments:4,bevelSize:size*.065,bevelThickness:size*.065,curveSegments:10});
    geometry.center();return geometry;
  }
  function material(color, roughness=.21) {
    return new THREE.MeshPhysicalMaterial({color,metalness:.2,roughness,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:.8});
  }
  const cubeRig=new THREE.Group();world.add(cubeRig);
  const cube=new THREE.Mesh(roundedCube(1.7,.22),material(0x793ee4));
  cubeRig.add(cube);
  cubeRig.rotation.set(.32,-.47,-.14);

  const label=document.createElement('canvas');label.width=512;label.height=512;
  const ctx=label.getContext('2d');
  ctx.clearRect(0,0,512,512);ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold 172px Consolas, monospace';ctx.shadowColor='#d6ff83';ctx.shadowBlur=24;ctx.fillStyle='#e4ffb6';ctx.fillText('</>',256,255);
  const labelTexture=new THREE.CanvasTexture(label);labelTexture.colorSpace=THREE.SRGBColorSpace;
  const face=new THREE.Mesh(new THREE.PlaneGeometry(1.35,1.35),new THREE.MeshBasicMaterial({map:labelTexture,transparent:true,depthWrite:false,side:THREE.FrontSide,toneMapped:false}));
  face.position.z=.8;cubeRig.add(face);

  function ring(radius,color,rx,ry,rz,width=.012) {
    const mesh=new THREE.Mesh(new THREE.TorusGeometry(radius,width,8,180),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8}));
    mesh.rotation.set(rx,ry,rz);world.add(mesh);
    const halo=new THREE.Mesh(new THREE.TorusGeometry(radius,width*3.8,8,180),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.055,blending:THREE.AdditiveBlending,depthWrite:false}));
    halo.rotation.copy(mesh.rotation);world.add(halo);
    return mesh;
  }
  ring(2.19,0xc6ff8f,1.02,.3,-.48,.014);
  ring(2.55,0x8e6cdd,.45,.95,.68,.009);
  ring(2.05,0xe3b8ff,-.55,.77,.18,.008);

  const ball=new THREE.Mesh(new THREE.SphereGeometry(.32,32,20),material(0xb4ed50,.16));world.add(ball);
  const peach=new THREE.Mesh(roundedCube(.54,.07),material(0xffa27d));world.add(peach);
  peach.rotation.set(.5,.5,.25);
  const tinyCube=new THREE.Mesh(roundedCube(.3,.035),material(0xb9d9ff));world.add(tinyCube);
  const moon=new THREE.Mesh(new THREE.SphereGeometry(.16,20,12),material(0x9980cf));world.add(moon);
  const knot=new THREE.Mesh(new THREE.TorusKnotGeometry(.35,.095,64,10),material(0xceb2ff));world.add(knot);

  function sparkleShape() {
    const shape=new THREE.Shape();
    for(let i=0;i<8;i++){
      const angle=i*Math.PI/4, r=i%2===0?.5:.14;
      const x=Math.cos(angle)*r,y=Math.sin(angle)*r;
      if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);
    }
    shape.closePath();return new THREE.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:true,bevelThickness:.045,bevelSize:.025,bevelSegments:3,steps:1});
  }
  const star=new THREE.Mesh(sparkleShape(),material(0xd0b1ff));
  star.position.set(-1.85,-1.5,.65);star.rotation.set(.2,-.1,.1);world.add(star);

  // Deterministic stars keep screenshot comparisons and first paint consistent.
  let seed=413;const random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  const starPositions=new Float32Array(210*3);
  for(let i=0;i<210;i++){
    starPositions[i*3]=(random()-.5)*9;
    starPositions[i*3+1]=(random()-.5)*7;
    starPositions[i*3+2]=-2-random()*3;
  }
  const pointsGeometry=new THREE.BufferGeometry();pointsGeometry.setAttribute('position',new THREE.BufferAttribute(starPositions,3));
  const dust=new THREE.Points(pointsGeometry,new THREE.PointsMaterial({color:0xc6abea,size:.019,sizeAttenuation:true,transparent:true,opacity:.65,depthWrite:false}));
  scene.add(dust);

  const motionPref=matchMedia('(prefers-reduced-motion: reduce)');
  let allowed=!motionPref.matches, visible=true, overlay=!!document.querySelector('#authDialog[open]'), raf=0, elapsed=0, last=0, lastPaint=0, frames=0;
  let mobile=host.clientWidth<550;
  let pointerX=0,pointerY=0;
  function resize() {
    const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
    mobile=w<550;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1.3:1.7));
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=mobile?42:39;camera.updateProjectionMatrix();
    render();
  }
  function render() {
    cubeRig.position.y=Math.sin(elapsed*.65)*.12;
    cubeRig.rotation.y=-.47+Math.sin(elapsed*.18)*.2;
    cubeRig.rotation.z=-.14+Math.sin(elapsed*.3)*.035;
    const a=elapsed*.23+.55;
    ball.position.set(Math.cos(a)*2.23,Math.sin(a)*1.8,.8-Math.sin(a)*.2);
    peach.position.set(1.75+Math.sin(elapsed*.45)*.09,1.5+Math.sin(elapsed*.6)*.13,-.45);
    peach.rotation.y=.5+elapsed*.13;
    tinyCube.position.set(-2.45,1.15+Math.sin(elapsed*.55)*.12,-.6);
    tinyCube.rotation.set(elapsed*.17,.5+elapsed*.12,.45);
    moon.position.set(2.5,-.75+Math.sin(elapsed*.6)*.08,-.35);
    knot.position.set(1.6,-1.83+Math.sin(elapsed*.4)*.1,-.5);
    knot.rotation.set(.25+elapsed*.12,.3+elapsed*.1,-.3);
    star.position.y=-1.5+Math.sin(elapsed*.6)*.14;
    star.rotation.z=.15+Math.sin(elapsed*.25)*.1;
    world.rotation.y+=(pointerX*.09-world.rotation.y)*.035;
    world.rotation.x+=(pointerY*.04-world.rotation.x)*.035;
    dust.rotation.z=elapsed*.008;
    renderer.render(scene,camera);
    if(++frames===1||frames%30===0)canvas.dataset.frames=String(frames);
  }
  const running=()=>allowed&&visible&&!overlay&&!document.hidden;
  function tick(now) {
    raf=0;if(!running())return;
    elapsed+=Math.min((now-last)/1000,.05);last=now;
    if(!mobile||now-lastPaint>=32){render();lastPaint=now;}
    raf=requestAnimationFrame(tick);
  }
  function schedule() {
    if(running()&&!raf){last=performance.now();raf=requestAnimationFrame(tick);}
    else if(!running()&&raf){cancelAnimationFrame(raf);raf=0;}
  }
  function updateMotion() {
    motionButton.setAttribute('aria-pressed',String(!allowed));
    motionButton.setAttribute('aria-label',allowed?'3D 움직임 멈추기':'3D 움직임 켜기');
    motionButton.querySelector('[data-motion-label]').textContent=allowed?'움직임 멈추기':'움직임 켜기';
    motionButton.firstElementChild.textContent=allowed?'Ⅱ':'▷';schedule();
  }
  motionButton.addEventListener('click',()=>{allowed=!allowed;updateMotion();});
  motionPref.addEventListener('change',event=>{allowed=!event.matches;updateMotion();});
  document.addEventListener('visibilitychange',schedule);
  document.addEventListener('home:overlay',event=>{overlay=event.detail.open;schedule();});
  document.querySelector('.home-hero').addEventListener('pointermove',event=>{
    if(event.pointerType==='touch'||!allowed)return;
    const r=host.getBoundingClientRect();pointerX=Math.max(-1,Math.min(1,((event.clientX-r.left)/r.width-.5)*2));
    pointerY=Math.max(-1,Math.min(1,((event.clientY-r.top)/r.height-.5)*2));
  },{passive:true});
  document.querySelector('.home-hero').addEventListener('pointerleave',()=>{pointerX=0;pointerY=0;});
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();},{threshold:0});observer.observe(host);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();visible=false;schedule();host.classList.remove('scene-ready');motionButton.hidden=true;host.dataset.scene='fallback';});
  canvas.addEventListener('webglcontextrestored',()=>{visible=true;resize();host.classList.add('scene-ready');motionButton.hidden=false;host.dataset.scene='webgl';schedule();});
  addEventListener('pagehide',()=>{if(raf)cancelAnimationFrame(raf);raf=0;});
  addEventListener('pageshow',schedule);
  resize();host.classList.add('scene-ready');host.dataset.scene='webgl';motionButton.hidden=false;updateMotion();
}

try { startScene(); } catch (error) {
  host.classList.remove('scene-ready');host.dataset.scene='fallback';motionButton.hidden=true;
  // The CSS illustration and authentication remain usable on limited GPUs.
  console.warn('Decorative 3D unavailable; showing the static illustration.');
}
