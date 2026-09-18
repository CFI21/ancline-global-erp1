'use client';
import {useParams} from 'next/navigation';
import SalesLeadWorkspace from '../../../../components/SalesLeadWorkspace';
export default function SalesLeadDetailPage(){const params=useParams<{id:string}>();return <SalesLeadWorkspace leadId={String(params?.id||'')}/>;}
