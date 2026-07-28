"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, ArrowRight, Bell, Bike, Check, ChevronRight, CircleUserRound,
  ClipboardList, Clock3, Home, MapPin, Menu, MessageCircle, Minus, Navigation,
  Package, Plus, Search, ShoppingBag, Store, Truck, WalletCards, X
} from "lucide-react";

type Role = "customer" | "vendor" | "rider";
type Product = { id:string;name:string;vendor:string;price:number;stock:number;category:string;image:string };
type Order = { id:string;status:string;total:number;payment_status:string;delivery_address:string };
type Delivery = { id:string;order_id:string;status:string;courier_id?:string;courier_fee:number;distance_km:number;dropoff_address:string;tracking_token?:string };
type Message = { orderId:string;who:string;text:string;time:string;kind:string };
type Address = { id:string;address:string;city:string;instructions:string };
type Workspace = { products:Product[];orders:Order[];deliveries:Delivery[];messages:Message[];addresses:Address[];actor?:{id:string;displayName:string;activeRole:Role;city?:string} };
type Tab = "Home"|"Orders"|"Messages"|"Payments"|"Account";

const productImages = [
  "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=82",
];

async function api(action:string,payload:Record<string,unknown>={}) {
  const response=await fetch("/api/workspace",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,...payload})});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error||"Action failed");
  return result;
}

export default function DashboardClient(){
  const [data,setData]=useState<Workspace>({products:[],orders:[],deliveries:[],messages:[],addresses:[]});
  const [tab,setTab]=useState<Tab>("Home");
  const [cart,setCart]=useState<Map<string,number>>(new Map());
  const [panel,setPanel]=useState<"cart"|"chat"|"product"|null>(null);
  const [selectedOrder,setSelectedOrder]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const showNotice=useCallback((text:string)=>{setNotice(text);window.setTimeout(()=>setNotice(""),2800)},[]);

  const refresh=useCallback(async()=>{
    try{
      const response=await fetch("/api/workspace",{cache:"no-store"});
      if(!response.ok) throw new Error();
      const raw=await response.json();
      setData({
        actor:raw.actor,
        products:raw.products.map((p:Record<string,unknown>,i:number)=>({id:String(p.id),name:String(p.name),vendor:String(p.vendor_name||"Store"),price:Number(p.price),stock:Number(p.stock),category:String(p.category),image:productImages[i%productImages.length]})),
        orders:raw.orders,deliveries:raw.deliveries,addresses:raw.addresses||[],
        messages:raw.messages.map((m:Record<string,unknown>)=>({orderId:String(m.order_id),who:String(m.sender_name),text:String(m.body),time:new Date(Number(m.created_at)).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),kind:String(m.sender_role)})),
      });
    }catch{showNotice("We couldn’t refresh your workspace.");}finally{setLoading(false)}
  },[showNotice]);
  useEffect(()=>{const timer=window.setTimeout(refresh,0);return()=>window.clearTimeout(timer)},[refresh]);

  const role=data.actor?.activeRole||"customer";
  const cartCount=[...cart.values()].reduce((a,b)=>a+b,0);
  const activeDelivery=data.deliveries.find(d=>d.status!=="unassigned"&&d.status!=="delivered");
  const add=(id:string)=>setCart(current=>{const next=new Map(current);next.set(id,(next.get(id)||0)+1);return next});
  const subtract=(id:string)=>setCart(current=>{const next=new Map(current);const qty=(next.get(id)||0)-1;if(qty<=0)next.delete(id);else next.set(id,qty);return next});
  const openChat=(orderId?:string)=>{const id=orderId||activeDelivery?.order_id||data.orders[0]?.id;if(!id)return showNotice("No order conversation available.");setSelectedOrder(id);setPanel("chat")};

  const placeOrder=async(address:string)=>{
    const items=[...cart.entries()].map(([id,quantity])=>({id,quantity}));
    setBusy(true);
    try{const result=await api("create_order",{items,address,notes:"Call on arrival"});setCart(new Map());setPanel(null);showNotice(`Order ${result.id} placed`);await refresh()}
    catch(error){showNotice(error instanceof Error?error.message:"Could not place order")}finally{setBusy(false)}
  };
  const updateOrder=async(orderId:string,status:string)=>{setBusy(true);try{await api("update_order",{orderId,status});showNotice(`Order marked ${status}`);await refresh()}catch(error){showNotice(error instanceof Error?error.message:"Update failed")}finally{setBusy(false)}};
  const acceptDelivery=async(deliveryId:string)=>{setBusy(true);try{await api("accept_delivery",{deliveryId});showNotice("Delivery accepted");await refresh()}catch(error){showNotice(error instanceof Error?error.message:"Trip unavailable")}finally{setBusy(false)}};
  const deliveryStep=async(status:string)=>{if(!activeDelivery)return;setBusy(true);try{await api("update_delivery",{deliveryId:activeDelivery.id,status});showNotice("Delivery updated");await refresh()}catch(error){showNotice(error instanceof Error?error.message:"Update failed")}finally{setBusy(false)}};
  const shareLocation=()=>{if(!activeDelivery||!navigator.geolocation)return showNotice("Location is unavailable.");navigator.geolocation.getCurrentPosition(async position=>{try{await api("update_location",{deliveryId:activeDelivery.id,latitude:position.coords.latitude,longitude:position.coords.longitude});showNotice("Live location updated")}catch{showNotice("Could not update location")}},()=>showNotice("Location permission was not granted."),{enableHighAccuracy:true,timeout:10000})};

  if(loading)return <div className="app-loading"><Logo/><div/><span>Loading your workspace</span></div>;
  return <main className="app-frame">
    <Sidebar role={role} tab={tab} setTab={setTab} openChat={()=>openChat()} />
    <section className="app-main">
      <AppHeader actor={data.actor} role={role} cartCount={cartCount} onCart={()=>setPanel("cart")} />
      <div className="app-content">
        {tab==="Home"&&role==="customer"&&<CustomerHome data={data} activeDelivery={activeDelivery} add={add} openChat={openChat}/>}
        {tab==="Home"&&role==="vendor"&&<VendorHome data={data} busy={busy} updateOrder={updateOrder} addProduct={()=>setPanel("product")} openChat={openChat}/>}
        {tab==="Home"&&role==="rider"&&<RiderHome data={data} activeDelivery={activeDelivery} busy={busy} accept={acceptDelivery} step={deliveryStep} location={shareLocation} openChat={openChat}/>}
        {tab==="Orders"&&<OrdersPage data={data} role={role} openChat={openChat}/>}
        {tab==="Messages"&&<MessagesPage data={data} openChat={openChat}/>}
        {tab==="Payments"&&<PaymentsPage data={data} role={role}/>}
        {tab==="Account"&&<AccountPage actor={data.actor} role={role}/>}
      </div>
    </section>
    <MobileNav tab={tab} setTab={setTab} openChat={()=>{setTab("Messages")}}/>
    {panel==="cart"&&<CartPanel cart={cart} products={data.products} defaultAddress={data.addresses[0]?.address||""} busy={busy} close={()=>setPanel(null)} add={add} subtract={subtract} submit={placeOrder}/>}
    {panel==="chat"&&selectedOrder&&<ChatPanel orderId={selectedOrder} messages={data.messages.filter(m=>m.orderId===selectedOrder)} role={role} close={()=>setPanel(null)} send={async body=>{await api("send_message",{orderId:selectedOrder,body});await refresh()}}/>}
    {panel==="product"&&<ProductPanel busy={busy} close={()=>setPanel(null)} save={async product=>{setBusy(true);try{await api("create_product",product);setPanel(null);showNotice("Product published");await refresh()}catch(error){showNotice(error instanceof Error?error.message:"Could not save product")}finally{setBusy(false)}}}/>}
    {notice&&<div className="app-toast"><Check size={16}/>{notice}</div>}
  </main>
}

function Logo(){return <Link className="app-logo" href="/"><span>k</span><b>kola</b></Link>}
const navItems:[Tab,React.ReactNode][]=[["Home",<Home key="home"/>],["Orders",<ClipboardList key="orders"/>],["Messages",<MessageCircle key="messages"/>],["Payments",<WalletCards key="payments"/>],["Account",<CircleUserRound key="account"/>]];

function Sidebar({role,tab,setTab,openChat}:{role:Role;tab:Tab;setTab:(t:Tab)=>void;openChat:()=>void}){
  return <aside className="app-sidebar"><Logo/><div className="workspace-label"><span>{role==="vendor"?"Business workspace":role==="rider"?"Rider workspace":"Customer account"}</span></div><nav>{navItems.map(([label,icon])=><button key={label} className={tab===label?"active":""} onClick={()=>label==="Messages"?openChat():setTab(label)}>{icon}<span>{label}</span></button>)}</nav><div className="sidebar-help"><MessageCircle/><div><b>Need help?</b><span>Contact Kola support</span></div><ChevronRight/></div></aside>
}
function MobileNav({tab,setTab,openChat}:{tab:Tab;setTab:(t:Tab)=>void;openChat:()=>void}){return <nav className="mobile-nav">{navItems.slice(0,5).map(([label,icon])=><button key={label} className={tab===label?"active":""} onClick={()=>label==="Messages"?openChat():setTab(label)}>{icon}<span>{label}</span></button>)}</nav>}
function AppHeader({actor,role,cartCount,onCart}:{actor:Workspace["actor"];role:Role;cartCount:number;onCart:()=>void}){return <header className="app-header"><button className="mobile-menu" aria-label="Menu"><Menu/></button><div className="header-location"><MapPin/><div><span>{role==="customer"?"Delivering to":"Operating in"}</span><b>{actor?.city||"Douala"}</b></div></div><div className="header-actions">{role==="customer"&&<button className="cart-button" onClick={onCart}><ShoppingBag/><span>Bag</span>{cartCount>0&&<b>{cartCount}</b>}</button>}<button className="icon-button" aria-label="Notifications"><Bell/></button><div className="header-profile"><span>{actor?.displayName.split(" ").map(p=>p[0]).join("").slice(0,2)}</span><div><b>{actor?.displayName}</b><small>{role==="vendor"?"Business":role==="rider"?"Delivery rider":"Customer"}</small></div></div></div></header>}

function PageTitle({eyebrow,title,subtitle,action}:{eyebrow:string;title:string;subtitle:string;action?:React.ReactNode}){return <div className="page-title"><div><span>{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>}
function Status({value}:{value:string}){const label=value.replaceAll("_"," ");return <span className={`status status-${value}`}>{label}</span>}
function Empty({icon,title,text}:{icon:React.ReactNode;title:string;text:string}){return <div className="empty"><span>{icon}</span><b>{title}</b><p>{text}</p></div>}

function CustomerHome({data,activeDelivery,add,openChat}:{data:Workspace;activeDelivery?:Delivery;add:(id:string)=>void;openChat:(id?:string)=>void}){
  const [query,setQuery]=useState("");const categories=["All","Food","Groceries","Fashion","Pharmacy"];const [category,setCategory]=useState("All");
  const shown=data.products.filter(p=>(category==="All"||p.category===category)&&p.name.toLowerCase().includes(query.toLowerCase()));
  return <><PageTitle eyebrow="MARKETPLACE" title={`Good ${new Date().getHours()<12?"morning":"afternoon"}, ${data.actor?.displayName.split(" ")[0]}`} subtitle="Order from local businesses and follow delivery from one place."/>
    {activeDelivery&&<article className="live-order"><div className="live-order-head"><div><span className="pulse"/><b>Delivery in progress</b></div><Status value={activeDelivery.status}/></div><div className="live-order-body"><div className="delivery-visual"><Store/><span/><Bike/><span/><MapPin/></div><div className="live-copy"><span>Order {activeDelivery.order_id}</span><h2>{activeDelivery.status==="picked_up"?"Your order is on the way":"Your delivery is moving"}</h2><p>Estimated arrival in 8–12 minutes</p></div><div className="live-actions"><Link href={activeDelivery.tracking_token?`/track/${activeDelivery.tracking_token}`:`/track/${activeDelivery.order_id}`} className="secondary-button">Track order</Link><button className="primary-button" onClick={()=>openChat(activeDelivery.order_id)}><MessageCircle/>Message</button></div></div></article>}
    <section className="catalogue"><div className="catalogue-tools"><div className="search-field"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search products and stores"/></div><div className="category-row">{categories.map(item=><button className={category===item?"active":""} onClick={()=>setCategory(item)} key={item}>{item}</button>)}</div></div><div className="section-bar"><div><h2>Available near you</h2><span>{shown.length} products</span></div></div>{shown.length?<div className="shop-grid">{shown.map(product=><ProductCard key={product.id} product={product} add={()=>add(product.id)}/>)}</div>:<Empty icon={<Search/>} title="No products found" text="Try another search or category."/>}</section>
  </>
}
function ProductCard({product,add}:{product:Product;add:()=>void}){return <article className="shop-card"><div className="shop-image"><img src={product.image} alt=""/>{product.stock<5&&<span>Low stock</span>}<button onClick={add} aria-label={`Add ${product.name}`}><Plus/></button></div><div className="shop-meta"><span>{product.vendor}</span><h3>{product.name}</h3><div><b>{product.price.toLocaleString()} FCFA</b><small>{product.stock} available</small></div></div></article>}

function VendorHome({data,busy,updateOrder,addProduct,openChat}:{data:Workspace;busy:boolean;updateOrder:(id:string,status:string)=>void;addProduct:()=>void;openChat:(id?:string)=>void}){
  const active=data.orders.filter(o=>!["delivered","rejected"].includes(o.status));const revenue=data.orders.filter(o=>o.payment_status==="paid").reduce((sum,o)=>sum+Number(o.total),0);
  return <><PageTitle eyebrow="BUSINESS OVERVIEW" title="Orders and fulfilment" subtitle="Manage incoming orders and coordinate delivery." action={<button className="primary-button" onClick={addProduct}><Plus/>Add product</button>}/><div className="metrics"><Metric label="Active orders" value={String(active.length)} note="Awaiting completion"/><Metric label="Paid sales" value={`${revenue.toLocaleString()} FCFA`} note="Confirmed payments"/><Metric label="Products" value={String(data.products.length)} note="Active catalogue"/><Metric label="Deliveries" value={String(data.deliveries.length)} note="All order deliveries"/></div><div className="dashboard-grid"><section className="surface"><div className="surface-head"><div><h2>Recent orders</h2><span>Update preparation status as your team works.</span></div><button>View all</button></div>{data.orders.length?<div className="order-list">{data.orders.slice(0,7).map(order=><OrderRow key={order.id} order={order} busy={busy} update={updateOrder} chat={()=>openChat(order.id)}/>)}</div>:<Empty icon={<ClipboardList/>} title="No orders yet" text="New customer orders will appear here."/ >}</section><section className="surface compact"><div className="surface-head"><div><h2>Delivery readiness</h2><span>Orders waiting for a rider</span></div></div><div className="readiness-number">{data.deliveries.filter(d=>d.status==="unassigned").length}</div><p>Ready orders should be packed before a rider arrives.</p><div className="info-row"><Clock3/><span>Average pickup</span><b>Not enough data</b></div><div className="info-row"><Truck/><span>Completed today</span><b>{data.deliveries.filter(d=>d.status==="delivered").length}</b></div></section></div></>
}
function Metric({label,value,note}:{label:string;value:string;note:string}){return <article className="metric"><span>{label}</span><b>{value}</b><small>{note}</small></article>}
function OrderRow({order,busy,update,chat}:{order:Order;busy:boolean;update:(id:string,s:string)=>void;chat:()=>void}){const next:Record<string,[string,string]>= {pending:["Accept","accepted"],accepted:["Start preparing","preparing"],preparing:["Ready for pickup","ready"]};return <article className="order-item"><div className="order-id"><span><Package/></span><div><b>{order.id}</b><small>{order.delivery_address}</small></div></div><div className="order-value"><b>{Number(order.total).toLocaleString()} FCFA</b><small>{order.payment_status==="paid"?"Paid":"Cash on delivery"}</small></div><Status value={order.status}/><div className="row-actions">{next[order.status]&&<button disabled={busy} className="primary-button small" onClick={()=>update(order.id,next[order.status][1])}>{next[order.status][0]}</button>}<button className="icon-button" onClick={chat}><MessageCircle/></button></div></article>}

function RiderHome({data,activeDelivery,busy,accept,step,location,openChat}:{data:Workspace;activeDelivery?:Delivery;busy:boolean;accept:(id:string)=>void;step:(s:string)=>void;location:()=>void;openChat:(id?:string)=>void}){
  const available=data.deliveries.filter(d=>d.status==="unassigned");
  return <><PageTitle eyebrow="DELIVERY WORKSPACE" title={activeDelivery?"Complete your active delivery":"Find your next delivery"} subtitle="Review trip details before accepting a request." action={<div className="online-chip"><span/>Online</div>}/>{activeDelivery&&<section className="active-trip"><div className="trip-top"><div><span>ACTIVE DELIVERY · {activeDelivery.order_id}</span><h2>Pickup to {activeDelivery.dropoff_address}</h2></div><Status value={activeDelivery.status}/></div><div className="trip-map"><div className="route-line-ui"><i><Store/></i><span/><i className="rider"><Bike/></i><span/><i><MapPin/></i></div><div className="trip-eta"><span>Estimated arrival</span><b>8–12 min</b><small>{Number(activeDelivery.distance_km||0).toFixed(1)} km remaining</small></div></div><div className="trip-details"><div><span>Pickup</span><b>Vendor location</b></div><div><span>Drop-off</span><b>{activeDelivery.dropoff_address}</b></div><div><span>Your fee</span><b>{Number(activeDelivery.courier_fee).toLocaleString()} FCFA</b></div></div><div className="trip-actions"><button className="secondary-button" onClick={location}><Navigation/>Update location</button><button className="secondary-button" onClick={()=>openChat(activeDelivery.order_id)}><MessageCircle/>Message</button>{activeDelivery.status==="accepted"&&<button disabled={busy} className="primary-button" onClick={()=>step("picked_up")}>Confirm pickup <ArrowRight/></button>}{activeDelivery.status==="picked_up"&&<button disabled={busy} className="primary-button" onClick={()=>step("delivered")}>Confirm delivery <Check/></button>}</div></section>}<section className="surface jobs"><div className="surface-head"><div><h2>Available requests</h2><span>{available.length} near your operating area</span></div></div>{available.length?<div className="job-list">{available.map(delivery=><article key={delivery.id}><div className="job-route"><i/><span/><i/></div><div className="job-copy"><b>Vendor pickup → {delivery.dropoff_address}</b><span>{Number(delivery.distance_km||0).toFixed(1)} km · Order {delivery.order_id}</span></div><div className="job-fee"><b>{Number(delivery.courier_fee).toLocaleString()} FCFA</b><span>Delivery fee</span></div><button disabled={busy} className="primary-button small" onClick={()=>accept(delivery.id)}>Accept</button></article>)}</div>:<Empty icon={<Bike/>} title="No requests nearby" text="New delivery requests will appear here automatically."/>}</section></>
}

function OrdersPage({data,role,openChat}:{data:Workspace;role:Role;openChat:(id?:string)=>void}){return <><PageTitle eyebrow={role.toUpperCase()} title="Orders" subtitle="A complete record of your orders and delivery status."/><section className="surface">{data.orders.length?<div className="order-list">{data.orders.map(order=><article className="order-item" key={order.id}><div className="order-id"><span><Package/></span><div><b>{order.id}</b><small>{order.delivery_address}</small></div></div><div className="order-value"><b>{Number(order.total).toLocaleString()} FCFA</b><small>{order.payment_status}</small></div><Status value={order.status}/><div className="row-actions"><Link className="secondary-button small" href={`/track/${data.deliveries.find(d=>d.order_id===order.id)?.tracking_token||order.id}`}>Track</Link><button className="icon-button" onClick={()=>openChat(order.id)}><MessageCircle/></button></div></article>)}</div>:<Empty icon={<ClipboardList/>} title="No orders" text="Your order history will appear here."/>}</section></>}
function MessagesPage({data,openChat}:{data:Workspace;openChat:(id?:string)=>void}){const ids=[...new Set(data.messages.map(m=>m.orderId))];return <><PageTitle eyebrow="COMMUNICATION" title="Order conversations" subtitle="Messages are only visible to participants in each order."/><section className="surface conversation-list">{ids.length?ids.map(id=>{const messages=data.messages.filter(m=>m.orderId===id);const last=messages[messages.length-1];return <button key={id} onClick={()=>openChat(id)}><span><MessageCircle/></span><div><b>Order {id}</b><p>{last?.text}</p></div><small>{last?.time}</small><ChevronRight/></button>}):<Empty icon={<MessageCircle/>} title="No conversations" text="Messages about active orders will appear here."/>}</section></>}
function PaymentsPage({data,role}:{data:Workspace;role:Role}){const paid=data.orders.filter(o=>o.payment_status==="paid").reduce((s,o)=>s+Number(o.total),0);return <><PageTitle eyebrow="FINANCE" title={role==="customer"?"Payments":"Settlements"} subtitle="Cash on delivery is enabled for the MVP."/><div className="metrics payments"><Metric label="Confirmed" value={`${paid.toLocaleString()} FCFA`} note="Recorded paid orders"/><Metric label="Pending cash orders" value={String(data.orders.filter(o=>o.payment_status==="pending").length)} note="Collected on delivery"/><Metric label="Mobile Money" value="Not connected" note="Provider credentials required"/></div><section className="surface"><Empty icon={<WalletCards/>} title="No online transactions" text="Mobile Money and payout transactions will appear here after a payment provider is connected."/></section></>}
function AccountPage({actor,role}:{actor:Workspace["actor"];role:Role}){return <><PageTitle eyebrow="ACCOUNT" title="Profile and security" subtitle="Manage your account and sign-in session."/><section className="profile-surface"><div className="profile-large">{actor?.displayName.split(" ").map(p=>p[0]).join("").slice(0,2)}</div><div><h2>{actor?.displayName}</h2><p>{role==="vendor"?"Business account":role==="rider"?"Delivery rider account":"Customer account"} · {actor?.city||"Cameroon"}</p></div><a className="secondary-button" href="/signout-with-chatgpt?return_to=%2F">Sign out</a></section><div className="settings-list">{["Personal information","Saved addresses","Notifications","Language","Privacy and security"].map(item=><button key={item}><span>{item}</span><ChevronRight/></button>)}</div></>}

function Drawer({title,subtitle,close,children}:{title:string;subtitle?:string;close:()=>void;children:React.ReactNode}){return <div className="drawer-layer"><button className="drawer-backdrop" onClick={close} aria-label="Close"/><aside className="app-drawer"><header><button onClick={close}><ArrowLeft/></button><div><h2>{title}</h2>{subtitle&&<span>{subtitle}</span>}</div><button onClick={close}><X/></button></header>{children}</aside></div>}
function CartPanel({cart,products,defaultAddress,busy,close,add,subtract,submit}:{cart:Map<string,number>;products:Product[];defaultAddress:string;busy:boolean;close:()=>void;add:(id:string)=>void;subtract:(id:string)=>void;submit:(address:string)=>void}){const [address,setAddress]=useState(defaultAddress);const lines=[...cart.entries()].map(([id,qty])=>({product:products.find(p=>p.id===id),qty})).filter(line=>line.product) as {product:Product;qty:number}[];const subtotal=lines.reduce((sum,line)=>sum+line.product.price*line.qty,0);return <Drawer title="Your bag" subtitle={`${lines.length} items`} close={close}><div className="drawer-body cart-body">{lines.length?lines.map(({product,qty})=><article className="cart-line" key={product.id}><img src={product.image} alt=""/><div><b>{product.name}</b><span>{product.vendor}</span><strong>{product.price.toLocaleString()} FCFA</strong></div><div className="quantity"><button onClick={()=>subtract(product.id)}><Minus/></button><b>{qty}</b><button onClick={()=>add(product.id)}><Plus/></button></div></article>):<Empty icon={<ShoppingBag/>} title="Your bag is empty" text="Add products to start an order."/>}{lines.length>0&&<><label className="field-label">Delivery address<textarea value={address} onChange={e=>setAddress(e.target.value)} placeholder="Street, neighbourhood and landmark"/></label><div className="payment-option"><span><WalletCards/></span><div><b>Cash on delivery</b><small>Pay when your order arrives</small></div><Check/></div><div className="checkout-summary"><span>Subtotal <b>{subtotal.toLocaleString()} FCFA</b></span><span>Delivery <b>1,500 FCFA</b></span><span className="grand-total">Total <b>{(subtotal+1500).toLocaleString()} FCFA</b></span></div><button disabled={busy||address.trim().length<5} className="primary-button checkout-submit" onClick={()=>submit(address)}>{busy?"Placing order…":<>Place order <ArrowRight/></>}</button></>}</div></Drawer>}
function ChatPanel({orderId,messages,role,close,send}:{orderId:string;messages:Message[];role:Role;close:()=>void;send:(body:string)=>Promise<void>}){const [draft,setDraft]=useState("");const [sending,setSending]=useState(false);const submit=async()=>{if(!draft.trim())return;const body=draft;setDraft("");setSending(true);try{await send(body)}finally{setSending(false)}};return <Drawer title={`Order ${orderId}`} subtitle="Customer · Vendor · Rider" close={close}><div className="chat-body"><div className="chat-notice"><Truck/><span>Messages are shared with everyone involved in this delivery.</span></div><div className="chat-messages">{messages.length?messages.map((message,index)=><article className={message.kind===role?"mine":""} key={`${message.time}-${index}`}><b>{message.who}</b><p>{message.text}</p><span>{message.time}</span></article>):<Empty icon={<MessageCircle/>} title="Start the conversation" text="Send a message about this order."/ >}</div><div className="chat-compose"><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Write a message"/><button disabled={sending||!draft.trim()} onClick={submit}><ArrowRight/></button></div></div></Drawer>}
function ProductPanel({busy,close,save}:{busy:boolean;close:()=>void;save:(p:Record<string,unknown>)=>Promise<void>}){const [name,setName]=useState("");const [description,setDescription]=useState("");const [category,setCategory]=useState("Food");const [price,setPrice]=useState("");const [stock,setStock]=useState("10");return <Drawer title="Add product" subtitle="Publish to your storefront" close={close}><div className="drawer-body form-body"><label className="field-label">Product name<input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Grilled fish platter"/></label><label className="field-label">Description<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe what the customer receives"/></label><div className="form-grid"><label className="field-label">Category<select value={category} onChange={e=>setCategory(e.target.value)}><option>Food</option><option>Groceries</option><option>Fashion</option><option>Pharmacy</option><option>Other</option></select></label><label className="field-label">Stock<input type="number" min="0" value={stock} onChange={e=>setStock(e.target.value)}/></label></div><label className="field-label">Price (FCFA)<input type="number" min="50" value={price} onChange={e=>setPrice(e.target.value)} placeholder="5000"/></label><button disabled={busy||!name.trim()||Number(price)<50} className="primary-button checkout-submit" onClick={()=>save({name,description,category,price:Number(price),stock:Number(stock)})}>{busy?"Publishing…":<>Publish product <ArrowRight/></>}</button></div></Drawer>}
