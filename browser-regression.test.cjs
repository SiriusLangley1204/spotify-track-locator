const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./locate-playing-track.js'),'utf8');

// Small browser fixture models Spotify's virtual rows, React Context and hidden-overflow viewport.
// It exercises the installed browser entry point, including discovery and actual scroll calls.
function browserFixture({count=350,targetIndex=220,cache=true,blockedScroll=false,playback='api'}={}) {
  const notifications=[], elements=[], timers=new Set();
  let mutationCallback=()=>{};
  const items=Array.from({length:count},(_,index)=>({uri:'spotify:track:'+index,uid:'uid'+index}));
  class Element {
    constructor(tag='div') {
      this.tagName=tag;this.attrs={};this.children=[];this.style={};this.isConnected=true;this.events={};
      this.clientTop=0;this.clientHeight=600;this.scrollHeight=600;this.scrollTop=0;
      const classes=new Set();
      this.classList={add:(name)=>classes.add(name),remove:(name)=>classes.delete(name),contains:(name)=>classes.has(name)};
      elements.push(this);
    }
    setAttribute(key,value){this.attrs[key]=value;}
    getAttribute(key){return this.attrs[key]??null;}
    removeAttribute(key){delete this.attrs[key];}
    appendChild(node){if(node.parentElement)node.remove();this.children.push(node);node.parentElement=this;node.isConnected=true;return node;}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;this.isConnected=false;}
    addEventListener(type,callback){this.events[type]=callback;}
    getBoundingClientRect(){return{top:60,bottom:860,left:300,right:1400,width:1100,height:800};}
    querySelectorAll(){return [];}
    querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
    closest(){return null;}
    scrollTo({top}){if(!blockedScroll)this.scrollTop=Math.max(0,Math.min(this.scrollHeight-this.clientHeight,top));}
  }
  const body=new Element('body'),head=new Element('head'),pane=new Element(),main=new Element('main'),scroll=new Element(),grid=new Element();
  body.appendChild(pane);pane.appendChild(main);main.appendChild(scroll);scroll.appendChild(grid);
  main.getBoundingClientRect=()=>({top:60-scroll.scrollTop,bottom:860-scroll.scrollTop,left:300,right:1400,width:1100,height:800});
  scroll.scrollHeight=100+count*56;
  scroll.getBoundingClientRect=()=>({top:100,bottom:700,height:600,left:300,right:1400,width:1100});
  grid.getBoundingClientRect=()=>({top:200-scroll.scrollTop,bottom:200+count*56-scroll.scrollTop,height:count*56,left:300,right:1400,width:1100});
  grid.closest=(selector)=>selector.includes('main')?main:null;
  const header=new Element();
  function renderedRows(){
    const first=Math.max(0,Math.floor((scroll.scrollTop-100)/56));
    return items.slice(first,first+14).map((item,offset)=>{
      const index=first+offset,row=new Element();row.parentElement=grid;
      row.attrs['aria-rowindex']=String(index+2);
      row.getBoundingClientRect=()=>({top:200+index*56-scroll.scrollTop,bottom:256+index*56-scroll.scrollTop,height:56,left:300,right:1400,width:1100});
      // Current Spotify can keep item identity only in a Context dependency; no /track link in DOM.
      row.__reactFiber$test={memoizedProps:{},dependencies:{firstContext:{memoizedValue:{item,index}}},return:{stateNode:grid}};
      row.scrollIntoView=()=>scroll.scrollTo({top:100+index*56-272});
      return row;
    });
  }
  grid.querySelectorAll=(selector)=>selector.includes('role="row"')?renderedRows():[];
  grid.querySelector=(selector)=>selector.includes('columnheader')?header:renderedRows()[0];
  main.querySelectorAll=(selector)=>selector.includes('role="grid"')?[grid]:[];
  const dataCache={nrValidItems:count,getItems:(start,end)=>items.slice(start,end+1),cacheAll:async()=>({items})};
  let fiber={memoizedProps:cache?{value:dataCache}:{},stateNode:main,return:null};
  for(let index=0;index<60;index++) fiber={memoizedProps:{},return:fiber};
  grid.__reactFiber$test=fiber;
  const playingTitle=new Element('a');
  playingTitle.attrs.href='/track/'+targetIndex;
  const playingWidget=new Element();
  playingWidget.__reactProps$test={children:{props:{children:{props:{uri:'spotify:track:'+targetIndex}}}}};
  playingWidget.querySelectorAll=selector=>selector==='*'?[]:[playingTitle];
  function queryAll(selector){
    if(selector.includes('context-item-info-title'))return playback==='link'||(playback==='v2-link'&&selector.includes('[data-testid="now-playing-widget-v2"] a'))?[playingTitle]:[];
    if(selector.includes('now-playing-widget-v2'))return playback==='v2-props'?[playingWidget]:[];
    return selector.includes('main')?[main]:[];
  }
  const document={body,head,querySelectorAll:queryAll,querySelector:selector=>queryAll(selector)[0]??null,
    createElement:tag=>new Element(tag),getElementById:id=>elements.find(e=>e.id===id&&e.isConnected)??null,
    addEventListener(){},removeEventListener(){}};
  const window={innerHeight:1000,matchMedia:()=>({matches:true}),Spicetify:{Player:{data:{item:{uri:'spotify:track:'+targetIndex}}},
    Platform:{History:{location:{pathname:'/playlist/test'}}},showNotification:text=>notifications.push(text)}};
  if(['link','v2-link','v2-props','none'].includes(playback))window.Spicetify.Player.data={item:{}};
  if(playback==='platform'){
    window.Spicetify.Player.data={item:{}};
    window.Spicetify.Platform.PlayerAPI={_state:{item:{uri:'spotify:track:'+targetIndex}}};
  }
  main.closest=selector=>selector.includes('.main-view-container')?pane:null;
  const clock=(callback,delay=0)=>{const timer=setTimeout(()=>{timers.delete(timer);callback();},Math.min(delay/100,20));timers.add(timer);return timer;};
  const context={window,document,location:{pathname:'/playlist/test'},navigator:{clipboard:{writeText:async()=>{}}},
    setTimeout:clock,clearTimeout:timer=>{timers.delete(timer);clearTimeout(timer);},requestAnimationFrame:callback=>clock(callback),
    MutationObserver:class{constructor(callback){mutationCallback=callback;}observe(){}disconnect(){}},getComputedStyle:element=>({gridArea:element===pane?'main-view / main-view / main-view / main-view':'auto',overflowY:element===scroll?'hidden':'visible',getPropertyValue:()=> '56px'}),console};
  vm.runInNewContext(source,context);
  return{api:window.__locatePlayingTrack,scroll,document,notifications,elements,remount:()=>mutationCallback(),
    clean(){window.__locatePlayingTrack.dispose();for(const timer of timers)clearTimeout(timer);}};
}

test('fixed button stays at pane right and viewport bottom after scrolling moves main content bounds',async()=>{
  const f=browserFixture();
  try{
    const buttons=f.elements.filter(e=>e.tagName==='button'&&e.isConnected);
    assert.equal(buttons.length,1);
    assert.equal(buttons[0].id,'locate-playing-track-floating');
    assert.equal(f.document.getElementById('locate-playing-track-action'),null);
    assert.match(f.document.getElementById('locate-playing-track-style').textContent,/position:fixed;right:auto;bottom:auto/);
    assert.equal(buttons[0].style.top,'860px');
    assert.equal(buttons[0].style.left,'1347px');
    f.scroll.scrollTop=12000;
    f.remount();
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(buttons[0].style.top,'860px');
    assert.equal(buttons[0].style.left,'1347px');
  }finally{f.clean();}
});

for(const playback of ['link','platform','v2-link','v2-props'])test(`empty legacy player state falls back to ${playback} and locates the actual row`,async()=>{
  const f=browserFixture({playback});
  try{
    await f.api.locate();
    assert.equal(f.api.getLastResult()?.status,'located');
    assert.equal(f.api.getDiagnostics().playbackSource,playback==='v2-props'?'now-playing-widget-props':playback==='platform'?'platform-state':'now-playing-link');
    assert.ok(f.scroll.scrollTop>10000);
  }finally{f.clean();}
});

test('unavailable playback records a read failure instead of claiming playback is stopped',async()=>{
  const f=browserFixture({playback:'none'});
  try{
    await f.api.locate();
    assert.equal(f.api.getDiagnostics().stage,'no-track');
    assert.equal(f.api.getDiagnostics().playbackWidgets,0);
    assert.equal(f.api.getLastResult()?.reason,'playback-unavailable');
    assert.equal(f.scroll.scrollTop,0);
  }finally{f.clean();}
});

test('click path locates an unrendered Context-backed row and scrolls the real hidden-overflow viewport',async()=>{
  const f=browserFixture();
  try{
    await f.api.locate();
    assert.equal(f.api.getLastResult()?.status,'located');
    assert.ok(f.scroll.scrollTop>10000);
    assert.equal(f.notifications.at(-1),'已定位到当前播放歌曲');
    assert.equal(f.api.getDiagnostics().stage,'located');
  }finally{f.clean();}
});

test('a complete view without the playing track does not scroll or falsely highlight a selected row',async()=>{
  const f=browserFixture({targetIndex:9999});
  try{
    await f.api.locate();
    assert.equal(f.api.getLastResult()?.status,'not-in-list');
    assert.equal(f.scroll.scrollTop,0);
  }finally{f.clean();}
});

test('fallback scans virtual rows when private cache is unavailable',async()=>{
  const f=browserFixture({count:100,targetIndex:70,cache:false});
  try{
    await f.api.locate();
    assert.equal(f.api.getLastResult()?.status,'located');
    assert.ok(f.scroll.scrollTop>2500);
  }finally{f.clean();}
});

test('a viewport that never moves cannot produce a false located success',async()=>{
  const f=browserFixture({count:100,targetIndex:70,blockedScroll:true});
  try{
    await f.api.locate();
    assert.notEqual(f.api.getLastResult()?.status,'located');
    assert.equal(f.notifications.includes('已定位到当前播放歌曲'),false);
  }finally{f.clean();}
});
