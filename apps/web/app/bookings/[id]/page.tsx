import {redirect} from 'next/navigation';

export default async function BookingDetailRedirect({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  redirect(`/bookings?booking=${encodeURIComponent(id)}`);
}
