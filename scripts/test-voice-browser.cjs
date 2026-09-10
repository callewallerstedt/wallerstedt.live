const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const fs = require('node:fs');

(async () => {
  const bundle = await build({
    stdin: { contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import VoiceSheet from './components/os/voice-sheet';
      const ctx = new AudioContext();
      const stream = ctx.createMediaStreamDestination().stream;
      window.micTrack = stream.getAudioTracks()[0];
      window.sent = [];
      window.inbox = [];
      window.fetch = async (url) => {
        if (url.includes('/session')) return Response.json({value:'test'});
        if (url.includes('/inbox')) return Response.json({items:window.inbox});
        if (url.includes('/agent')) return Response.json({ok:true,agent:'elon'});
        return new Response('sdp');
      };
      window.RTCPeerConnection = class {
        connectionState = 'new';
        addTrack() {}
        createDataChannel() {
          const channel = {readyState:'open',send:raw=>window.sent.push(JSON.parse(raw)),close(){}};
          window.channel = channel;
          return channel;
        }
        async createOffer() { return {type:'offer',sdp:'test'}; }
        async setLocalDescription() {}
        async setRemoteDescription() { window.channel.onopen(); }
        close() {}
      };
      window.emit = data => window.channel.onmessage({data:JSON.stringify(data)});
      createRoot(document.getElementById('root')).render(<VoiceSheet accessKey="test" microphone={Promise.resolve(stream)} onClose={()=>{}}/>);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle:true, write:false, platform:'browser', define:{'process.env.NODE_ENV':'"production"'},
  });
  const browser = await chromium.launch({channel:process.env.VOICE_TEST_BROWSER || 'msedge',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:430,height:850}});
    const errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    await page.addStyleTag({content:':root{--card:#202125;--background:#16171a;--foreground:white;--brand-soft:#292a35;--brand:#c49cff}body{background:#16171a;color:white}dialog{background:#16171a;color:white}'+fs.readFileSync('app/bolag/os.css','utf8')});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByRole('button',{name:'Mute microphone',exact:true}).waitFor();
    await page.waitForFunction(()=>window.channel?.onmessage && !document.querySelector('button[aria-label="Mute microphone"]').disabled);
    const emit = async (...events) => {
      await page.evaluate(events=>events.forEach(window.emit),events);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    };
    await emit(
      {type:'input_audio_buffer.speech_started',item_id:'u1'},
      {type:'conversation.item.added',item:{id:'u1',role:'user'}},
      {type:'response.created',response:{id:'r1'}},
      {type:'response.output_item.added',item:{id:'a1',role:'assistant'}},
      {type:'response.output_audio_transcript.delta',item_id:'a1',delta:'Hej!'},
      {type:'output_audio_buffer.started',response_id:'r1'},
    );
    assert.equal(await page.evaluate(()=>window.micTrack.enabled),true,'playback must retain microphone input');
    await emit({type:'conversation.item.input_audio_transcription.completed',item_id:'u1',transcript:'Hej där'});
    assert.deepEqual(await page.locator('article > p:last-child').allTextContents(),['Hej där','Hej!'],'late transcription belongs before its response');
    await emit({type:'input_audio_buffer.speech_started',item_id:'u2'},
      {type:'output_audio_buffer.cleared',response_id:'r1'},
      {type:'response.done',response:{id:'r1',status:'cancelled'}},
      {type:'response.created',response:{id:'r2'}},
      {type:'response.output_audio_transcript.delta',item_id:'a2',delta:'你好！'},
      {type:'output_audio_buffer.started',response_id:'r2'},
      {type:'conversation.item.input_audio_transcription.completed',item_id:'u2',transcript:'你好'});
    assert.deepEqual(await page.locator('article > p:last-child').allTextContents(),['Hej där','Hej!','你好','你好！'],'barge-in speech survives playback and non-Latin filtering');
    await page.getByRole('button',{name:'Mute microphone',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.micTrack.enabled),false);
    await page.getByRole('button',{name:'Unmute microphone',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.micTrack.enabled),true,'unmuting during playback must work');
    await page.evaluate(()=>window.inbox=[{id:'reply',timestamp:Date.now(),message:'Task complete',agent:'elon',images:[]}]);
    await page.getByText('Task complete',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.sent.filter(e=>e.type==='response.create').length),0,'readout must wait while assistant plays');
    await emit({type:'response.done',response:{id:'r2',status:'completed'}},
      {type:'output_audio_buffer.stopped',response_id:'r1'});
    assert.equal(await page.evaluate(()=>window.sent.filter(e=>e.type==='response.create').length),0,'old playback event must not release current readout');
    await emit({type:'output_audio_buffer.stopped',response_id:'r2'});
    assert.equal(await page.evaluate(()=>window.sent.filter(e=>e.type==='response.create').length),1,'queued reply resumes after current playback');
    assert.equal(await page.evaluate(()=>window.micTrack.enabled),true);
    await page.evaluate(()=>window.micTrack.dispatchEvent(new Event('ended')));
    await page.getByRole('alert').filter({hasText:'Microphone disconnected'}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS: transcript event ordering, duplex input, interruptions, multilingual text, manual mute, readout scheduling, stale playback events, microphone loss; no browser errors.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
