import SalesQuoteWorkspace from '../../../components/SalesQuoteWorkspace';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <SalesQuoteWorkspace quoteId={id}/>;}
