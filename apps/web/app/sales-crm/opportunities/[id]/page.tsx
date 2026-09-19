import SalesOpportunityWorkspace from '../../../../components/SalesOpportunityWorkspace';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <SalesOpportunityWorkspace opportunityId={id}/>;}
