import assert from 'node:assert/strict';
import {unrar, cleanup} from '../vendor/unrarit.module.js';

function u16(value){ return [value & 0xff, (value >>> 8) & 0xff]; }
function u32(value){ return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]; }
function bytes(...parts){ return Uint8Array.from(parts.flat()); }

function rar4Stored(entries){
  const signature=[0x52,0x61,0x72,0x21,0x1a,0x07,0x00];
  // MAIN_HEAD: CRC(2), type 0x73, flags 0, headSize 13, reserved 6.
  const main=[0,0,0x73,0,0,...u16(13),0,0,0,0,0,0];
  const chunks=[signature,main];
  for(const {name,data} of entries){
    const nameBytes=[...new TextEncoder().encode(name)];
    const payload=[...data];
    const headSize=32+nameBytes.length;
    const header=[
      0,0,0x74,0,0,...u16(headSize),
      ...u32(payload.length), ...u32(payload.length),
      2, // host OS
      ...u32(0), // CRC (not validated by parser)
      ...u32(0), // DOS mtime
      20, // unpack version
      0x30, // stored
      ...u16(nameBytes.length),
      ...u32(0x20),
      ...nameBytes,
    ];
    chunks.push(header,payload);
  }
  chunks.push([0,0,0x7b,0,0,...u16(7)]);
  return bytes(...chunks);
}

const png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);
const xml=new TextEncoder().encode('<ComicInfo><Title>CBR QA</Title><Series>Reader QA</Series></ComicInfo>');
const archive=rar4Stored([
  {name:'ComicInfo.xml',data:xml},
  {name:'001.png',data:png},
]);

const {rar,entries}=await unrar(new Blob([archive],{type:'application/vnd.rar'}));
try{
  assert.deepEqual(Object.keys(entries),['ComicInfo.xml','001.png']);
  assert.equal(await entries['ComicInfo.xml'].text(),new TextDecoder().decode(xml));
  const extracted=new Uint8Array(await entries['001.png'].arrayBuffer());
  assert.deepEqual([...extracted],[...png]);
  assert.equal(entries['001.png'].compressedSize,png.length);
  console.log('cbr-smoke.mjs: PASS · RAR4 almacenado → indexación + XML + página');
} finally {
  rar.dispose();
  cleanup();
}
