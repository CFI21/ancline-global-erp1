import {redirect} from 'next/navigation';
export default async function SalesLeadDetailPage({params}:{params:Promise<{id:string}>}){const {id}=await params;redirect(`/sales-crm?lead=${encodeURIComponent(id)}#inquiries`);}
