const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./locate-playing-track.js');

test('normalizes exact Spotify URIs and URL paths, without substring or title matching', () => {
  assert.equal(core.canonicalUri('https://open.spotify.com/track/abc?si=test'), 'spotify:track:abc');
  assert.equal(core.canonicalUri('/track/abc-long'), 'spotify:track:abc-long');
  assert.equal(core.canonicalUri('spotify%3Aepisode%3Aepisode1'), 'spotify:episode:episode1');
  assert.equal(core.canonicalUri('spotify:album:abc'), null);
  assert.equal(core.findTrackIndex([{uri:'spotify:track:abc-long', name:'Same title'}], core.identity('spotify:track:abc')), -1);
});

test('uses relinked track identity and chooses the correct duplicate occurrence by UID', () => {
  const items = [{uri:'spotify:track:playable',uid:'first',linked_from:{uri:'spotify:track:original'}}, {uri:'spotify:track:playable',uid:'second'}];
  assert.equal(core.findTrackIndex(items, core.identity('spotify:track:original')),0);
  assert.equal(core.findTrackIndex(items, core.identity({uri:'spotify:track:playable',uid:'second'})),1);
});

test('resolves the current view model rather than an unsorted playlist index', () => {
  const sortedView = [{data:{uri:'spotify:track:z'}},{data:{uri:'spotify:track:a'}},{data:{uri:'spotify:track:c'}}];
  assert.equal(core.findTrackIndex(sortedView, core.identity('spotify:track:a'), (item,index)=>({uri:item.data.uri,uid:String(index)})),1);
  assert.equal(core.findTrackIndex(sortedView, core.identity('spotify:track:filtered-out')),-1);
});

test('uses measured row pitch, header geometry and viewport center for compact and standard rows', () => {
  const viewport = {scrollTop:500,top:100,height:600,maxScroll:20000};
  assert.equal(core.estimateScroll({index:10,top:200,height:32,pitch:32},100,viewport),3196);
  assert.equal(core.estimateScroll({index:10,top:200,height:64,pitch:64},100,viewport),6092);
  assert.equal(core.estimateScroll({index:10,top:200,height:32,pitch:32},0,viewport),0);
});

test('loads virtualized offscreen tracks from Spotify current-view cache', async () => {
  const items = Array.from({length:1500},(_,index)=>({uri:'spotify:track:'+index}));
  const loaded = await core.readItems({cache:{cacheAll:async()=>({items})}});
  assert.equal(core.findTrackIndex(loaded,core.identity('spotify:track:1299')),1299);
});

test('paginates view-provided fetch callback, preserving its sort/filter and null slots', async () => {
  const items = Array.from({length:450},(_,index)=>index===18?null:{uri:'spotify:track:'+index});
  const offsets=[];
  const loaded = await core.readItems({count:450,fetchTracks:async(offset,limit)=>{offsets.push(offset);return{items:items.slice(offset,offset+limit),totalLength:450};}});
  assert.deepEqual(offsets,[0,200,400]);
  assert.equal(core.findTrackIndex(loaded,core.identity('spotify:track:400')),400);
});

test('does not report a track absent when view loading fails or cache is incomplete', async () => {
  await assert.rejects(core.readItems({cache:{cacheAll:async()=>{throw new Error('offline');}}}),/offline/);
  await assert.rejects(core.readItems({count:3,handle:{getRows:()=>[{uri:'spotify:track:1'},undefined,undefined]}}),/list-unavailable/);
  await assert.rejects(core.readItems({count:10,fetchTracks:async()=>({items:[],totalLength:10})}),/incomplete-list/);
});

test('discovers a deeply nested Spotify Context cache rather than requiring itemsCache props', async () => {
  const items = [{uri:'spotify:track:context-track'}];
  const cache = {nrValidItems:1,getItems:()=>items,cacheAll:async()=>({items})};
  const provider = {memoizedProps:{value:cache},return:null};
  let fiber=provider;
  for(let index=0;index<70;index++) fiber={memoizedProps:{},return:fiber};
  const model=core.discoverListModel(fiber);
  assert.equal(model.cache,cache);
  assert.equal(core.findTrackIndex(await core.readItems(model),core.identity('spotify:track:context-track')),0);
});

test('reads a cache from a React context dependency and rejects a discarded cache response', async () => {
  const items=[{uri:'spotify:track:fresh'}];
  const cache={nrValidItems:1,getItems:()=>items,cacheAll:async()=>({items:[],cacheStatus:'discarded'})};
  const model=core.discoverListModel({dependencies:{firstContext:{memoizedValue:cache}},return:null});
  assert.deepEqual(await core.readItems(model),items);
});

test('uses the currently committed React tree, not stale DOM fiber properties', () => {
  const root={}, alternateRoot={};
  root.alternate=alternateRoot; alternateRoot.alternate=root;
  root.stateNode=alternateRoot.stateNode={current:alternateRoot};
  const stale={return:root}, current={return:alternateRoot};
  stale.alternate=current; current.alternate=stale;
  assert.equal(core.currentFiber(stale),current);
  assert.equal(core.currentFiber(current),current);
  const detached={alternate:{}};
  assert.equal(core.currentFiber(detached),detached);
});

test('an in-progress cacheAll can fall back to the current view paginated callback', async () => {
  const items=[{uri:'spotify:track:page'}];
  assert.deepEqual(await core.readItems({cache:{cacheAll:async()=>undefined},count:1,
    fetchTracks:async()=>({items,totalLength:1})}),items);
});
