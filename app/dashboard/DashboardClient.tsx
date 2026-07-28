"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Bell, Bike, Check, ChevronRight, CircleUserRound,
  ClipboardList, Clock3, Home, ImagePlus, MapPin, Menu, MessageCircle, Mic,
  Minus, Navigation, Package, Plus, Search, ShoppingBag, Square, Store, Truck,
  WalletCards, X, Star
} from "lucide-react";
import OrderCall from "./OrderCall";
import OrderChat from "./OrderChat";
import { AccountCenter, PaymentCenter } from "./PlatformCenter";

type Role = "customer" | "vendor" | "rider";
type Product = { id:string;vendorId:string;vendorSlug?:string;name:string;vendor:string;price:number;stock:number;category:string;description:string;image:string;active:boolean };
type Order = { id:string;status:string;total:number;payment_status:string;delivery_address:string;discount?:number;promotion_code?:string };
type Delivery = { id:string;order_id:string;status:string;courier_id?:string;courier_fee:number;distance_km:number;dropoff_address:string;tracking_token?:string };
type Message = { id:string;orderId:string;senderId:string;who:string;text:string;time:string;createdAt:number;kind:string;type:"text"|"image"|"audio";mediaUrl?:string;durationMs?:number;status?:"sent"|"delivered"|"read" };
type Address = { id:string;address:string;city:string;instructions:string };
type Workspace = { products:Product[];orders:Order[];deliveries:Delivery[];messages:Message[];addresses:Address[];actor?:{id:string;displayName:string;activeRole:Role;city?:string;phone?:string;authProvider?:"whatsapp";vendorId?:string;vendorSlug?:string;isAdmin?:boolean} };
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
  const [editingProduct,setEditingProduct]=useState<Product|null>(null);
  const [reviewOrder,setReviewOrder]=useState<string|null>(null);
  const [accountSection,setAccountSection]=useState("overview");
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [sharingLocation,setSharingLocation]=useState(false);
  const locationWatchRef=useRef<number|null>(null);
  const locationSentAtRef=useRef(0);
  const showNotice=useCallback((text:string)=>{setNotice(text);window.setTimeout(()=>setNotice(""),2800)},[]);

  const refresh=useCallback(async()=>{
    try{
      const response=await fetch("/api/workspace",{cache:"no-store"});
      if(!response.ok) throw new Error();
      const raw=await response.json();
      setData({
        actor:raw.actor,
        products:raw.products.map((p:Record<string,unknown>,i:number)=>({id:String(p.id),vendorId:String(p.vendor_id),vendorSlug:p.vendor_slug?String(p.vendor_slug):undefined,name:String(p.name),vendor:String(p.vendor_name||"Store"),price:Number(p.price),stock:Number(p.stock),category:String(p.category),description:String(p.description||""),image:p.image_key?`/api/product-media/${String(p.id)}`:productImages[i%productImages.length],active:Boolean(p.active)})),
        orders:raw.orders,deliveries:raw.deliveries,addresses:raw.addresses||[],
        messages:raw.messages.map((m:Record<string,unknown>)=>({id:String(m.id),orderId:String(m.order_id),senderId:String(m.sender_id),who:String(m.sender_name),text:String(m.body),time:new Date(Number(m.created_at)).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),createdAt:Number(m.created_at),kind:String(m.sender_role),type:String(m.message_type||"text") as Message["type"],mediaUrl:m.media_key?`/api/media/${String(m.id)}`:undefined,durationMs:Number(m.duration_ms||0),status:"sent"})),
      });
    }catch{showNotice("We couldn’t refresh your workspace.");}finally{setLoading(false)}
  },[showNotice]);
  useEffect(()=>{const timer=window.setTimeout(refresh,0);return()=>window.clearTimeout(timer)},[refresh]);
  useEffect(()=>{if(!data.actor?.id)return;const check=async()=>{try{const response=await fetch("/api/calls?inbox=1",{cache:"no-store"});if(!response.ok)return;const result=await response.json();if(result.call?.order_id){setSelectedOrder(String(result.call.order_id));setPanel("chat")}}catch{}};void check();const timer=window.setInterval(check,3000);return()=>window.clearInterval(timer)},[data.actor?.id]);

  const role=data.actor?.activeRole||"customer";
  const cartCount=[...cart.values()].reduce((a,b)=>a+b,0);
  const activeDelivery=data.deliveries.find(d=>d.status!=="unassigned"&&d.status!=="delivered");
  const add=(id:string)=>setCart(current=>{const next=new Map(current);next.set(id,(next.get(id)||0)+1);return next});
  const subtract=(id:string)=>setCart(current=>{const next=new Map(current);const qty=(next.get(id)||0)-1;if(qty<=0)next.delete(id);else next.set(id,qty);return next});
  const openChat=(orderId?:string)=>{const id=orderId||activeDelivery?.order_id||data.orders[0]?.id;if(!id)return showNotice("No order conversation available.");setSelectedOrder(id);setPanel("chat")};

  const placeOrder=async(address:string,promotionCode="",coordinates?:{latitude:number;longitude:number})=>{
    const items=[...cart.entries()].map(([id,quantity])=>({id,quantity}));
    setBusy(true);
    try{const result=await api("create_order",{items,address,promotionCode,...coordinates,notes:"Call on arrival"});setCart(new Map());setPanel(null);showNotice(result.split?`${result.ids.length} store orders placed`:`Order ${result.id} placed`);await refresh()}
    catch(error){showNotice(error instanceof Error?error.message:"Could not place order")}finally{setBusy(false)}
  };
  const updateOrder=async(orderId:string,status:string)=>{setBusy(true);try{await api("update_order",{orderId,status});showNotice(`Order marked ${status}`);await refresh()}catch(error){showNotice(error instanceof Error?error.message:"Update failed")}finally{setBusy(false)}};
  const cancelOrder=async(orderId:string)=>{setBusy(true);try{await api("cancel_order",{orderId,reason:"Cancelled from Kola dashboard"});showNotice("Order cancelled");await refresh()}catch(error){showNotice(error instanceof Error?error.message:"Could not cancel order")}finally{setBusy(false)}};
  const toggleProduct=async(id:string)=>{setBusy(true);try{await api("toggle_product",{id});showNotice("Product availability updated");await refresh()}catch(error){showNotice(error instanceof Error?error.message:"Could not update product")}finally{setBusy(false)}};
  const acceptDelivery=async(deliveryId:string)=>{setBusy(true);try{await api("accept_delivery",{deliveryId});showNotice("Delivery accepted");await refresh()}catch(error){showNotice(error instanceof Error?error.message:"Trip unavailable")}finally{setBusy(false)}};
  const deliveryStep=async(status:string)=>{if(!activeDelivery)return;setBusy(true);try{await api("update_delivery",{deliveryId:activeDelivery.id,status});showNotice("Delivery updated");await refresh()}catch(error){showNotice(error instanceof Error?error.message:"Update failed")}finally{setBusy(false)}};
  const shareLocation=()=>{if(!activeDelivery||!navigator.geolocation)return showNotice("Location is unavailable.");if(locationWatchRef.current!==null){navigator.geolocation.clearWatch(locationWatchRef.current);locationWatchRef.current=null;setSharingLocation(false);showNotice("Live location sharing stopped");return}locationWatchRef.current=navigator.geolocation.watchPosition(async position=>{if(Date.now()-locationSentAtRef.current<8000)return;locationSentAtRef.current=Date.now();try{await api("update_location",{deliveryId:activeDelivery.id,latitude:position.coords.latitude,longitude:position.coords.longitude});setSharingLocation(true)}catch{showNotice("Could not update live location")}},()=>{setSharingLocation(false);showNotice("Location permission was not granted.")},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});setSharingLocation(true);showNotice("Live location sharing started")};
  useEffect(()=>()=>{if(locationWatchRef.current!==null&&navigator.geolocation)navigator.geolocation.clearWatch(locationWatchRef.current)},[]);

  if(loading)return <div className="app-loading"><Logo/><div/><span>Loading your workspace</span></div>;
  return <main className="app-frame">
    <Sidebar role={role} tab={tab} setTab={setTab} openChat={()=>openChat()} />
    <section className="app-main">
      <AppHeader actor={data.actor} role={role} cartCount={cartCount} onCart={()=>setPanel("cart")} onNotifications={()=>{setAccountSection("notifications");setTab("Account")}} />
      <div className="app-content">
        {tab==="Home"&&role==="customer"&&<CustomerHome data={data} activeDelivery={activeDelivery} add={add} openChat={openChat}/>}
        {tab==="Home"&&role==="vendor"&&<VendorHome data={data} busy={busy} updateOrder={updateOrder} addProduct={()=>{setEditingProduct(null);setPanel("product")}} editProduct={product=>{setEditingProduct(product);setPanel("product")}} toggleProduct={toggleProduct} openChat={openChat}/>}
        {tab==="Home"&&role==="rider"&&<RiderHome data={data} activeDelivery={activeDelivery} busy={busy} accept={acceptDelivery} step={deliveryStep} location={shareLocation} sharingLocation={sharingLocation} openChat={openChat}/>}
        {tab==="Orders"&&<OrdersPage data={data} role={role} busy={busy} cancelOrder={cancelOrder} reviewOrder={id=>setReviewOrder(id)} openChat={openChat}/>}
        {tab==="Messages"&&<MessagesPage data={data} openChat={openChat}/>}
        {tab==="Payments"&&<PaymentsPage data={data} role={role} onNotice={showNotice}/>}
        {tab==="Account"&&<AccountPage data={data} actor={data.actor} role={role} initialSection={accountSection} onNotice={showNotice}/>}
      </div>
    </section>
    <MobileNav tab={tab} setTab={setTab} openChat={()=>{setTab("Messages")}}/>
    {panel==="cart"&&<CartPanel cart={cart} products={data.products} defaultAddress={data.addresses[0]?.address||""} busy={busy} close={()=>setPanel(null)} add={add} subtract={subtract} submit={placeOrder}/>}
    {panel==="chat"&&selectedOrder&&data.actor&&<OrderChat orderId={selectedOrder} initialMessages={data.messages.filter(m=>m.orderId===selectedOrder)} actorId={data.actor.id} close={()=>{setPanel(null);void refresh()}} onNotice={showNotice}/>}
    {panel==="product"&&<ProductPanel product={editingProduct} busy={busy} close={()=>setPanel(null)} onNotice={showNotice} save={async product=>{setBusy(true);try{const result=await api(editingProduct?"update_product":"create_product",editingProduct?{...product,id:editingProduct.id}:product);showNotice(editingProduct?"Product updated":"Product published");await refresh();return String(result.id)}catch(error){showNotice(error instanceof Error?error.message:"Could not save product");return null}finally{setBusy(false)}}}/>}
    {reviewOrder&&<ReviewPanel orderId={reviewOrder} close={()=>setReviewOrder(null)} onNotice={showNotice} onSaved={refresh}/>}
    {notice&&<div className="app-toast"><Check size={16}/>{notice}</div>}
  </main>
}

function Logo(){return <Link className="app-logo" href="/"><span>k</span><b>kola</b></Link>}
const navItems:[Tab,React.ReactNode][]=[["Home",<Home key="home"/>],["Orders",<ClipboardList key="orders"/>],["Messages",<MessageCircle key="messages"/>],["Payments",<WalletCards key="payments"/>],["Account",<CircleUserRound key="account"/>]];

function Sidebar({role,tab,setTab,openChat}:{role:Role;tab:Tab;setTab:(t:Tab)=>void;openChat:()=>void}){
  return <aside className="app-sidebar"><Logo/><div className="workspace-label"><span>{role==="vendor"?"Business workspace":role==="rider"?"Rider workspace":"Customer account"}</span></div><nav>{navItems.map(([label,icon])=><button key={label} className={tab===label?"active":""} onClick={()=>label==="Messages"?openChat():setTab(label)}>{icon}<span>{label}</span></button>)}</nav><div className="sidebar-help"><MessageCircle/><div><b>Need help?</b><span>Contact Kola support</span></div><ChevronRight/></div></aside>
}
function MobileNav({tab,setTab,openChat}:{tab:Tab;setTab:(t:Tab)=>void;openChat:()=>void}){return <nav className="mobile-nav">{navItems.slice(0,5).map(([label,icon])=><button key={label} className={tab===label?"active":""} onClick={()=>label==="Messages"?openChat():setTab(label)}>{icon}<span>{label}</span></button>)}</nav>}
function AppHeader({actor,role,cartCount,onCart,onNotifications}:{actor:Workspace["actor"];role:Role;cartCount:number;onCart:()=>void;onNotifications:()=>void}){return <header className="app-header"><button className="mobile-menu" aria-label="Menu"><Menu/></button><div className="header-location"><MapPin/><div><span>{role==="customer"?"Delivering to":"Operating in"}</span><b>{actor?.city||"Douala"}</b></div></div><div className="header-actions">{role==="customer"&&<button className="cart-button" onClick={onCart}><ShoppingBag/><span>Bag</span>{cartCount>0&&<b>{cartCount}</b>}</button>}<button className="icon-button" aria-label="Notifications" onClick={onNotifications}><Bell/></button><div className="header-profile"><span>{actor?.displayName.split(" ").map(p=>p[0]).join("").slice(0,2)}</span><div><b>{actor?.displayName}</b><small>{role==="vendor"?"Business":role==="rider"?"Delivery rider":"Customer"}</small></div></div></div></header>}

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

function VendorHome({data,busy,updateOrder,addProduct,editProduct,toggleProduct,openChat}:{data:Workspace;busy:boolean;updateOrder:(id:string,status:string)=>void;addProduct:()=>void;editProduct:(product:Product)=>void;toggleProduct:(id:string)=>void;openChat:(id?:string)=>void}){
  const active=data.orders.filter(o=>!["delivered","rejected","cancelled"].includes(o.status));const revenue=data.orders.filter(o=>o.payment_status==="paid").reduce((sum,o)=>sum+Number(o.total),0);const products=data.products.filter(product=>product.vendorId===data.actor?.vendorId);
  return <><PageTitle eyebrow="BUSINESS OVERVIEW" title="Orders and fulfilment" subtitle="Manage incoming orders, products and delivery." action={<div className="page-actions">{data.actor?.vendorSlug&&<Link className="secondary-button" href={`/store/${data.actor.vendorSlug}`} target="_blank">View storefront</Link>}<button className="primary-button" onClick={addProduct}><Plus/>Add product</button></div>}/><div className="metrics"><Metric label="Active orders" value={String(active.length)} note="Awaiting completion"/><Metric label="Paid sales" value={`${revenue.toLocaleString()} FCFA`} note="Confirmed payments"/><Metric label="Products" value={String(products.filter(product=>product.active).length)} note="Active catalogue"/><Metric label="Deliveries" value={String(data.deliveries.length)} note="All order deliveries"/></div><div className="dashboard-grid"><section className="surface"><div className="surface-head"><div><h2>Recent orders</h2><span>Update preparation status as your team works.</span></div><button>View all</button></div>{data.orders.length?<div className="order-list">{data.orders.slice(0,7).map(order=><OrderRow key={order.id} order={order} busy={busy} update={updateOrder} chat={()=>openChat(order.id)}/>)}</div>:<Empty icon={<ClipboardList/>} title="No orders yet" text="New customer orders will appear here."/ >}</section><section className="surface compact"><div className="surface-head"><div><h2>Delivery readiness</h2><span>Orders waiting for a rider</span></div></div><div className="readiness-number">{data.deliveries.filter(d=>d.status==="unassigned").length}</div><p>Ready orders should be packed before a rider arrives.</p><div className="info-row"><Clock3/><span>Average pickup</span><b>Not enough data</b></div><div className="info-row"><Truck/><span>Completed today</span><b>{data.deliveries.filter(d=>d.status==="delivered").length}</b></div></section></div><section className="surface product-management"><div className="surface-head"><div><h2>Product catalogue</h2><span>Edit inventory, pricing, images and storefront availability.</span></div><button onClick={addProduct}>Add product</button></div>{products.length?<div className="vendor-product-list">{products.map(product=><article className={!product.active?"inactive":""} key={product.id}><img src={product.image} alt=""/><div><b>{product.name}</b><span>{product.category} · {product.stock} in stock</span></div><strong>{product.price.toLocaleString()} FCFA</strong><button className="secondary-button small" onClick={()=>editProduct(product)}>Edit</button><button disabled={busy} className={product.active?"archive-button":"restore-button"} onClick={()=>toggleProduct(product.id)}>{product.active?"Pause":"Restore"}</button></article>)}</div>:<Empty icon={<Package/>} title="No products" text="Add your first product to publish the storefront."/ >}</section></>
}
function Metric({label,value,note}:{label:string;value:string;note:string}){return <article className="metric"><span>{label}</span><b>{value}</b><small>{note}</small></article>}
function OrderRow({order,busy,update,chat}:{order:Order;busy:boolean;update:(id:string,s:string)=>void;chat:()=>void}){const next:Record<string,[string,string]>= {pending:["Accept","accepted"],accepted:["Start preparing","preparing"],preparing:["Ready for pickup","ready"]};return <article className="order-item"><div className="order-id"><span><Package/></span><div><b>{order.id}</b><small>{order.delivery_address}</small></div></div><div className="order-value"><b>{Number(order.total).toLocaleString()} FCFA</b><small>{order.payment_status==="paid"?"Paid":"Cash on delivery"}</small></div><Status value={order.status}/><div className="row-actions">{next[order.status]&&<button disabled={busy} className="primary-button small" onClick={()=>update(order.id,next[order.status][1])}>{next[order.status][0]}</button>}<button className="icon-button" onClick={chat}><MessageCircle/></button></div></article>}

function RiderHome({data,activeDelivery,busy,accept,step,location,sharingLocation,openChat}:{data:Workspace;activeDelivery?:Delivery;busy:boolean;accept:(id:string)=>void;step:(s:string)=>void;location:()=>void;sharingLocation:boolean;openChat:(id?:string)=>void}){
  const available=data.deliveries.filter(d=>d.status==="unassigned");
  return <><PageTitle eyebrow="DELIVERY WORKSPACE" title={activeDelivery?"Complete your active delivery":"Find your next delivery"} subtitle="Review trip details before accepting a request." action={<div className="online-chip"><span/>Online</div>}/>{activeDelivery&&<section className="active-trip"><div className="trip-top"><div><span>ACTIVE DELIVERY · {activeDelivery.order_id}</span><h2>Pickup to {activeDelivery.dropoff_address}</h2></div><Status value={activeDelivery.status}/></div><div className="trip-map"><div className="route-line-ui"><i><Store/></i><span/><i className="rider"><Bike/></i><span/><i><MapPin/></i></div><div className="trip-eta"><span>Estimated arrival</span><b>8–12 min</b><small>{Number(activeDelivery.distance_km||0).toFixed(1)} km remaining</small></div></div><div className="trip-details"><div><span>Pickup</span><b>Vendor location</b></div><div><span>Drop-off</span><b>{activeDelivery.dropoff_address}</b></div><div><span>Your fee</span><b>{Number(activeDelivery.courier_fee).toLocaleString()} FCFA</b></div></div><div className="trip-actions"><button className={`secondary-button ${sharingLocation?"location-live":""}`} onClick={location}><Navigation/>{sharingLocation?"Stop live location":"Share live location"}</button><button className="secondary-button" onClick={()=>openChat(activeDelivery.order_id)}><MessageCircle/>Message</button>{activeDelivery.status==="accepted"&&<button disabled={busy} className="primary-button" onClick={()=>step("picked_up")}>Confirm pickup <ArrowRight/></button>}{activeDelivery.status==="picked_up"&&<button disabled={busy} className="primary-button" onClick={()=>step("delivered")}>Confirm delivery <Check/></button>}</div></section>}<section className="surface jobs"><div className="surface-head"><div><h2>Available requests</h2><span>{available.length} near your operating area</span></div></div>{available.length?<div className="job-list">{available.map(delivery=><article key={delivery.id}><div className="job-route"><i/><span/><i/></div><div className="job-copy"><b>Vendor pickup → {delivery.dropoff_address}</b><span>{Number(delivery.distance_km||0).toFixed(1)} km · Order {delivery.order_id}</span></div><div className="job-fee"><b>{Number(delivery.courier_fee).toLocaleString()} FCFA</b><span>Delivery fee</span></div><button disabled={busy} className="primary-button small" onClick={()=>accept(delivery.id)}>Accept</button></article>)}</div>:<Empty icon={<Bike/>} title="No requests nearby" text="New delivery requests will appear here automatically."/>}</section></>
}

function OrdersPage({data,role,busy,cancelOrder,reviewOrder,openChat}:{data:Workspace;role:Role;busy:boolean;cancelOrder:(id:string)=>void;reviewOrder:(id:string)=>void;openChat:(id?:string)=>void}){return <><PageTitle eyebrow={role.toUpperCase()} title="Orders" subtitle="A complete record of your orders, payments and delivery status."/><section className="surface">{data.orders.length?<div className="order-list">{data.orders.map(order=><article className="order-item" key={order.id}><div className="order-id"><span><Package/></span><div><b>{order.id}</b><small>{order.delivery_address}{order.promotion_code?` · ${order.promotion_code}`:""}</small></div></div><div className="order-value"><b>{Number(order.total).toLocaleString()} FCFA</b><small>{order.payment_status}{Number(order.discount||0)>0?` · saved ${Number(order.discount).toLocaleString()}`:""}</small></div><Status value={order.status}/><div className="row-actions">{order.status!=="cancelled"&&<Link className="secondary-button small" href={`/track/${data.deliveries.find(d=>d.order_id===order.id)?.tracking_token||order.id}`}>Track</Link>}{role==="customer"&&order.status==="pending"&&<button disabled={busy} className="secondary-button small danger" onClick={()=>cancelOrder(order.id)}>Cancel</button>}{role==="customer"&&order.status==="delivered"&&<button className="secondary-button small" onClick={()=>reviewOrder(order.id)}>Review</button>}<button className="icon-button" onClick={()=>openChat(order.id)}><MessageCircle/></button></div></article>)}</div>:<Empty icon={<ClipboardList/>} title="No orders" text="Your order history will appear here."/>}</section></>}
function MessagesPage({data,openChat}:{data:Workspace;openChat:(id?:string)=>void}){const ids=[...new Set([...data.orders.map(order=>order.id),...data.messages.map(message=>message.orderId)])].sort((a,b)=>{const aLast=data.messages.filter(message=>message.orderId===a).at(-1)?.createdAt||0;const bLast=data.messages.filter(message=>message.orderId===b).at(-1)?.createdAt||0;return bLast-aLast});return <><PageTitle eyebrow="COMMUNICATION" title="Order conversations" subtitle="Fast, private conversations shared by the customer, vendor and assigned rider."/><section className="surface conversation-list whatsapp-list">{ids.length?ids.map(id=>{const messages=data.messages.filter(m=>m.orderId===id);const last=messages.at(-1);const preview=last?.type==="image"?"Photo":last?.type==="audio"?"Voice note":last?.text||"Start a conversation";return <button key={id} onClick={()=>openChat(id)}><span>{id.slice(-2).toUpperCase()}</span><div><b>Order {id}</b><p>{last?.type==="audio"&&<Mic/>}{last?.type==="image"&&<ImagePlus/>}{preview}</p></div><small>{last?.time}</small><ChevronRight/></button>}):<Empty icon={<MessageCircle/>} title="No conversations" text="Place or receive an order to start messaging."/ >}</section></>}
function PaymentsPage({data,role,onNotice}:{data:Workspace;role:Role;onNotice:(message:string)=>void}){const paid=data.orders.filter(o=>o.payment_status==="paid").reduce((s,o)=>s+Number(o.total),0);return <><PageTitle eyebrow="FINANCE" title={role==="customer"?"Payments":"Settlements"} subtitle="Cash collection is active; Mobile Money providers are safely activation-gated."/><div className="metrics payments"><Metric label="Confirmed" value={`${paid.toLocaleString()} FCFA`} note="Recorded paid orders"/><Metric label="Pending cash orders" value={String(data.orders.filter(o=>o.payment_status==="pending").length)} note="Collected on delivery"/><Metric label="Payment methods" value="3" note="Cash, MTN MoMo, Orange Money"/></div>{role==="customer"?<PaymentCenter orders={data.orders} phone={data.actor?.phone} onNotice={onNotice}/>:<section className="surface"><Empty icon={<WalletCards/>} title="Settlements overview" text="Completed delivery and sales earnings are included in your Account analytics."/></section>}</>}
function AccountPage({data,actor,role,initialSection,onNotice}:{data:Workspace;actor:Workspace["actor"];role:Role;initialSection:string;onNotice:(message:string)=>void}){return <><PageTitle eyebrow="ACCOUNT" title="Account and operations" subtitle="Manage profile, addresses, notifications, support and integrations."/><section className="profile-surface"><div className="profile-large">{actor?.displayName.split(" ").map(p=>p[0]).join("").slice(0,2)}</div><div><h2>{actor?.displayName}</h2><p>{role==="vendor"?"Business account":role==="rider"?"Delivery rider account":"Customer account"} · {actor?.city||"Cameroon"}</p></div><a className="secondary-button" href="/api/auth/logout?return_to=%2F">Sign out</a></section><AccountCenter key={initialSection} role={role} orders={data.orders} initialSection={initialSection} onNotice={onNotice}/></>}

function Drawer({title,subtitle,close,children}:{title:string;subtitle?:string;close:()=>void;children:React.ReactNode}){return <div className="drawer-layer"><button className="drawer-backdrop" onClick={close} aria-label="Close"/><aside className="app-drawer"><header><button onClick={close}><ArrowLeft/></button><div><h2>{title}</h2>{subtitle&&<span>{subtitle}</span>}</div><button onClick={close}><X/></button></header>{children}</aside></div>}
function CartPanel({cart,products,defaultAddress,busy,close,add,subtract,submit}:{cart:Map<string,number>;products:Product[];defaultAddress:string;busy:boolean;close:()=>void;add:(id:string)=>void;subtract:(id:string)=>void;submit:(address:string,promotionCode:string,coordinates?:{latitude:number;longitude:number})=>void}){const [address,setAddress]=useState(defaultAddress);const [promotionCode,setPromotionCode]=useState("");const [coordinates,setCoordinates]=useState<{latitude:number;longitude:number}|undefined>();const lines=[...cart.entries()].map(([id,qty])=>({product:products.find(p=>p.id===id),qty})).filter(line=>line.product) as {product:Product;qty:number}[];const subtotal=lines.reduce((sum,line)=>sum+line.product.price*line.qty,0);const storeCount=new Set(lines.map(line=>line.product.vendorId)).size;const deliveryFee=storeCount*1500;const locate=()=>navigator.geolocation?.getCurrentPosition(position=>setCoordinates({latitude:position.coords.latitude,longitude:position.coords.longitude}));return <Drawer title="Your bag" subtitle={`${lines.length} items · ${storeCount} ${storeCount===1?"store":"stores"}`} close={close}><div className="drawer-body cart-body">{lines.length?lines.map(({product,qty})=><article className="cart-line" key={product.id}><img src={product.image} alt=""/><div><b>{product.name}</b><span>{product.vendor}</span><strong>{product.price.toLocaleString()} FCFA</strong></div><div className="quantity"><button onClick={()=>subtract(product.id)}><Minus/></button><b>{qty}</b><button onClick={()=>add(product.id)}><Plus/></button></div></article>):<Empty icon={<ShoppingBag/>} title="Your bag is empty" text="Add products to start an order."/>}{lines.length>0&&<><label className="field-label">Delivery address<textarea value={address} onChange={e=>setAddress(e.target.value)} placeholder="Street, neighbourhood and landmark"/></label><button className={`location-pin-button ${coordinates?"active":""}`} onClick={locate}><MapPin/>{coordinates?"Precise location added":"Add precise location"}</button><label className="field-label">Promotion code<input value={promotionCode} onChange={event=>setPromotionCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))} placeholder="Optional store code"/></label>{storeCount>1&&<div className="cart-split-note"><Store/><span>Your bag will create {storeCount} separate store orders with coordinated delivery.</span></div>}<div className="payment-option"><span><WalletCards/></span><div><b>Cash on delivery</b><small>Pay when each order arrives</small></div><Check/></div><div className="checkout-summary"><span>Subtotal <b>{subtotal.toLocaleString()} FCFA</b></span><span>Delivery ({storeCount} {storeCount===1?"store":"stores"}) <b>{deliveryFee.toLocaleString()} FCFA</b></span>{promotionCode&&<span>Promotion <b>Validated at checkout</b></span>}<span className="grand-total">Before discount <b>{(subtotal+deliveryFee).toLocaleString()} FCFA</b></span></div><button disabled={busy||address.trim().length<5} className="primary-button checkout-submit" onClick={()=>submit(address,promotionCode,coordinates)}>{busy?"Placing order…":<>Place {storeCount>1?`${storeCount} orders`:"order"} <ArrowRight/></>}</button></>}</div></Drawer>}
function ChatPanel({
  orderId,
  messages,
  role,
  actorId,
  close,
  onRefresh,
  onNotice,
}: {
  orderId: string;
  messages: Message[];
  role: Role;
  actorId: string;
  close: () => void;
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const cancelRecordingRef = useRef(false);
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => void onRefresh(), 4000);
    return () => window.clearInterval(timer);
  }, [onRefresh]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(
      () =>
        setRecordingSeconds(
          Math.max(1, Math.floor((Date.now() - recordingStartedRef.current) / 1000)),
        ),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      cancelRecordingRef.current = true;
      if (recorder?.state === "recording") recorder.stop();
      recorder?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const submit = async () => {
    if (!draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    setSending(true);
    try {
      await api("send_message", { orderId, body });
      await onRefresh();
    } catch (error) {
      setDraft(body);
      onNotice(error instanceof Error ? error.message : "Could not send the message.");
    } finally {
      setSending(false);
    }
  };

  const upload = async (file: File | Blob, durationMs = 0) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("orderId", orderId);
      form.set("file", file, file instanceof File ? file.name : "voice-note.webm");
      if (durationMs) form.set("durationMs", String(durationMs));
      const response = await fetch("/api/messages/upload", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The attachment failed to send.");
      await onRefresh();
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "The attachment failed to send.",
      );
    } finally {
      setUploading(false);
    }
  };

  const chooseImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onNotice("Choose an image from your device.");
      return;
    }
    void upload(file);
  };

  const toggleRecording = async () => {
    const current = recorderRef.current;
    if (current?.state === "recording") {
      current.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onNotice("Voice notes are not supported on this device.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supported = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        supported ? { mimeType: supported } : undefined,
      );
      recorderRef.current = recorder;
      cancelRecordingRef.current = false;
      recordingChunksRef.current = [];
      recordingStartedRef.current = Date.now();
      setRecordingSeconds(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const duration = Date.now() - recordingStartedRef.current;
        const blob = new Blob(recordingChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        setRecording(false);
        setRecordingSeconds(0);
        if (blob.size && !cancelRecordingRef.current) void upload(blob, duration);
      };
      recorder.start(250);
      setRecording(true);
    } catch {
      onNotice("Allow microphone access to record a voice note.");
    }
  };

  return (
    <Drawer
      title={`Order ${orderId}`}
      subtitle="Customer · Vendor · Rider"
      close={close}
    >
      <div className="chat-body">
        <div className="chat-notice">
          <Truck />
          <span>Messages and calls are private to everyone involved in this order.</span>
          <OrderCall orderId={orderId} actorId={actorId} onNotice={onNotice} />
        </div>

        <div className="chat-messages">
          {messages.length ? (
            messages.map((message) => (
              <article
                className={`${message.kind === role ? "mine" : ""} message-${message.type}`}
                key={message.id}
              >
                <b>{message.who}</b>
                {message.type === "image" && message.mediaUrl ? (
                  <a
                    className="chat-image"
                    href={message.mediaUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img src={message.mediaUrl} alt={`Shared by ${message.who}`} />
                  </a>
                ) : message.type === "audio" && message.mediaUrl ? (
                  <div className="voice-note">
                    <Mic />
                    <audio controls preload="metadata" src={message.mediaUrl} />
                  </div>
                ) : (
                  <p>{message.text}</p>
                )}
                <span>{message.time}</span>
              </article>
            ))
          ) : (
            <Empty
              icon={<MessageCircle />}
              title="Start the conversation"
              text="Send a message, photo, or voice note about this order."
            />
          )}
          <div ref={messageEndRef} />
        </div>

        {recording && (
          <div className="recording-bar">
            <span />
            Recording voice note
            <b>{formatDuration(recordingSeconds)}</b>
            <small>Tap stop to send</small>
          </div>
        )}
        {uploading && <div className="uploading-bar">Sending attachment…</div>}

        <div className="chat-compose">
          <input
            ref={fileInputRef}
            className="chat-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => {
              chooseImage(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <button
            className="compose-tool"
            disabled={uploading || recording}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach an image"
          >
            <ImagePlus />
          </button>
          <input
            value={draft}
            disabled={recording}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void submit()}
            placeholder={recording ? "Recording voice note…" : "Write a message"}
          />
          <button
            className={`compose-tool record-button ${recording ? "active" : ""}`}
            disabled={uploading}
            onClick={toggleRecording}
            aria-label={recording ? "Stop and send voice note" : "Record a voice note"}
          >
            {recording ? <Square /> : <Mic />}
          </button>
          <button
            className="send-button"
            disabled={sending || uploading || recording || !draft.trim()}
            onClick={submit}
            aria-label="Send message"
          >
            <ArrowRight />
          </button>
        </div>
      </div>
    </Drawer>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
function ProductPanel({product,busy,close,save,onNotice}:{product:Product|null;busy:boolean;close:()=>void;save:(p:Record<string,unknown>)=>Promise<string|null>;onNotice:(message:string)=>void}){const [name,setName]=useState(product?.name||"");const [description,setDescription]=useState(product?.description||"");const [category,setCategory]=useState(product?.category||"Food");const [price,setPrice]=useState(product?String(product.price):"");const [stock,setStock]=useState(product?String(product.stock):"10");const [image,setImage]=useState<File|null>(null);const [saving,setSaving]=useState(false);const submit=async()=>{setSaving(true);const id=await save({name,description,category,price:Number(price),stock:Number(stock)});if(!id){setSaving(false);return}if(image){try{const form=new FormData();form.set("productId",id);form.set("file",image);const response=await fetch("/api/products/upload",{method:"POST",body:form});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||"Image upload failed");onNotice("Product image uploaded")}catch(error){onNotice(error instanceof Error?error.message:"Image upload failed")}}setSaving(false);close()};return <Drawer title={product?"Edit product":"Add product"} subtitle="Manage your public storefront catalogue" close={close}><div className="drawer-body form-body"><label className="product-image-upload">{product&&!image?<img src={product.image} alt="Current product"/>:<ImagePlus/>}<span>{image?image.name:"Choose product image"}</span><input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event=>setImage(event.target.files?.[0]||null)}/></label><label className="field-label">Product name<input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Grilled fish platter"/></label><label className="field-label">Description<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe what the customer receives"/></label><div className="form-grid"><label className="field-label">Category<select value={category} onChange={e=>setCategory(e.target.value)}><option>Food</option><option>Groceries</option><option>Fashion</option><option>Pharmacy</option><option>Other</option></select></label><label className="field-label">Stock<input type="number" min="0" value={stock} onChange={e=>setStock(e.target.value)}/></label></div><label className="field-label">Price (FCFA)<input type="number" min="50" value={price} onChange={e=>setPrice(e.target.value)} placeholder="5000"/></label><button disabled={busy||saving||!name.trim()||Number(price)<50} className="primary-button checkout-submit" onClick={submit}>{busy||saving?"Saving…":<>{product?"Save changes":"Publish product"} <ArrowRight/></>}</button></div></Drawer>}

function ReviewPanel({orderId,close,onNotice,onSaved}:{orderId:string;close:()=>void;onNotice:(message:string)=>void;onSaved:()=>Promise<void>}){const [rating,setRating]=useState(5);const [comment,setComment]=useState("");const [busy,setBusy]=useState(false);const submit=async()=>{setBusy(true);try{const response=await fetch("/api/platform",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"create_review",orderId,rating,comment})});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||"Could not save review");onNotice("Thank you for your review");await onSaved();close()}catch(error){onNotice(error instanceof Error?error.message:"Could not save review")}finally{setBusy(false)}};return <Drawer title="Review your order" subtitle={`Order ${orderId}`} close={close}><div className="drawer-body review-panel"><div className="rating-picker">{[1,2,3,4,5].map(value=><button className={value<=rating?"active":""} key={value} onClick={()=>setRating(value)} aria-label={`${value} stars`}><Star/></button>)}</div><h3>{rating>=5?"Excellent":rating>=4?"Very good":rating>=3?"Good":"Needs improvement"}</h3><p>Your rating helps customers choose trusted Kola stores.</p><label className="field-label">Comment<textarea value={comment} onChange={event=>setComment(event.target.value)} placeholder="Tell us about the products and delivery experience"/></label><button className="primary-button checkout-submit" disabled={busy} onClick={submit}>{busy?"Saving…":<>Submit review <ArrowRight/></>}</button></div></Drawer>}
