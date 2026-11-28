export const koreanDay=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
export function createClearance(storage,key){
 let cleared=[];try{const data=JSON.parse(storage.getItem(key)||'[]');if(Array.isArray(data))cleared=data.filter(x=>x&&typeof x.map==='string'&&typeof x.day==='string');}catch{}
 const signature=rows=>rows.join('\n');
 return {has(rows){try{const data=JSON.parse(storage.getItem(key)||'[]');if(Array.isArray(data))cleared=data;}catch{}return cleared.some(x=>x&&x.map===signature(rows)&&x.day===koreanDay());},mark(rows){const value={map:signature(rows),day:koreanDay()};cleared=[value,...cleared.filter(x=>x.map!==value.map)].slice(0,200);try{storage.setItem(key,JSON.stringify(cleared));}catch{}}};
}
// Generate the whole map, never a sprite collage. Text is fixed; row characters are not inserted as markup.
export function mapThumbnail(rows){
 if(!Array.isArray(rows)||rows.length!==15)return '';
 let art='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600"><rect width="960" height="600" fill="#b7eafb"/>';
 const colors={'#':'#987451',B:'#ffd342',C:'#e29a60',F:'#62cbbf',M:'#8068d7',V:'#8068d7',I:'#b6ccda',L:'#b56fce',E:'#73ceef',A:'#e7af49'};
 rows.forEach((row,y)=>Array.from(row).forEach((t,x)=>{const px=x*40,py=y*40;
  if(colors[t])art+=`<rect x="${px+1}" y="${py+1}" width="38" height="38" rx="5" fill="${colors[t]}" stroke="#35506d"${t==='I'?' opacity=".45"':''}/>`;
  if('BMVLCFEA'.includes(t))art+=`<text x="${px+20}" y="${py+27}" text-anchor="middle" font-size="24" fill="#163354">${({B:'↑',M:'↔',V:'↕',L:'½',C:'⌛',F:'↟',E:'❄',A:'»'})[t]}</text>`;
  if(t==='^')art+=`<path d="M${px},${py+38}l10,-32 10,32 10,-32 10,32Z" fill="#e45268"/>`;
  if(t==='S')art+=`<circle cx="${px+20}" cy="${py+20}" r="14" fill="#2285ec" stroke="white" stroke-width="3"/>`;
  if(t==='G')art+=`<path d="M${px+12},${py+38}V${py+3}l25,9 -25,10" fill="#2aaf7e" stroke="#135c52" stroke-width="3"/>`;
  if(t==='*')art+=`<text x="${px+20}" y="${py+33}" text-anchor="middle" font-size="40" fill="#e8ad00">★</text>`;
  if(t==='X'||t==='Y')art+=`<circle cx="${px+20}" cy="${py+20}" r="17" fill="#e45268"/><text x="${px+20}" y="${py+27}" text-anchor="middle" font-size="23" fill="white">${t==='X'?'↔':'↕'}</text>`;
 }));return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(art+'</svg>');
}
