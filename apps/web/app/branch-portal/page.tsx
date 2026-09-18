'use client';
import {useEffect} from 'react';
export default function LegacyPortalRedirect(){
  useEffect(()=>{location.replace('/nvocc-portal');},[]);
  return <main style={{padding:24}}>Opening ANCLINE NVOCC Portal…</main>;
}
